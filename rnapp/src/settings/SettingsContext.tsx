import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { FESTIVALS } from './festivals';
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
  updatedAt: '',
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
  /** 最近一次更新的时间戳（本地读取/写入时间） */
  updatedAt: string;

  setRemindDays: (value: number) => void;
  setPushEnabled: (value: boolean) => void;
  setBlessingCount: (value: number) => void;
  setPlatform: (value: ShopPlatform) => void;
  setCardSignature: (value: boolean) => void;
  toggleFestival: (id: string, value: boolean) => void;
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

  // 统一封装：调仓库持久化后同步内存态。仓库返回的是写入后的完整 Settings。
  const persist = useCallback((patch: {
    advanceDays?: number;
    blessingCount?: number;
    ecommercePlatform?: Settings['ecommercePlatform'];
    notificationPermission?: NotificationPermission;
    cardSignature?: boolean;
    followedFestivals?: Record<string, boolean>;
  }) => {
    repoUpdate(patch)
      .then((next) => setSettings((prev) => next)) // 直接以仓库返回值对齐，避免丢失最新写入
      .catch(() => {
        // 写入失败：本地保持原值（不改内存态），静默降级。
      });
  }, []);

  const setRemindDays = useCallback(
    (value: number) => {
      const v = Math.max(0, Math.min(30, Math.round(value))); // 0~30 强制
      persist({ advanceDays: v });
    },
    [persist],
  );

  const setPushEnabled = useCallback(
    (value: boolean) => {
      // 本批只存本地 notificationPermission 值，不请求系统授权（M6 再接）。
      persist({ notificationPermission: value ? 'granted' : 'denied' });
    },
    [persist],
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

  const toggleFestival = useCallback(
    (id: string, value: boolean) => {
      persist({ followedFestivals: { [id]: value } });
    },
    [persist],
  );

  const followedCount = useMemo(
    () => (settings ? FESTIVALS.filter((f) => settings.followedFestivals[f.id]).length : 0),
    [settings],
  );

  const platform: ShopPlatform = toShopPlatform(dbg.ecommercePlatform);
  const pushEnabled = dbg.notificationPermission !== 'denied'; // null/undetermined 视为开

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
      updatedAt: dbg.updatedAt,

      setRemindDays,
      setPushEnabled,
      setBlessingCount,
      setPlatform,
      setCardSignature,
      toggleFestival,
    }),
    [
      dbg,
      settings,
      pushEnabled,
      platform,
      followedCount,
      setRemindDays,
      setPushEnabled,
      setBlessingCount,
      setPlatform,
      setCardSignature,
      toggleFestival,
    ],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings 必须在 SettingsProvider 内使用');
  return ctx;
}