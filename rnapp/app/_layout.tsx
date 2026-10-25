import { useEffect } from 'react';
import { ActivityIndicator, AppState, StyleSheet, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { DatabaseGate } from '../src/db/DatabaseGate';
import { SettingsProvider, useSettings } from '../src/settings/SettingsContext';
import { SyncProvider } from '../src/sync/SyncContext';
import { rescheduleAll } from '../src/notifications/scheduler';
import { getNotifications } from '../src/notifications/notificationsModule';
import {
  hasRequestedThisSession,
  requestPermission,
  syncPermission,
} from '../src/notifications/permissions';
import { colors, fonts } from '../src/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      {/* 先按账号打开本地库，再渲染读库的 Provider，避免换账号时读到上一个账号的数据 */}
      <DatabaseGate>
        <SettingsProvider>
          <SyncProvider>
            <RootNavigator />
          </SyncProvider>
        </SettingsProvider>
      </DatabaseGate>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const { refreshSettings } = useSettings();
  const isLoggedIn = Boolean(session);

  // 首次启动（登录前）就请求通知权限：通知是核心能力，早授权少一次操作。
  // Android 13+ 未请求时 system 为 denied、canAskAgain 为 true，必须主动请求才会弹框。
  useEffect(() => {
    void (async () => {
      const snap = await syncPermission();
      if (snap.system !== 'granted' && snap.canAskAgain && !hasRequestedThisSession()) {
        await requestPermission();
        await refreshSettings();
      }
    })();
  }, [refreshSettings]);

  // M6：登录后接通通知——同步权限、滚动重排、点开通知深链到对象页（祝福语/礼物已内联）。
  useEffect(() => {
    if (!isLoggedIn) return;
    let disposed = false;
    // Expo Go 等环境没有通知原生模块时返回 null：跳过监听，但权限对账与重排照走
    const Notifications = getNotifications();

    const handleData = (data: Record<string, unknown> | undefined) => {
      // 响应只消费一次：不清掉的话，下次正常冷启动 App 会被「上次点过的通知」再次带进内容页
      Notifications?.clearLastNotificationResponseAsync().catch(() => {});
      if (!data) return;
      // 对象相关（纪念日/指向性节日）→ 进入对象页（祝福语与礼物已内联在该页）
      const personId = typeof data.personId === 'string' ? data.personId : null;
      const festivalId = typeof data.festivalId === 'string' ? data.festivalId : null;
      if (personId) {
        router.replace(`/person/${personId}`);
        return;
      }
      // 通用节日 → 进入节日准备页
      if (festivalId) router.replace(`/prepare/holiday/${festivalId}`);
    };

    const sub = Notifications?.addNotificationResponseReceivedListener((response) => {
      if (disposed) return;
      handleData(response.notification.request.content.data);
    });

    // 冷启动：用户可能是点通知进来的
    Notifications?.getLastNotificationResponseAsync().then((response) => {
      if (!disposed && response) handleData(response.notification.request.content.data);
    });

    // 启动 / 每次回到前台：对账权限并滚动重排（覆盖跨日滚动、已排期被系统清理）。
    // 首次安装（undetermined）时主动请求系统通知授权，这样不用先去设置页点开关。
    const bootstrap = async () => {
      const snap = await syncPermission();
      // 首次安装：Android 13+ 此时 system 是 denied 但 canAskAgain=true，
      // 必须主动请求才会弹授权框；授权成功后 requestPermission 内部自动重排。
      let justGranted = false;
      if (snap.system !== 'granted' && snap.canAskAgain && !hasRequestedThisSession()) {
        justGranted = (await requestPermission()) === 'granted';
      }
      // 其余情况（已授权 / 用户主动关推送 / 已拒绝且不能再问）都跑一次重排：
      // 排期本身按权限决定，但心意记录不受通知权限影响——关了推送历史页也要有内容。
      if (!justGranted) await rescheduleAll();
      await refreshSettings(); // 系统权限变化后刷新设置页开关
    };
    void bootstrap();
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void bootstrap();
    });

    return () => {
      disposed = true;
      sub?.remove();
      appSub.remove();
    };
  }, [isLoggedIn, refreshSettings]);

  // 会话恢复期间先显示加载态，避免未登录时短暂闪出登录页
  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.camellia} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.hand, fontSize: 19, color: colors.ink, fontWeight: 'normal' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        {/* 已登录才能进入：主 Tab 与全部业务页 */}
        <Stack.Protected guard={isLoggedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="person/new" options={{ title: '添加一位要记住的人' }} />
          <Stack.Screen name="person/[id]" options={{ title: '对象页' }} />
          <Stack.Screen name="person/[id]/edit" options={{ title: '编辑对象' }} />
          {/* prepare 目录有独立 _layout，子页标题在 prepare/_layout.tsx 里声明 */}
          <Stack.Screen name="prepare" options={{ headerShown: false }} />
          <Stack.Screen name="card/[prepareId]" options={{ title: '电子贺卡' }} />
          <Stack.Screen name="recycle-bin" options={{ title: '回收站' }} />
          <Stack.Screen name="settings/reminder" options={{ title: '提醒设置' }} />
          <Stack.Screen name="settings/blessing" options={{ title: '祝福语设置' }} />
          <Stack.Screen name="settings/gift" options={{ title: '礼物设置' }} />
          <Stack.Screen name="settings/card" options={{ title: '贺卡设置' }} />
          <Stack.Screen name="settings/festivals" options={{ title: '节日设置' }} />
          <Stack.Screen name="settings/account" options={{ title: '账号管理' }} />
          <Stack.Screen name="settings/sync" options={{ title: '云同步' }} />
        </Stack.Protected>

        {/* 未登录时只显示登录页，且不可返回 */}
        <Stack.Protected guard={!isLoggedIn}>
          <Stack.Screen name="login" options={{ title: '登录 · 注册', headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
