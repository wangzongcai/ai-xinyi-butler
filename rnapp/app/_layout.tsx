import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { SettingsProvider } from '../src/settings/SettingsContext';
import { colors, fonts } from '../src/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <RootNavigator />
      </SettingsProvider>
    </AuthProvider>
  );
}

function RootNavigator() {
  const { session, loading } = useAuth();

  // 会话恢复期间先显示加载态，避免未登录时短暂闪出登录页
  if (loading) {
    return (
      <View style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={colors.camellia} />
      </View>
    );
  }

  const isLoggedIn = Boolean(session);

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
          <Stack.Screen name="content/[id]" options={{ title: '心意内容页' }} />
          <Stack.Screen name="card/[id]" options={{ title: '电子贺卡' }} />
          <Stack.Screen name="recycle-bin" options={{ title: '回收站' }} />
          <Stack.Screen name="settings/reminder" options={{ title: '提醒设置' }} />
          <Stack.Screen name="settings/blessing" options={{ title: '祝福语设置' }} />
          <Stack.Screen name="settings/gift" options={{ title: '礼物设置' }} />
          <Stack.Screen name="settings/card" options={{ title: '贺卡设置' }} />
          <Stack.Screen name="settings/festivals" options={{ title: '节日设置' }} />
          <Stack.Screen name="settings/account" options={{ title: '账号管理' }} />
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
