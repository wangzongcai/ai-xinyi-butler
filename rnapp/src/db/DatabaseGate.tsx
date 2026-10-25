// =====================================================================
// 数据库门禁（M12）
// 每个账号一个本地库：必须先按当前登录账号把库打开，才能渲染任何读库的页面。
// 放在 AuthProvider 与 SettingsProvider 之间，避免换账号时 SettingsProvider
// 抢先读到上一个账号的库（数据串号）。
// =====================================================================
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { clearActiveUser, setActiveUser } from './client';
import { colors } from '../theme';

export function DatabaseGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const uid = user?.id ?? null;
  // 记录「已为哪个账号打开库」：账号一变就自动回到未就绪，无需在 effect 里同步 setState
  const [opened, setOpened] = useState<{ uid: string | null; failed: boolean } | null>(null);
  const ready = opened !== null && opened.uid === uid;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let failed = false;
      try {
        if (uid) {
          await setActiveUser(uid);
        } else {
          await clearActiveUser();
        }
      } catch {
        failed = true;
      }
      if (!cancelled) setOpened({ uid, failed });
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (loading || !ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.camellia} />
      </View>
    );
  }

  if (opened?.failed) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>本机数据打开失败，请重启 App 再试。</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errorText: { fontSize: 14, color: colors.ink2, textAlign: 'center' },
});
