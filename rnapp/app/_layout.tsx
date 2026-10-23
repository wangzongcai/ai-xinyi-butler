import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/auth/AuthContext';
import { colors, fonts } from '../src/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="person/new" options={{ title: '添加一位要记住的人' }} />
        <Stack.Screen name="person/[id]" options={{ title: '对象页' }} />
        <Stack.Screen name="person/[id]/edit" options={{ title: '编辑对象' }} />
        <Stack.Screen name="content/[id]" options={{ title: '心意内容页' }} />
        <Stack.Screen name="card/[id]" options={{ title: '电子贺卡' }} />
        <Stack.Screen name="recycle-bin" options={{ title: '回收站' }} />
        <Stack.Screen name="login" options={{ title: '登录 · 注册' }} />
      </Stack>
    </AuthProvider>
  );
}