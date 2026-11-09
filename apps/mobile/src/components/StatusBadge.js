import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme.js';

const fontSemiBold = Platform.select({
  ios: 'Poppins-SemiBold',
  android: 'Poppins_600SemiBold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

export default function StatusBadge({ text, tone = 'success' }) {
  const { theme } = useTheme();

  const getDotColor = () => {
    switch (tone) {
      case 'success':
        return theme.success;
      case 'warning':
        return theme.warning;
      case 'muted':
      default:
        return '#777777';
    }
  };

  const dotColor = getDotColor();

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <Text style={[styles.text, { color: theme.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  text: {
    fontSize: 9,
    letterSpacing: 0.7,
    fontFamily: fontSemiBold
  }
});
