import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme.js';
import Icon from './Icon.js';

const fontBold = Platform.select({
  ios: 'Poppins-Bold',
  android: 'Poppins_700Bold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

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

export default function TopBar({ title, status, onBellPress }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <View
      style={[
        styles.topbar,
        {
          paddingTop: Math.max(insets.top, 14) + 8,
          backgroundColor: theme.bg
        }
      ]}
    >
      <View style={styles.titleArea}>
        {title ? (
          <>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>
              {status || 'CONNECTED'}
            </Text>
            <Text style={[styles.heading, { color: theme.text }]} numberOfLines={1}>
              {title}
            </Text>
          </>
        ) : (
          <View style={styles.wordmarkRow}>
            <Text style={[styles.wordmarkBold, { color: theme.text }]}>AG</Text>
            <Text style={[styles.wordmarkLight, { color: theme.muted }]}>Remote</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={[
          styles.iconButton,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border
          }
        ]}
        onPress={onBellPress}
        activeOpacity={0.7}
      >
        <Icon name="bell" size={20} color={theme.text} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  titleArea: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 12
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'baseline'
  },
  wordmarkBold: {
    fontSize: 21,
    fontFamily: fontBold,
    letterSpacing: -1
  },
  wordmarkLight: {
    fontSize: 21,
    fontFamily: fontRegular,
    marginLeft: 3,
    letterSpacing: -1
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontFamily: fontSemiBold,
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  heading: {
    fontSize: 18,
    fontFamily: fontBold,
    letterSpacing: -0.5
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  }
});
