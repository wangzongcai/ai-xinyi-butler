// =====================================================================
// 心意准备内容 hook（M7 / M8 共用）
// 封装两个准备页（联系人 / 节日）共享的逻辑：
//   * 首次 AI 隐私同意（M7-10）
//   * 祝福语：读取缓存 / 重新生成（M7-07）、数量取设置（M7-08）、
//     失败兜底 + 重试（M7-12）、逐条复制（M7-09）、就地编辑并随缓存保存（M7-11）
//   * 礼物建议：生成（M8-01/04）、固定 4 条（M8-05）、「去看看」跳转（M8-06/07）
// 礼物/贺卡区域是否展示由父页按 settings 开关控制；本 hook 不受开关影响，
// 只提供「生成礼物」的入口方法（loadGifts / regenerate 里一并触发）。
// =====================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  generateBlessings,
  generateGifts,
  type BlessScene,
  type GiftSuggest,
} from '../lib/aiClient';
import { fallbackBlessings } from '../content/fallbackBlessings';
import {
  findPrepare,
  savePrepare,
  type PrepareScene,
} from '../data/prepareRepository';
import { listGifts, saveGifts } from '../data/giftRepository';
import { approvePrivacyConsent, hasPrivacyConsent } from '../lib/privacyConsent';
import { OFFLINE_TIP } from '../lib/network';

export type PrepareScenario = {
  /** prepare.scene：contact / holiday */
  sceneKind: PrepareScene;
  /** 给 Edge Function 的场景：生日 / 纪念日 / 节日 */
  scene: BlessScene;
  /** 节日名称（节日场景） */
  festivalName?: string;
  /** 对方关系 */
  relationship: string;
  /** 对方特征列表（无则通用） */
  traits: string[];
  /** 收件人 id（节日不指定收件人时为 null） */
  personId: string | null;
  /** 节日代码（联系人场景为 null） */
  festivalCode: string | null;
};

export type BlessStatus = 'idle' | 'loading' | 'ready' | 'notraits' | 'error';

function scenarioId(s: PrepareScenario): string {
  return [s.sceneKind, s.personId ?? '', s.festivalCode ?? ''].join('|');
}

const EMPTY: GiftSuggest[] | null = null;

/**
 * 礼物结果的内存缓存（会话级）。真正的落库在 gift_suggestion 表（随账号同步），
 * 这里只是避免同一会话内反复读库；点「换一批 / 重新生成」时强制绕过并覆盖。
 */
const giftCache = new Map<string, GiftSuggest[]>();

/**
 * @param ready 场景数据是否已就绪（关系 / 特征 / 设置都读到最终值）。
 *   为 false 时不发起任何生成：否则首次渲染的空特征会被误判成「没有特征」，
 *   且之后场景键不变、永远不会重算。
 */
