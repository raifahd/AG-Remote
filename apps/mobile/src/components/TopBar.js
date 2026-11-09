import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme.js';
import Icon from './Icon.js';

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
    fontWeight: '700',
    letterSpacing: -1
  },
  wordmarkLight: {
    fontSize: 21,
    fontWeight: '400',
    marginLeft: 3,
    letterSpacing: -1
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
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
