import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useTheme } from '../theme.js';

const fontMono = Platform.select({
  ios: 'JetBrainsMono-Regular',
  android: 'monospace',
  default: 'monospace'
});

export default function DiffViewer({ diff, maxHeight = 300 }) {
  const { theme, isDark } = useTheme();

  if (!diff || typeof diff !== 'string') {
    return null;
  }

  const lines = diff.split('\n');

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#121218' : '#f8fafc', borderColor: theme.border }]}>
      <ScrollView style={{ maxHeight }} nestedScrollEnabled showsVerticalScrollIndicator>
        {lines.map((line, idx) => {
          let lineBg = 'transparent';
          let textColor = theme.text;
          let prefixColor = theme.muted;

          if (line.startsWith('+') && !line.startsWith('+++')) {
            lineBg = isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.12)';
            textColor = isDark ? '#4ade80' : '#15803d';
            prefixColor = textColor;
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineBg = isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.12)';
            textColor = isDark ? '#f87171' : '#b91c1c';
            prefixColor = textColor;
          } else if (line.startsWith('@@')) {
            lineBg = isDark ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.08)';
            textColor = isDark ? '#a5b4fc' : '#4338ca';
            prefixColor = textColor;
          }

          return (
            <View key={idx} style={[styles.lineRow, { backgroundColor: lineBg }]}>
              <Text style={[styles.lineNum, { color: theme.muted }]}>{idx + 1}</Text>
              <Text style={[styles.lineText, { color: textColor }]}>
                {line}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    marginVertical: 8
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  lineNum: {
    width: 32,
    fontSize: 10,
    fontFamily: fontMono,
    textAlign: 'right',
    paddingRight: 8,
    userSelect: 'none'
  },
  lineText: {
    flex: 1,
    fontSize: 11,
    fontFamily: fontMono,
    lineHeight: 16
  }
});

