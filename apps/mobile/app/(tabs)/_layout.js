import React from 'react';
import { Tabs } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { CpuIcon, BubbleChatIcon, NetworkIcon } from '@hugeicons/core-free-icons';
import { useTheme } from '../../src/theme.js';

export default function TabLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: theme.bg,
          borderBottomWidth: 1,
          borderBottomColor: theme.borderSubtle,
          shadowOpacity: 0,
          elevation: 0
        },
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
          color: theme.text
        },
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.borderSubtle,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8
        },
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600'
        }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Remote',
          tabBarIcon: ({ color, size }) => (
            <HugeiconsIcon icon={CpuIcon} size={size || 22} color={color} />
          )
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <HugeiconsIcon icon={BubbleChatIcon} size={size || 22} color={color} />
          )
        }}
      />
      <Tabs.Screen
        name="bridges"
        options={{
          title: 'Bridges',
          tabBarIcon: ({ color, size }) => (
            <HugeiconsIcon icon={NetworkIcon} size={size || 22} color={color} />
          )
        }}
      />
    </Tabs>
  );
}
