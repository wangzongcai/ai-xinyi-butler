import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Alert, Linking } from 'react-native';
import { FESTIVALS } from './festivals';
import { requestPermission } from '../notifications/permissions';
import { clearAllSchedules, rescheduleAll } from '../notifications/scheduler';
import {
  fromShopPlatform,
  getSettings,
  toShopPlatform,
  updateSettings as repoUpdate,
  type NotificationPermission,
  type Settings,
} from '../data/settingsRepository';

export type ShopPlatform = 'taobao' | 'jd';

// 兜底默认值：仓库尚未返回（首帧）或读取失败时使用，避免闪崩闪变。
// 与 settingsRepository.getSettings 的兜底默认保持一致。
const DEFAULT_SETTINGS: Settings = {
  advanceDays: 3,
  blessingCount: 3,
  ecommercePlatform: '淘宝',
  notificationPermission: null,
  cardSignature: false,
  followedFestivals: Object.fromEntries(FESTIVALS.map((f) => [f.id, true])),
  reminderHour: 9,
  reminderMinute: 0,
  giftEnabled: true,
  cardEnabled: true,
  signatureText: null,
  privacyConsentAt: null,
  updatedAt: '',
  syncUpdatedAt: '',
};

type SettingsState = {
  /** 提前提醒天数（0~30，默认 3） */
  remindDays: number;
  /** 推送通知开关。本批仅读写本地 notificationPermission，不调系统权限（M6 接入）。 */
  pushEnabled: boolean;
  /** 祝福文案数量（1~5，默认 3） */
  blessingCount: number;
  /** 电商平台，规范值 taobao / jd（淘宝/京东） */
  platform: ShopPlatform;
  /** 贺卡署名开关：false=匿名 */
  cardSignature: boolean;
  /** 12 个节日关注状态：{ 节日id: 是否关注 } */
  followedFestivals: Record<string, boolean>;
  /** 已关注节日数量 */
  followedCount: number;
  /** 推送时间：小时 0~23（手机本地时区，默认 9） */
  remindHour: number;
  /** 推送时间：分钟 0~59（默认 0） */
  remindMinute: number;
  /** 推送时间格式化为 HH:MM，方便界面直接展示 */
  remindTimeText: string;
  /** 礼物区域开关：false=隐藏礼物区且不请求 */
  giftEnabled: boolean;
  /** 贺卡区域开关：false=隐藏贺卡入口且不请求 */
  cardEnabled: boolean;
  /** 贺卡署名文字：可空 */
  signatureText: string | null;
  /** 最近一次更新的时间戳（本地读取/写入时间） */
  updatedAt: string;
  /**
   * 设置是否已从数据库读出（读取失败也算就绪，用兜底值）。
   * 首帧返回的是兜底默认值，需要据此判断「能不能按当前设置发请求」。
   */
  settingsLoaded: boolean;

  setRemindDays: (value: number) => void;
  /** 设置推送时间（小时+分钟一起设置），改完自动重排 */
  setRemindTime: (hour: number, minute: number) => void;
  setPushEnabled: (value: boolean) => void;
  setBlessingCount: (value: number) => void;
  setPlatform: (value: ShopPlatform) => void;
  setCardSignature: (value: boolean) => void;
  setGiftEnabled: (value: boolean) => void;
  setCardEnabled: (value: boolean) => void;
  setSignatureText: (value: string) => void;
  toggleFestival: (id: string, value: boolean) => void;
  /** 重新读取数据库设置并刷新内存态（系统通知权限变化后同步 UI 用） */
  refreshSettings: () => Promise<void>;
};

