import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

type TabParams = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconOn: keyof typeof Ionicons.glyphMap;
};

const TABS: Record<string, TabParams> = {
  index: { label: '提醒', icon: 'notifications-outline', iconOn: 'notifications' },
  contacts: { label: '联系人', icon: 'people-outline', iconOn: 'people' },
  history: { label: '历史', icon: 'time-outline', iconOn: 'time' },
  settings: { label: '设置', icon: 'options-outline', iconOn: 'options' },
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        title: TABS[route.name]?.label ?? route.name,
        headerShown: false,
        tabBarActiveTintColor: colors.camellia,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.paper2, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' },
        tabBarIcon: ({ size, focused }) => {
          const tab = TABS[route.name];
          return (
            <Ionicons
              name={focused ? tab.iconOn : tab.icon}
              size={size}
              color={focused ? colors.camellia : colors.ink3}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="contacts" />
      <Tabs.Screen name="history" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
