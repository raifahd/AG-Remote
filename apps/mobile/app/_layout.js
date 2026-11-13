import React, { useEffect, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
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
    <>
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
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    'Poppins-Regular': Poppins_400Regular,
    'Poppins-Medium': Poppins_500Medium,
    'Poppins-SemiBold': Poppins_600SemiBold,
    'Poppins-Bold': Poppins_700Bold
  });
  const [splashDone, setSplashDone] = useState(false);

  if (!fontsLoaded) {
    return (
      <View style={styles.rootContainer}>
        <View style={styles.splashContainer} pointerEvents="auto">
          <SplashScreen />
        </View>
      </View>
    );
  }

  return (
    <ThemeProvider>
      <View style={styles.rootContainer}>
        <View style={styles.navContainer}>
          <RootLayoutNav />
        </View>
        {!splashDone && (
          <View style={styles.splashContainer} pointerEvents="auto">
            <SplashScreen onFinished={() => setSplashDone(true)} />
          </View>
        )}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#000000'
  },
  navContainer: {
    flex: 1
  },
  splashContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
    backgroundColor: '#000000'
  }
});