export function usePrepareContent(
  scenario: PrepareScenario,
  blessingCount: number,
  giftEnabled = true,
  ready = true,
) {
  /** 隐私同意是否已检查完（避免检查期间就按「未同意」处理） */
  const [consentChecked, setConsentChecked] = useState(false);
  const [consented, setConsented] = useState(false);
  const [consentVisible, setConsentVisible] = useState(false);

  const [blessings, setBlessings] = useState<string[]>([]);
  // 初始即加载态：数据未就绪时展示加载动画，而不是闪一下「祝福语 + 空列表」
  const [blessStatus, setBlessStatus] = useState<BlessStatus>('loading');
  const [blessError, setBlessError] = useState<string | null>(null);
  /** M11-01：失败原因是否为「没有网络」，供页面展示 spec 指定的提示 + 对象信息 */
  const [blessOffline, setBlessOffline] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [cached, setCached] = useState(false);
  /** 当前已持久化的 prepare 记录 id，供生成贺卡时 /card/[prepareId] 引用。 */
  const [prepareId, setPrepareId] = useState<string | null>(null);

  const [gifts, setGifts] = useState<GiftSuggest[] | null>(null);
  const [giftLoading, setGiftLoading] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  /** M11-01：礼物建议是否因无网络失败 */
  const [giftOffline, setGiftOffline] = useState(false);

  const lastIdRef = useRef('');
  const runningRef = useRef(false);

  // 联系人场景且没有任何特征：不生成任何 AI 内容，引导先填特征
  const hasTraits = scenario.traits.some((t) => t.trim().length > 0);

  const makeKey = useCallback(
    (next: PrepareScenario) => ({
      scene: next.sceneKind,
      personId: next.personId,
      festivalCode: next.festivalCode,
    }),
    [],
  );

  // ---------------- 祝福语 ----------------
  const loadBlessings = useCallback(async () => {
    setBlessStatus('loading');
    setBlessError(null);
    setBlessOffline(false);
    try {
      const { blessings: list } = await generateBlessings({
        relationship: scenario.relationship,
        traits: scenario.traits,
        scene: scenario.scene,
        festivalName: scenario.festivalName,
        count: blessingCount,
      });
      if (list.length === 0) throw new Error('返回内容为空');
      setBlessings(list);
      setBlessStatus('ready');
      // M7-07：AI 成功结果写入 prepare，供退出重进与贺卡引用；记录其 id 供贺卡跳转
      savePrepare(makeKey(scenario), list, 0)
        .then((rec) => setPrepareId(rec.id))
        .catch(() => {});
    } catch (e) {
      // M7-12：失败时保留错误（供显示重试），同时给预置兜底祝福
      const message = e instanceof Error ? e.message : '生成失败';
      // M11-01：断网与其它失败分开，页面按 spec 换用固定提示
      setBlessOffline(message === OFFLINE_TIP);
      setBlessError(message);
      setBlessings(fallbackBlessings(scenario.relationship));
      setBlessStatus('error');
    }
  }, [scenario, blessingCount, makeKey]);

  // ---------------- 礼物建议 ----------------
  const loadGifts = useCallback(
    async (force = false) => {
      // 联系人且无特征：不生成礼物（M8-03）
      setGiftOffline(false);
      if (scenario.sceneKind === 'contact' && !hasTraits) {
        setGifts(EMPTY);
        setGiftLoading(false);
        return;
      }
      // 先看会话缓存，再读本机/云端同步下来的最近一批，避免每次进对象页都扣一次 AI
      const cacheKey = scenarioId(scenario);
      if (!force) {
        const hit = giftCache.get(cacheKey);
        if (hit) {
          setGifts(hit);
          setGiftError(null);
          setGiftLoading(false);
          return;
        }
        const stored = await listGifts(makeKey(scenario));
        if (stored.length > 0) {
          giftCache.set(cacheKey, stored);
          setGifts(stored);
          setGiftError(null);
          setGiftLoading(false);
          return;
        }
      }
      setGiftLoading(true);
      setGiftError(null);
      try {
        const list = await generateGifts({
          relationship: scenario.relationship,
          traits: scenario.traits,
          scene: scenario.scene,
          festivalName: scenario.festivalName,
        });
        giftCache.set(cacheKey, list);
        setGifts(list);
        // 最近一批落库：退出重进、换机重装登录后都能看到同样的建议
        void saveGifts(makeKey(scenario), list).catch(() => {});
      } catch (e) {
        const message = e instanceof Error ? e.message : '生成礼物建议失败';
        setGiftOffline(message === OFFLINE_TIP);
        setGifts(null);
        setGiftError(message);
      } finally {
        setGiftLoading(false);
      }
    },
    [scenario, hasTraits, makeKey],
  );

  // ---------------- 组合加载（首次 / 场景变化触发） ----------------
  const loadContent = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      setBlessStatus('loading');
      setBlessError(null);

      // 联系人场景且无特征：直接进入「先填特征」态
      if (scenario.sceneKind === 'contact' && !hasTraits) {
        setBlessings([]);
        setBlessStatus('notraits');
        setGifts(EMPTY);
        return;
      }

      // M7-07：退出重进优先展示上次缓存
      const cachedRecord = await findPrepare(makeKey(scenario));
      if (cachedRecord && cachedRecord.blessings.length > 0) {
        setBlessings(cachedRecord.blessings);
        setSelectedIndex(Math.max(0, cachedRecord.selectedIndex));
        setBlessStatus('ready');
        setCached(true);
        setPrepareId(cachedRecord.id);
      } else {
        setSelectedIndex(0);
        setCached(false);
        await loadBlessings();
      }
      // 礼物优先读最近一批缓存（随账号同步），没有才生成；关闭礼物建议则不发请求（M8-08）
      if (giftEnabled) {
        void loadGifts();
      } else {
        setGifts(null);
        setGiftError(null);
        setGiftOffline(false);
      }
    } finally {
      runningRef.current = false;
    }
  }, [scenario, hasTraits, makeKey, loadBlessings, loadGifts, giftEnabled]);

  // 第一步：只在挂载时确认是否已同意隐私（不在这里读场景数据）
  useEffect(() => {
    let cancelled = false;
    hasPrivacyConsent().then((ok) => {
      if (cancelled) return;
      setConsented(ok);
      setConsentVisible(!ok);
      setConsentChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 第二步：同意 + 场景数据就绪 + 场景变化时加载内容。
  // 注意 ready 必须参与判定：首帧 relationship/traits 还是空的时候不能判「无特征」，
  // 否则会永久停在 notraits（场景键不含特征，之后不会再触发重算）。
  const scenarioKey = scenarioId(scenario);
  useEffect(() => {
    if (!consentChecked || !consented || !ready) return;
    if (scenarioKey === lastIdRef.current) return;
    lastIdRef.current = scenarioKey;
    void loadContent();
    // loadContent 随场景/设置变化重建，这里只按「同意 + 就绪 + 场景键」触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consentChecked, consented, ready, scenarioKey]);

  /** 同意隐私并开始加载（consented 变化会驱动上面的加载 effect）。 */
  const approveConsent = useCallback(() => {
    approvePrivacyConsent()
      .then((ok) => {
        if (!ok) return;
        setConsented(true);
        setConsentVisible(false);
      })
      .catch(() => {});
  }, []);

  /** 换一批 / 重新生成（忽略缓存，强制重新请求并替换当前内容）。 */
  const regenerate = useCallback(() => {
    void loadBlessings().then(() => {
      if (giftEnabled) void loadGifts(true);
    });
  }, [loadBlessings, loadGifts, giftEnabled]);

  /** 就地编辑（M7-11）：改当前文案并随缓存保存。 */
  const editBlessing = useCallback(
    (index: number, text: string) => {
      setBlessings((prev) => {
        const next = prev.slice();
        if (index < next.length) next[index] = text;
        savePrepare(makeKey(scenario), next, selectedIndex)
          .then((rec) => setPrepareId(rec.id))
          .catch(() => {});
        return next;
      });
    },
    [makeKey, scenario, selectedIndex],
  );

  /** 选中某条祝福（供贺卡转向）。 */
  const selectBlessing = useCallback(
    (index: number) => {
      setSelectedIndex(index);
      savePrepare(makeKey(scenario), blessings, index)
        .then((rec) => setPrepareId(rec.id))
        .catch(() => {});
    },
    [makeKey, scenario, blessings],
  );

  return {
    consented,
    consentVisible,
    approveConsent,
    blessings,
    blessStatus,
    blessError,
    blessOffline,
    /** 当前生成场景（关系 / 特征 / 收件人），无网络时页面用它展示对象信息（M11-01） */
    scenario,
    selectedIndex,
    cached,
    prepareId,
    gifts,
    giftLoading,
    giftError,
    giftOffline,
    regenerate,
    editBlessing,
    selectBlessing,
    loadGifts,
  };
}

export type UsePrepareContent = ReturnType<typeof usePrepareContent>;