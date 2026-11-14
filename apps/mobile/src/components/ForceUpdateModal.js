import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Platform
} from 'react-native';
import { useTheme } from '../theme.js';
import Icon from './Icon.js';

const fontRegular = Platform.select({
  ios: 'Poppins-Regular',
  android: 'Poppins_400Regular',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontSemiBold = Platform.select({
  ios: 'Poppins-SemiBold',
  android: 'Poppins_600SemiBold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontBold = Platform.select({
  ios: 'Poppins-Bold',
  android: 'Poppins_700Bold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

export default function ForceUpdateModal({
  visible,
  installedVersion,
  installedBuild,
  latestVersion,
  latestBuild,
  downloadUrl,
  apkAvailable,
  onRetry
}) {
  const { theme } = useTheme();
  const [checking, setChecking] = useState(false);

  if (!visible) return null;

  const handleDownload = async () => {
    if (downloadUrl) {
      try {
        await Linking.openURL(downloadUrl);
      } catch {}
    }
  };

  const handleCheckAgain = async () => {
    if (checking || !onRetry) return;
    setChecking(true);
    try {
      await onRetry();
    } finally {
      setTimeout(() => setChecking(false), 500);
    }
  };

  return (
    <View style={[styles.overlay, { backgroundColor: theme.bg }]}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: '#ef444420', borderColor: '#ef4444' }]}>
            <View style={styles.badgeDot} />
            <Text style={styles.badgeText}>UPDATE REQUIRED</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>New Version Detected</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>
          Changes were made to the AG Remote application. To prevent protocol errors and maintain system integrity, you must update the APK to continue.
        </Text>

        <View style={[styles.versionBox, { backgroundColor: theme.raised, borderColor: theme.border }]}>
          <View style={styles.versionCol}>
            <Text style={[styles.versionLabel, { color: theme.muted }]}>INSTALLED</Text>
            <Text style={[styles.versionVal, { color: theme.text }]}>v{installedVersion}</Text>
            <Text style={[styles.buildVal, { color: theme.subtle }]}>build {installedBuild}</Text>
          </View>

          <View style={[styles.versionDivider, { backgroundColor: theme.border }]} />

          <View style={styles.versionCol}>
            <Text style={[styles.versionLabel, { color: theme.accent }]}>REQUIRED</Text>
            <Text style={[styles.versionVal, { color: theme.text }]}>v{latestVersion}</Text>
            <Text style={[styles.buildVal, { color: theme.subtle }]}>build {latestBuild}</Text>
          </View>
        </View>

        {apkAvailable && downloadUrl ? (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
            onPress={handleDownload}
            activeOpacity={0.85}
          >
            <Icon name="arrow-down" size={18} color="#ffffff" />
            <Text style={styles.primaryBtnText}>Download & Install APK</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.noticeBox, { backgroundColor: theme.raised, borderColor: theme.border }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>APK Build Pending</Text>
            <Text style={[styles.noticeDesc, { color: theme.muted }]}>
              The codebase has changed on your computer, but the new APK has not been compiled yet. Run the build script in your terminal:
            </Text>
            <View style={[styles.codeBox, { backgroundColor: theme.surface }]}>
              <Text style={[styles.codeText, { color: theme.accent }]}>bash scripts/build-apk.sh</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.secondaryBtn, { borderColor: theme.border }]}
          onPress={handleCheckAgain}
          disabled={checking}
          activeOpacity={0.7}
        >
          {checking ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Check Again</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    alignItems: 'stretch'
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 14
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444'
  },
  badgeText: {
    color: '#ef4444',
    fontSize: 10,
    fontFamily: fontBold,
    letterSpacing: 0.8,
    includeFontPadding: false
  },
  title: {
    fontSize: 20,
    fontFamily: fontBold,
    marginBottom: 8,
    includeFontPadding: false
  },
  subtitle: {
    fontSize: 12.5,
    fontFamily: fontRegular,
    lineHeight: 18,
    marginBottom: 20,
    includeFontPadding: false
  },
  versionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 20
  },
  versionCol: {
    flex: 1,
    alignItems: 'center'
  },
  versionDivider: {
    width: 1,
    height: 36
  },
  versionLabel: {
    fontSize: 9.5,
    fontFamily: fontBold,
    letterSpacing: 0.8,
    marginBottom: 4,
    includeFontPadding: false
  },
  versionVal: {
    fontSize: 14,
    fontFamily: fontBold,
    includeFontPadding: false
  },
  buildVal: {
    fontSize: 10,
    fontFamily: fontRegular,
    marginTop: 2,
    includeFontPadding: false
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    marginBottom: 10
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: fontBold,
    includeFontPadding: false
  },
  secondaryBtn: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryBtnText: {
    fontSize: 12.5,
    fontFamily: fontSemiBold,
    includeFontPadding: false
  },
  noticeBox: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 14
  },
  noticeTitle: {
    fontSize: 12.5,
    fontFamily: fontBold,
    marginBottom: 4,
    includeFontPadding: false
  },
  noticeDesc: {
    fontSize: 11,
    fontFamily: fontRegular,
    lineHeight: 16,
    marginBottom: 8,
    includeFontPadding: false
  },
  codeBox: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8
  },
  codeText: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' })
  }
});
