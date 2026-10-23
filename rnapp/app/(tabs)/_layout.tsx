import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.camellia,
        tabBarInactiveTintColor: colors.ink3,
        tabBarStyle: { backgroundColor: colors.paper2, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '首页',
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={focused ? colors.camellia : colors.ink3}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '心意记录',
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? 'list' : 'list-outline'}
              size={size}
              color={focused ? colors.camellia : colors.ink3}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '设置',
          tabBarIcon: ({ size, focused }) => (
            <Ionicons
              name={focused ? 'options' : 'options-outline'}
              size={size}
              color={focused ? colors.camellia : colors.ink3}
            />
          ),
        }}
      />
    </Tabs>
  );
}