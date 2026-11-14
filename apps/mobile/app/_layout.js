import React, { useEffect, useState, useCallback } from 'react';
import { Platform, View, StyleSheet, AppState } from 'react-native';
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
import ForceUpdateModal from '../src/components/ForceUpdateModal.js';
import { getActiveProfile } from '../src/storage.js';
import { checkAppVersion } from '../src/api.js';
import { APP_VERSION, APP_BUILD_ID } from '../src/version.js';

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
  const [updateInfo, setUpdateInfo] = useState({
    visible: false,
    installedVersion: APP_VERSION,
    installedBuild: APP_BUILD_ID,
    latestVersion: APP_VERSION,
    latestBuild: APP_BUILD_ID,
    downloadUrl: null,
    apkAvailable: false
  });

  const runVersionCheck = useCallback(async () => {
    try {
      const profile = await getActiveProfile();
      if (!profile?.baseUrl) return;
      const res = await checkAppVersion(
        profile.baseUrl,
        profile.token,
        APP_VERSION,
        APP_BUILD_ID
      );
      if (res && res.updateRequired) {
        setUpdateInfo({
          visible: true,
          installedVersion: APP_VERSION,
          installedBuild: APP_BUILD_ID,
          latestVersion: res.version,
          latestBuild: res.buildId,
          downloadUrl: res.downloadUrl,
          apkAvailable: res.apkAvailable
        });
      } else if (res && !res.updateRequired) {
        setUpdateInfo((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
    } catch {}
  }, []);

  useEffect(() => {
    runVersionCheck();
    const interval = setInterval(runVersionCheck, 8000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        runVersionCheck();
      }
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [runVersionCheck]);

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
        <ForceUpdateModal
          visible={updateInfo.visible}
          installedVersion={updateInfo.installedVersion}
          installedBuild={updateInfo.installedBuild}
          latestVersion={updateInfo.latestVersion}
          latestBuild={updateInfo.latestBuild}
          downloadUrl={updateInfo.downloadUrl}
          apkAvailable={updateInfo.apkAvailable}
          onRetry={runVersionCheck}
        />
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
