import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold
} from '@expo-google-fonts/poppins';
import { ThemeProvider, useTheme } from '../src/theme.js';
import SplashScreen from '../src/components/SplashScreen.js';

function RootLayoutNav() {
  const { theme, isDark } = useTheme();
  const [splashDone, setSplashDone] = useState(false);

  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const existing = document.getElementById('ag-remote-fonts');
      if (!existing) {
        const link = document.createElement('link');
        link.id = 'ag-remote-fonts';
        link.rel = 'stylesheet';
        link.href =
          'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Poppins:wght@400;500;600;700&display=swap';
        document.head.appendChild(link);
      }
      document.body.style.backgroundColor = theme.bg;
      document.body.style.fontFamily = 'Poppins, sans-serif';
    }
  }, [theme.bg]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={theme.bg} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.bg }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="scanner"
          options={{
            title: 'Scan Bridge QR',
            presentation: 'modal',
            headerStyle: { backgroundColor: theme.surface },
            headerTintColor: theme.text
          }}
        />
      </Stack>
      {!splashDone && <SplashScreen onFinished={() => setSplashDone(true)} />}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}
