// =====================================================================
// 心意准备栈：只保留节日准备页。
// 联系人场景已内联到对象页（2026-10-25），不再有 /prepare/contact/[id]
// =====================================================================
import { Stack } from 'expo-router';
import { colors, fonts } from '../../src/theme';

export default function PrepareLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.hand, color: colors.ink, fontWeight: 'normal', fontSize: 19 },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.paper },
      }}
    >
      <Stack.Screen name="holiday/[id]" options={{ title: '心意准备' }} />
    </Stack>
  );
}