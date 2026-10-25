// =====================================================================
// 同步上下文（M12）
// 监听当前账号：登录即初始化同步、建立实时订阅；退出即断开（库文件保留）。
// 远端数据落库后 dataVersion 自增，设置页重新读库、通知提醒统一重排。
// =====================================================================
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useSettings } from '../settings/SettingsContext';
import { clearAllSchedules, rescheduleAll } from '../notifications/scheduler';
import {
  getSyncSnapshot,
  initForUser,
  refreshPendingCount,
  resolveBootstrapConflict,
  resumeSync,
  stopSync,
  subscribeSync,
  syncNow as engineSyncNow,
  type SyncSnapshot,
} from './syncEngine';

type SyncContextValue = SyncSnapshot & {
  /** 立即同步（同步页按钮） */
  syncNow: () => void;
  /** 首次同步冲突：按更新时间合并 */
  resolveConflict: () => void;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { refreshSettings } = useSettings();
  const uid = user?.id ?? null;
  const [snap, setSnap] = useState<SyncSnapshot>(getSyncSnapshot);
  const conflictShown = useRef(false);

  useEffect(() => subscribeSync(setSnap), []);

  // 账号变化：登录 → 初始化；退出 → 停止并断连
  useEffect(() => {
    if (!uid) {
      void stopSync();
      // 通知属系统级、不随库走：退出即清空排期，避免上一个账号的提醒还在弹
      void clearAllSchedules();
      return;
    }
    // 账号切换（含 A 直接切 B，不经过退出登录）：先清掉上一个账号排下的通知
    void clearAllSchedules();
    void initForUser(uid).then(() => refreshPendingCount());
  }, [uid]);

  // 回到前台补一次同步（Realtime 不重放断线期间的事件）
  useEffect(() => {
    if (!uid) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') resumeSync();
    });
    return () => sub.remove();
  }, [uid]);

  // 远端数据落库 → 重新读设置 + 重排提醒（去抖，避免批量拉取时反复排期）
  const dataVersion = snap.dataVersion;
  useEffect(() => {
    if (dataVersion === 0) return;
    void refreshSettings();
    const timer = setTimeout(() => {
      void rescheduleAll();
    }, 800);
    return () => clearTimeout(timer);
  }, [dataVersion, refreshSettings]);

  // 首次同步发现本机与云端都有数据：提示按时间合并
  const conflict = snap.conflict;
  useEffect(() => {
    if (!conflict) {
      conflictShown.current = false;
      return;
    }
    if (conflictShown.current) return;
    conflictShown.current = true;
    Alert.alert(
      '本机与云端都有数据',
      `本机 ${conflict.localRows} 条、云端 ${conflict.cloudRows} 条。将按更新时间合并，较新的记录生效。`,
      [
        { text: '稍后', style: 'cancel' },
        { text: '合并', onPress: () => resolveBootstrapConflict() },
      ],
    );
  }, [conflict]);

  const syncNow = useCallback(() => {
    void engineSyncNow().then(() => refreshPendingCount());
  }, []);

  const resolveConflict = useCallback(() => {
    void resolveBootstrapConflict();
  }, []);

  const value = useMemo<SyncContextValue>(
    () => ({ ...snap, syncNow, resolveConflict }),
    [snap, syncNow, resolveConflict],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync 必须在 SyncProvider 内使用');
  return ctx;
}