const SettingsContext = createContext<SettingsState | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  // 读取失败 / 未读取完成时不反复重试（保持默认值不闪崩）。
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 兜底值（读取完成前/失败后）。
  const dbg = useMemo(() => settings ?? DEFAULT_SETTINGS, [settings]);

  // 系统权限变化（启动同步 / 请求授权 / 从系统设置返回）后，重新读库刷新 UI。
  const refreshSettings = useCallback(async () => {
    try {
      setSettings(await getSettings());
    } catch {
      // 读取失败保持原状态，静默降级
    }
  }, []);

  // 统一封装：调仓库持久化后同步内存态。仓库返回的是写入后的完整 Settings。
  const persist = useCallback((patch: {
    advanceDays?: number;
    blessingCount?: number;
    ecommercePlatform?: Settings['ecommercePlatform'];
    notificationPermission?: NotificationPermission;
    cardSignature?: boolean;
    followedFestivals?: Record<string, boolean>;
    reminderHour?: number;
    reminderMinute?: number;
    giftEnabled?: boolean;
    cardEnabled?: boolean;
    signatureText?: string | null;
    privacyConsentAt?: string | null;
  }) => {
    // 返回 Promise 供调用方「写库完成后再重排」，避免重排读到旧值
    return repoUpdate(patch)
      .then((next) => setSettings((prev) => next)) // 直接以仓库返回值对齐，避免丢失最新写入
      .catch(() => {
        // 写入失败：本地保持原值（不改内存态），静默降级。
      });
  }, []);

  const setRemindDays = useCallback(
    (value: number) => {
      const v = Math.max(0, Math.min(30, Math.round(value))); // 0~30 强制
      // 修改提前天数后，全部已排期提醒统一按新值重排（M6-03）
      void persist({ advanceDays: v }).then(() => rescheduleAll());
    },
    [persist],
  );

  const setRemindTime = useCallback(
    (hour: number, minute: number) => {
      const h = Math.max(0, Math.min(23, Math.round(hour)));
      const m = Math.max(0, Math.min(59, Math.round(minute)));
      // 改了推送时间，已排期的通知全部作废 → 写库后重排
      void persist({ reminderHour: h, reminderMinute: m }).then(() => rescheduleAll());
    },
    [persist],
  );

  const setPushEnabled = useCallback(
    (value: boolean) => {
      if (value) {
        // 打开：真正请求系统授权；requestPermission 内部写库，这里再刷新内存态。
        // 若系统已永久拒绝（不再弹框），给出明确反馈并引导去系统设置。
        void requestPermission().then(async (perm) => {
          await refreshSettings();
          if (perm !== 'granted') {
            Alert.alert(
              '通知权限未开启',
              '系统没有允许「心意管家」发送通知。请到系统设置中开启通知权限。',
              [
                { text: '暂不', style: 'cancel' },
                { text: '去设置', onPress: () => void Linking.openSettings() },
              ],
            );
          }
        });
      } else {
        // 关闭：记录为 denied 并清空所有已排期通知，本地不再推送
        void persist({ notificationPermission: 'denied' }).then(() => clearAllSchedules());
      }
    },
    [persist, refreshSettings],
  );

  const setBlessingCount = useCallback(
    (value: number) => {
      const v = Math.max(1, Math.min(5, Math.round(value))); // 1~5 强制
      persist({ blessingCount: v });
    },
    [persist],
  );

  const setPlatform = useCallback(
    (value: ShopPlatform) => {
      persist({ ecommercePlatform: fromShopPlatform(value) });
    },
    [persist],
  );

  const setCardSignature = useCallback(
    (value: boolean) => {
      persist({ cardSignature: value });
    },
    [persist],
  );

  const setGiftEnabled = useCallback(
    (value: boolean) => {
      persist({ giftEnabled: value });
    },
    [persist],
  );

  const setCardEnabled = useCallback(
    (value: boolean) => {
      persist({ cardEnabled: value });
    },
    [persist],
  );

  const setSignatureText = useCallback(
    (value: string) => {
      persist({ signatureText: value });
    },
    [persist],
  );

  const toggleFestival = useCallback(
    (id: string, value: boolean) => {
      // 关注状态变化影响哪些节日要推送 → 写库后重排
      void persist({ followedFestivals: { [id]: value } }).then(() => rescheduleAll());
    },
    [persist],
  );

  const followedCount = useMemo(
    () => (settings ? FESTIVALS.filter((f) => settings.followedFestivals[f.id]).length : 0),
    [settings],
  );

  const remindTimeText = `${`${dbg.reminderHour}`.padStart(2, '0')}:${`${dbg.reminderMinute}`.padStart(2, '0')}`;
  // 读过库（成功或失败）即视为就绪，避免页面永远等不到
  const settingsLoaded = settings !== null || loadFailed;
  const platform: ShopPlatform = toShopPlatform(dbg.ecommercePlatform);
  // 只有系统真正授权才显示为开；未请求/已拒绝都显示关，避免「看着是开、其实没权限」。
  const pushEnabled = dbg.notificationPermission === 'granted';

  const value = useMemo<SettingsState>(
    () => ({
      // 对外暴露的一律是规范值 / 用户级语义。
      remindDays: dbg.advanceDays,
      pushEnabled,
      blessingCount: dbg.blessingCount,
      platform,
      cardSignature: dbg.cardSignature,
      followedFestivals: dbg.followedFestivals,
      followedCount: settings ? followedCount : FESTIVALS.length,
      remindHour: dbg.reminderHour,
      remindMinute: dbg.reminderMinute,
      remindTimeText,
      giftEnabled: dbg.giftEnabled,
      cardEnabled: dbg.cardEnabled,
      signatureText: dbg.signatureText,
      updatedAt: dbg.updatedAt,
      settingsLoaded,

      setRemindDays,
      setRemindTime,
      setPushEnabled,
      setBlessingCount,
      setPlatform,
      setCardSignature,
      setGiftEnabled,
      setCardEnabled,
      setSignatureText,
      toggleFestival,
      refreshSettings,
    }),
    [
      dbg,
      settings,
      pushEnabled,
      platform,
      followedCount,
      remindTimeText,
      settingsLoaded,
      setRemindDays,
      setRemindTime,
      setPushEnabled,
      setBlessingCount,
      setPlatform,
      setCardSignature,
      setGiftEnabled,
      setCardEnabled,
      setSignatureText,
      toggleFestival,
      refreshSettings,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings 必须在 SettingsProvider 内使用');
  return ctx;
}