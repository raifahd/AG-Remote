import React from 'react';
import { Tabs } from 'expo-router';
import TabBar from '../../src/components/TabBar.js';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="workspaces" options={{ title: 'Workspaces' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen
        name="bridges"
        options={{
          href: null
        }}
      />
    </Tabs>
  );
}
