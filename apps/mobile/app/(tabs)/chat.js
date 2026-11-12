import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Platform,
  Animated,
  Easing,
  ActivityIndicator,
  Modal
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme, CHAT_FONT_SIZES } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import StatusBadge from '../../src/components/StatusBadge.js';
import { getActiveProfile, getProfiles, setActiveProfileId } from '../../src/storage.js';
import {
  fetchMessages,
  fetchState,
  fetchSessions,
  focusSession,
  createSession,
  sendPrompt,
  sendStop,
  uploadFile
} from '../../src/api.js';
import { BridgeWebSocketClient } from '../../src/websocket.js';

function formatSessionTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return timeStr;
  }
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    const month = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${month}, ${timeStr}`;
  }
  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })}, ${timeStr}`;
}

function CodeSnippet({ code, lang = 'code', theme, fontSize = 13 }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeFontSize = Math.max(9, fontSize - 2);

  return (
    <View style={[styles.codeBubble, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.codeHeader, { backgroundColor: theme.raised }]}>
        <Text style={[styles.codeLang, { color: theme.accent, fontSize: codeFontSize }]}>{lang}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={handleCopy} activeOpacity={0.7}>
          <Icon name={copied ? 'check' : 'copy'} size={15} color={theme.muted} />
          <Text style={[styles.copyText, { color: theme.muted, fontSize: codeFontSize }]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.codePre, { color: theme.text, fontSize: codeFontSize, lineHeight: Math.round(codeFontSize * 1.5) }]}>
        {code.trimEnd()}
      </Text>
    </View>
  );
}

function parseInline(text, theme, lineKey, fontSize = 13) {
  if (!text) return [];

  const linkRegex = /\[([^\]]+)\]\((file:\/\/\/[^\)]+|https?:\/\/[^\)]+)\)|(file:\/\/\/[^\s\)\],]+)/g;
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }

    if (match[3]) {
      const bareUrl = match[3];
      const urlPath = decodeURIComponent(bareUrl.replace(/^file:\/\//, ''));
      const rawName = urlPath.split('/').pop()?.split('\\').pop() || 'file';
      const cleanName = rawName.split('#')[0];
      const fragment = (bareUrl.match(/#(L\d+(?:-L?\d+)?)/) || [])[1];
      const label = fragment ? `${cleanName}:${fragment.replace(/L/g, '')}` : cleanName;
      segments.push({ type: 'file', label, url: bareUrl });
    } else {
      const labelText = match[1];
      const url = match[2];
      if (url.startsWith('file:///')) {
        const rawLabel = labelText.replace(/`/g, '').trim();
        const urlPath = decodeURIComponent(url.replace(/^file:\/\//, ''));
        const urlFileName = (urlPath.split('/').pop()?.split('\\').pop() || '').split('#')[0];
        const base = rawLabel.split('/').pop()?.split('\\').pop() || rawLabel;
        const cleanBase = (base.includes('.') ? base : (urlFileName || base)).split('#')[0];
        const fragment = (url.match(/#(L\d+(?:-L?\d+)?)/) || rawLabel.match(/#(L\d+(?:-L?\d+)?)/) || [])[1];
        const label = fragment ? `${cleanBase}:${fragment.replace(/L/g, '')}` : cleanBase;
        segments.push({ type: 'file', label, url });
      } else {
        segments.push({ type: 'web', label: labelText, url });
      }
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  const elements = [];
  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const segKey = `${lineKey}-s-${sIdx}`;

    if (seg.type === 'file') {
      elements.push(
        <Text
          key={segKey}
          style={[styles.fileLinkInline, { color: theme.accent, fontSize }]}
        >
          {` 📄 ${seg.label} `}
        </Text>
      );
    } else if (seg.type === 'web') {
      elements.push(
        <Text
          key={segKey}
          style={[styles.webLinkInline, { color: theme.accent, fontSize }]}
        >
          {seg.label}
        </Text>
      );
    } else {
      const singleTick = String.fromCharCode(96);
      const parts = seg.content.split(singleTick);
      for (let pIdx = 0; pIdx < parts.length; pIdx++) {
        const part = parts[pIdx];
        if (!part) continue;
        if (pIdx % 2 === 1) {
          elements.push(
            <Text
              key={`${segKey}-ic-${pIdx}`}
              style={[styles.inlineCode, { color: theme.accent, fontSize: Math.max(10, fontSize - 1) }]}
            >
              {part}
            </Text>
          );
        } else {
          const bParts = part.split('**');
          for (let bIdx = 0; bIdx < bParts.length; bIdx++) {
            const bp = bParts[bIdx];
            if (!bp) continue;
            elements.push(
              <Text
                key={`${segKey}-bp-${pIdx}-${bIdx}`}
                style={bIdx % 2 === 1 ? styles.boldText : undefined}
              >
                {bp}
              </Text>
            );
          }
        }
      }
    }
  }

  return elements;
}

function isTableDelimiter(line) {
  if (!line || !line.includes('-')) return false;
  const trimmed = line.trim();
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(trimmed);
}

function parseTableRow(line) {
  let content = line.trim();
  if (content.startsWith('|')) content = content.slice(1);
  if (content.endsWith('|')) content = content.slice(0, -1);
  return content.split('|').map((c) => c.trim());
}

function parseTableAlignments(delimiterLine) {
  const cells = parseTableRow(delimiterLine);
  return cells.map((cell) => {
    const trimmed = cell.trim();
    const startColon = trimmed.startsWith(':');
    const endColon = trimmed.endsWith(':');
    if (startColon && endColon) return 'center';
    if (endColon) return 'right';
    return 'left';
  });
}

function TableBlock({ headers, alignments, rows, theme, fontSize = 13, blockKey }) {
  const cellFontSize = Math.max(10, fontSize - 1);
  const colWidths = headers.map((h, colIdx) => {
    let maxLen = h.length;
    for (const r of rows) {
      if (r[colIdx] && r[colIdx].length > maxLen) {
        maxLen = r[colIdx].length;
      }
    }
    return Math.min(220, Math.max(85, maxLen * 8.5));
  });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={true}
      style={styles.tableScroll}
      contentContainerStyle={{ paddingRight: 4 }}
    >
      <View style={[styles.tableContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.tableHeaderRow, { backgroundColor: theme.raised, borderBottomColor: theme.border }]}>
          {headers.map((h, cIdx) => (
            <View
              key={`th-${cIdx}`}
              style={[
                styles.tableCell,
                cIdx < headers.length - 1 && { borderRightWidth: 1, borderRightColor: theme.border },
                { width: colWidths[cIdx] }
              ]}
            >
              <Text
                style={[
                  styles.tableHeaderText,
                  {
                    color: theme.text,
                    fontSize: cellFontSize,
                    textAlign: alignments[cIdx] || 'left'
                  }
                ]}
              >
                {parseInline(h, theme, `${blockKey}-th-${cIdx}`, cellFontSize)}
              </Text>
            </View>
          ))}
        </View>

        {rows.map((row, rIdx) => {
          const isLast = rIdx === rows.length - 1;
          const isEven = rIdx % 2 === 1;
          return (
            <View
              key={`tr-${rIdx}`}
              style={[
                styles.tableRow,
                !isLast && { borderBottomColor: theme.border, borderBottomWidth: 1 },
                isEven && { backgroundColor: theme.raised }
              ]}
            >
              {headers.map((_, cIdx) => {
                const cellText = row[cIdx] || '';
                return (
                  <View
                    key={`td-${rIdx}-${cIdx}`}
                    style={[
                      styles.tableCell,
                      cIdx < headers.length - 1 && { borderRightWidth: 1, borderRightColor: theme.border },
                      { width: colWidths[cIdx] }
                    ]}
                  >
                    <Text
                      style={[
                        styles.tableCellText,
                        {
                          color: theme.text,
                          fontSize: cellFontSize,
                          textAlign: alignments[cIdx] || 'left'
                        }
                      ]}
                    >
                      {parseInline(cellText, theme, `${blockKey}-td-${rIdx}-${cIdx}`, cellFontSize)}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const CALLOUT_CONFIGS = {
  NOTE: { label: 'NOTE', icon: 'chat', color: '#3b82f6' },
  TIP: { label: 'TIP', icon: 'check', color: '#10b981' },
  IMPORTANT: { label: 'IMPORTANT', icon: 'shield', color: '#8b5cf6' },
  WARNING: { label: 'WARNING', icon: 'shield', color: '#f59e0b' },
  CAUTION: { label: 'CAUTION', icon: 'x', color: '#ef4444' }
};

function CalloutBlock({ type, lines, theme, fontSize = 13, blockKey }) {
  const conf = CALLOUT_CONFIGS[type] || { label: type, icon: 'shield', color: theme.accent };

  return (
    <View
      style={[
        styles.calloutCard,
        {
          backgroundColor: theme.raised,
          borderColor: theme.border,
          borderLeftColor: conf.color
        }
      ]}
    >
      <View style={styles.calloutHeader}>
        <Icon name={conf.icon} size={14} color={conf.color} />
        <Text style={[styles.calloutLabel, { color: conf.color }]}>{conf.label}</Text>
      </View>
      <View style={styles.calloutBody}>
        {lines.map((l, lIdx) => (
          <Text
            key={`co-${lIdx}`}
            style={[styles.bubbleText, { color: theme.text, fontSize, lineHeight: Math.round(fontSize * 1.5) }]}
          >
            {parseInline(l, theme, `${blockKey}-co-${lIdx}`, fontSize)}
          </Text>
        ))}
      </View>
    </View>
  );
}

function QuoteBlock({ lines, theme, fontSize = 13, blockKey }) {
  return (
    <View
      style={[
        styles.quoteCard,
        {
          borderLeftColor: theme.subtle || theme.border,
          backgroundColor: theme.raised
        }
      ]}
    >
      {lines.map((l, lIdx) => (
        <Text
          key={`q-${lIdx}`}
          style={[styles.bubbleText, { color: theme.muted, fontSize, lineHeight: Math.round(fontSize * 1.5) }]}
        >
          {parseInline(l, theme, `${blockKey}-q-${lIdx}`, fontSize)}
        </Text>
      ))}
    </View>
  );
}

function MarkdownMessage({ text, theme, fontSize = 13 }) {
  if (!text) return null;

  const tripleTick = String.fromCharCode(96, 96, 96);
  const blocks = text.split(tripleTick);
  const elements = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block) continue;

    if (i % 2 === 1) {
      let lang = 'code';
      let codeContent = block;
      const firstNl = block.indexOf('\n');
      if (firstNl !== -1) {
        const possibleLang = block.slice(0, firstNl).trim();
        if (possibleLang) lang = possibleLang;
        codeContent = block.slice(firstNl + 1);
      }
      elements.push(
        <CodeSnippet
          key={`cb-${i}`}
          code={codeContent}
          lang={lang}
          theme={theme}
          fontSize={fontSize}
        />
      );
    } else {
      const lines = block.split('\n');
      let j = 0;
      while (j < lines.length) {
        const line = lines[j];
        const trimmed = line.trim();

        if (!trimmed) {
          elements.push(<View key={`sp-${i}-${j}`} style={{ height: 6 }} />);
          j++;
          continue;
        }

        if (line.includes('|') && j + 1 < lines.length && isTableDelimiter(lines[j + 1])) {
          const headers = parseTableRow(line);
          const alignments = parseTableAlignments(lines[j + 1]);
          const rows = [];
          j += 2;
          while (j < lines.length && lines[j].trim() && lines[j].includes('|')) {
            rows.push(parseTableRow(lines[j]));
            j++;
          }
          elements.push(
            <TableBlock
              key={`tbl-${i}-${j}`}
              headers={headers}
              alignments={alignments}
              rows={rows}
              theme={theme}
              fontSize={fontSize}
              blockKey={`${i}-${j}`}
            />
          );
          continue;
        }

        if (trimmed.startsWith('>')) {
          const rawQuoteLines = [];
          const quoteStartIndex = j;
          while (j < lines.length && lines[j].trim().startsWith('>')) {
            rawQuoteLines.push(lines[j].trim().replace(/^>\s?/, ''));
            j++;
          }
          const firstLine = rawQuoteLines[0] || '';
          const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i);
          if (alertMatch) {
            const alertType = alertMatch[1].toUpperCase();
            const remainder = alertMatch[2]?.trim();
            const bodyLines = remainder ? [remainder, ...rawQuoteLines.slice(1)] : rawQuoteLines.slice(1);
            elements.push(
              <CalloutBlock
                key={`co-${i}-${quoteStartIndex}`}
                type={alertType}
                lines={bodyLines.length > 0 ? bodyLines : ['']}
                theme={theme}
                fontSize={fontSize}
                blockKey={`${i}-${quoteStartIndex}`}
              />
            );
          } else {
            elements.push(
              <QuoteBlock
                key={`qb-${i}-${quoteStartIndex}`}
                lines={rawQuoteLines}
                theme={theme}
                fontSize={fontSize}
                blockKey={`${i}-${quoteStartIndex}`}
              />
            );
          }
          continue;
        }

        if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
          elements.push(
            <View key={`hr-${i}-${j}`} style={[styles.mdHr, { backgroundColor: theme.border }]} />
          );
          j++;
          continue;
        }

        const taskMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          const isChecked = taskMatch[1].toLowerCase() === 'x';
          elements.push(
            <View key={`task-${i}-${j}`} style={styles.taskRow}>
              <Icon
                name={isChecked ? 'check' : 'shield'}
                size={14}
                color={isChecked ? theme.accent : theme.muted}
              />
              <Text style={[styles.bubbleText, { color: theme.text, fontSize, lineHeight: Math.round(fontSize * 1.5), flex: 1, marginLeft: 6 }]}>
                {parseInline(taskMatch[2], theme, `${i}-${j}`, fontSize)}
              </Text>
            </View>
          );
          j++;
          continue;
        }

        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (numMatch) {
          elements.push(
            <View key={`num-${i}-${j}`} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color: theme.accent, fontSize }]}>
                {`${numMatch[1]}. `}
              </Text>
              <Text style={[styles.bubbleText, { color: theme.text, fontSize, lineHeight: Math.round(fontSize * 1.5), flex: 1 }]}>
                {parseInline(numMatch[2], theme, `${i}-${j}`, fontSize)}
              </Text>
            </View>
          );
          j++;
          continue;
        }

        if (line.startsWith('### ')) {
          elements.push(
            <Text key={`h3-${i}-${j}`} style={[styles.mdH3, { color: theme.text, fontSize: fontSize + 2 }]}>
              {line.slice(4)}
            </Text>
          );
          j++;
          continue;
        }
        if (line.startsWith('## ')) {
          elements.push(
            <Text key={`h2-${i}-${j}`} style={[styles.mdH2, { color: theme.text, fontSize: fontSize + 4 }]}>
              {line.slice(3)}
            </Text>
          );
          j++;
          continue;
        }
        if (line.startsWith('# ')) {
          elements.push(
            <Text key={`h1-${i}-${j}`} style={[styles.mdH1, { color: theme.text, fontSize: fontSize + 6 }]}>
              {line.slice(2)}
            </Text>
          );
          j++;
          continue;
        }

        const isBullet = trimmed.startsWith('- ') || trimmed.startsWith('* ');
        const lineContent = isBullet ? trimmed.slice(2) : line;

        elements.push(
          <View
            key={`ln-${i}-${j}`}
            style={isBullet ? styles.bulletRow : styles.textRow}
          >
            {isBullet && (
              <Text style={[styles.bulletDot, { color: theme.accent, fontSize }]}>• </Text>
            )}
            <Text style={[styles.bubbleText, { color: theme.text, fontSize, lineHeight: Math.round(fontSize * 1.5) }]}>
              {parseInline(lineContent, theme, `${i}-${j}`, fontSize)}
            </Text>
          </View>
        );
        j++;
      }
    }
  }

  return <View style={styles.mdContainer}>{elements}</View>;
}

function ChatEmptyState({
  profile,
  allProfiles,
  onSwitchWorkspace,
  onSelectPrompt,
  theme
}) {
  const otherProfiles = allProfiles.filter((p) => p.id !== profile?.id);
  const quickPrompts = [
    { label: 'Run test suite', icon: 'terminal', prompt: 'Run tests across all workspaces' },
    { label: 'Check git status', icon: 'shield', prompt: 'Check git status and report modified files' },
    { label: 'Explain architecture', icon: 'file', prompt: 'Summarize current codebase architecture' },
    { label: 'Pending tasks', icon: 'check', prompt: 'What tasks are remaining in this project?' }
  ];

  return (
    <View style={styles.emptyContainer}>
      <View style={styles.orbWrap}>
        <View style={[styles.orbPulseRing, { borderColor: `${theme.accent}33` }]} />
        <View style={[styles.orbInner, { backgroundColor: theme.accent }]}>
          <Icon name="chat" size={26} color="#ffffff" />
        </View>
      </View>

      <Text style={[styles.emptyHeading, { color: theme.text }]}>Antigravity Remote</Text>
      <Text style={[styles.emptySub, { color: theme.muted }]}>
        Connected to your remote workspace. Send a message to start.
      </Text>

      {profile && (
        <View style={[styles.activeWsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.activeWsHeader}>
            <View style={styles.wsLabelRow}>
              <View style={[styles.activeDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.wsTitle, { color: theme.text }]} numberOfLines={1}>
                {profile.name}
              </Text>
            </View>
            <View style={[styles.onlinePill, { backgroundColor: `${theme.success}20` }]}>
              <Text style={[styles.onlinePillText, { color: theme.success }]}>ACTIVE</Text>
            </View>
          </View>
          <Text style={[styles.wsHost, { color: theme.muted }]} numberOfLines={1}>
            {profile.baseUrl}
          </Text>
        </View>
      )}

      {otherProfiles.length > 0 && (
        <View style={styles.switchSection}>
          <Text style={[styles.sectionEyebrow, { color: theme.muted }]}>
            SWITCH WORKSPACE
          </Text>
          <View style={styles.switchGrid}>
            {otherProfiles.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.switchCard,
                  { backgroundColor: theme.surface, borderColor: theme.border }
                ]}
                onPress={() => onSwitchWorkspace(item)}
                activeOpacity={0.7}
              >
                <View style={styles.switchCardLeft}>
                  <Icon name="grid" size={16} color={theme.accent} />
                  <Text style={[styles.switchCardName, { color: theme.text }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                </View>
                <Icon name="chevron" size={14} color={theme.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.startersSection}>
        <Text style={[styles.sectionEyebrow, { color: theme.muted }]}>
          QUICK ACTIONS
        </Text>
        <View style={styles.starterGrid}>
          {quickPrompts.map((item, idx) => (
            <TouchableOpacity
              key={`qp-${idx}`}
              style={[
                styles.starterPill,
                { backgroundColor: theme.surface, borderColor: theme.border }
              ]}
              onPress={() => onSelectPrompt(item.prompt)}
              activeOpacity={0.7}
            >
              <Icon name={item.icon} size={15} color={theme.accent} />
              <Text style={[styles.starterText, { color: theme.text }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </View>
  );
}

const WORKING_PHRASES = [
  'Thinking through workspace...',
  'Analyzing context & code...',
  'Formulating solution plan...',
  'Writing implementation steps...',
  'Executing agent actions...',
  'Reviewing and refining output...'
];

function AgentWorkingIndicator({ theme }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    const phraseTimer = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true
      }).start(({ finished }) => {
        if (!finished) return;
        setPhraseIndex((prev) => (prev + 1) % WORKING_PHRASES.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }).start();
      });
    }, 8000);

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.14,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    );
    pulse.start();

    const makeDotAnim = (anim, delay) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, {
            toValue: -5,
            duration: 280,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(anim, {
            toValue: 0,
            duration: 280,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true
          }),
          Animated.delay(440 - delay)
        ])
      );
    };

    const d1 = makeDotAnim(dot1, 0);
    const d2 = makeDotAnim(dot2, 140);
    const d3 = makeDotAnim(dot3, 280);
    d1.start();
    d2.start();
    d3.start();

    return () => {
      clearInterval(timer);
      clearInterval(phraseTimer);
      pulse.stop();
      d1.stop();
      d2.stop();
      d3.stop();
    };
  }, []);

  const formatTime = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.agentMessageRow}>
      <Animated.View
        style={[
          styles.agentAvatar,
          {
            backgroundColor: theme.accent,
            transform: [{ scale: pulseAnim }]
          }
        ]}
      >
        <Text style={styles.agentAvatarText}>AG</Text>
      </Animated.View>
      <View
        style={[
          styles.agentWorkingBubble,
          {
            backgroundColor: theme.surface,
            borderColor: `${theme.accent}45`
          }
        ]}
      >
        <View style={styles.agentWorkingHeader}>
          <View style={styles.agentWorkingBadge}>
            <View style={[styles.agentWorkingLiveDot, { backgroundColor: theme.accent }]} />
            <Text style={[styles.agentWorkingBadgeText, { color: theme.accent }]}>
              THINKING
            </Text>
          </View>
          <Text style={[styles.agentWorkingTimer, { color: theme.muted }]}>
            {formatTime(seconds)}
          </Text>
        </View>

        <Animated.View style={[styles.agentWorkingPhraseWrap, { opacity: fadeAnim }]}>
          <Text style={[styles.agentWorkingPhrase, { color: theme.text }]}>
            {WORKING_PHRASES[phraseIndex]}
          </Text>
        </Animated.View>

        <View style={styles.agentWorkingDotsRow}>
          <Animated.View
            style={[
              styles.agentWorkingDot,
              {
                backgroundColor: theme.accent,
                transform: [{ translateY: dot1 }]
              }
            ]}
          />
          <Animated.View
            style={[
              styles.agentWorkingDot,
              {
                backgroundColor: theme.accent,
                transform: [{ translateY: dot2 }]
              }
            ]}
          />
          <Animated.View
            style={[
              styles.agentWorkingDot,
              {
                backgroundColor: theme.accent,
                transform: [{ translateY: dot3 }]
              }
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const ChatMessageBubble = React.memo(function ChatMessageBubble({ item, theme, fontSize = 13 }) {
  if (!item) return null;
  const isUser = item.role === 'user' || item.sender === 'user';
  const isTool = item.kind === 'tool';

  if (isTool) {
    return (
      <View
        style={[
          styles.toolStep,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border
          }
        ]}
      >
        <View
          style={[
            styles.tinyIcon,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border
            }
          ]}
        >
          <Icon name="terminal" size={17} color={theme.accent} />
        </View>
        <View style={styles.toolStepContent}>
          <Text style={[styles.toolStepTitle, { color: theme.text }]} numberOfLines={1}>
            {item.title || 'Executed tool'}
          </Text>
          <Text style={[styles.toolStepDesc, { color: theme.muted }]} numberOfLines={1}>
            {item.text || item.summary || 'Command output'}
          </Text>
        </View>
        <Icon name="chevron" size={17} color={theme.muted} />
      </View>
    );
  }

  if (isUser) {
    const text = typeof item.text === 'string' ? item.text : '';
    const hasAttachment = text.startsWith('[Attachment:');
    let attachmentLine = null;
    let bodyText = text;

    if (hasAttachment) {
      const doubleNl = text.indexOf('\n\n');
      if (doubleNl !== -1) {
        attachmentLine = text.slice(0, doubleNl);
        bodyText = text.slice(doubleNl + 2);
      } else {
        attachmentLine = text;
        bodyText = '';
      }
      if (bodyText.includes('Agent instruction:')) {
        const nextPart = bodyText.split('Agent instruction:')[1];
        const instructionEnd = nextPart ? nextPart.indexOf('\n\n') : -1;
        if (instructionEnd !== -1) {
          bodyText = nextPart.slice(instructionEnd + 2).trim();
        } else {
          bodyText = '';
        }
      }
    }

    const badgeLabel = attachmentLine
      ? attachmentLine.split('|')[0].replace(/\[Attachment:\s*|\s*\]/g, '').trim()
      : null;

    const bubbleBg = theme.userBubble || (theme.mode === 'dark' ? '#2f2f2f' : '#f2f2f2');
    const bubbleBorder = theme.userBubbleBorder || (theme.mode === 'dark' ? '#3d3d3d' : '#e4e4e7');
    const bubbleTextColor = theme.userText || (theme.mode === 'dark' ? '#ececec' : '#0d0d0d');

    return (
      <View style={styles.userMessageRow}>
        <View style={[styles.userBubble, { backgroundColor: bubbleBg, borderColor: bubbleBorder, borderWidth: 1 }]}>
          {badgeLabel && (
            <View style={[styles.userAttachmentBadge, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
              <Icon name="attach" size={13} color={theme.accent} />
              <Text style={[styles.userAttachmentText, { color: bubbleTextColor }]} numberOfLines={2}>
                {badgeLabel}
              </Text>
            </View>
          )}
          {Boolean(bodyText) && (
            <Text
              style={[
                styles.userBubbleText,
                {
                  color: bubbleTextColor,
                  fontSize,
                  lineHeight: Math.round(fontSize * 1.5)
                }
              ]}
            >
              {bodyText}
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.agentMessageRow}>
      <View style={[styles.agentAvatar, { backgroundColor: theme.accent }]}>
        <Text style={styles.agentAvatarText}>AG</Text>
      </View>
      <View
        style={[
          styles.agentBubble,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border
          }
        ]}
      >
        <MarkdownMessage text={item.text} theme={theme} fontSize={fontSize} />
      </View>
    </View>
  );
});

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { theme, isDark, chatFontSize } = useTheme();
  const fontConfig = CHAT_FONT_SIZES[chatFontSize] || CHAT_FONT_SIZES.medium;
  const chatTextSize = fontConfig.size;
  const [profile, setProfile] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendingStatus, setSendingStatus] = useState('');
  const [agentStatus, setAgentStatus] = useState('idle');
  const [wsConnected, setWsConnected] = useState(false);
  const [blinker, setBlinker] = useState(true);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const [sessions, setSessions] = useState([]);
  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const timeA = a.lastActivityAt || a.lastModified || 0;
      const timeB = b.lastActivityAt || b.lastModified || 0;
      if (timeA !== timeB) return timeB - timeA;
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [sessions]);
  const [currentSessionId, setCurrentSessionId] = useState(params?.sessionId || null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState(params?.sessionTitle || null);
  const [sessionsModalVisible, setSessionsModalVisible] = useState(false);
  const [newSessionModalVisible, setNewSessionModalVisible] = useState(false);
  const [newSessionText, setNewSessionText] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  const flatListRef = useRef(null);
  const defaultBottomMargin = Math.max(insets.bottom, 16) + 78;
  const composerBottomAnim = useRef(new Animated.Value(defaultBottomMargin)).current;
  const isKeyboardOpenRef = useRef(false);

  useEffect(() => {
    if (params?.sessionId && params.sessionId !== currentSessionId) {
      setCurrentSessionId(params.sessionId);
      if (params.sessionTitle) {
        setCurrentSessionTitle(params.sessionTitle);
      }
    }
  }, [params?.sessionId, params?.sessionTitle]);

  const reversedMessages = useMemo(() => {
    return messages && messages.length > 0 ? [...messages].reverse() : [];
  }, [messages]);

  useEffect(() => {
    if (!isKeyboardOpenRef.current) {
      composerBottomAnim.setValue(Math.max(insets.bottom, 16) + 78);
    }
  }, [insets.bottom]);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlinker((b) => !b);
    }, 550);

    const onKeyboardShow = (e) => {
      isKeyboardOpenRef.current = true;
      setIsKeyboardOpen(true);
      const rawHeight = e?.endCoordinates?.height || 0;
      const kHeight = rawHeight > 0 ? rawHeight : (Platform.OS === 'android' ? 290 : 260);
      const targetBottom = kHeight + 10;
      const duration = Platform.OS === 'ios' ? (e?.duration || 250) : 200;

      Animated.timing(composerBottomAnim, {
        toValue: targetBottom,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false
      }).start();

      setTimeout(() => {
        if (messages && messages.length > 0) {
          flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        }
      }, 50);
    };

    const onKeyboardHide = (e) => {
      isKeyboardOpenRef.current = false;
      setIsKeyboardOpen(false);
      const targetBottom = Math.max(insets.bottom, 16) + 78;
      const duration = Platform.OS === 'ios' ? (e?.duration || 250) : 200;

      Animated.timing(composerBottomAnim, {
        toValue: targetBottom,
        duration,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false
      }).start();
    };

    const showSub1 = Keyboard.addListener('keyboardWillShow', onKeyboardShow);
    const showSub2 = Keyboard.addListener('keyboardDidShow', onKeyboardShow);
    const hideSub1 = Keyboard.addListener('keyboardWillHide', onKeyboardHide);
    const hideSub2 = Keyboard.addListener('keyboardDidHide', onKeyboardHide);

    return () => {
      clearInterval(interval);
      showSub1.remove();
      showSub2.remove();
      hideSub1.remove();
      hideSub2.remove();
    };
  }, [insets.bottom, messages]);

  const loadMessages = useCallback(async (targetSessionId) => {
    try {
      const [active, profilesList] = await Promise.all([
        getActiveProfile(),
        getProfiles()
      ]);
      setProfile(active);
      setAllProfiles(profilesList || []);
      if (active) {
        const [sessList, st] = await Promise.all([
          fetchSessions(active).catch(() => []),
          fetchState(active).catch(() => null)
        ]);
        if (sessList) {
          setSessions(sessList);
        }

        const sid = targetSessionId !== undefined ? targetSessionId : currentSessionId;
        const resolvedSid = sid || st?.activeSessionId || (sessList && sessList[0]?.id) || null;
        if (resolvedSid && resolvedSid !== currentSessionId) {
          setCurrentSessionId(resolvedSid);
        }

        if (resolvedSid && sessList) {
          const found = sessList.find((s) => s.id === resolvedSid);
          if (found) {
            setCurrentSessionTitle(found.title || 'Untitled');
          }
        }

        const list = await fetchMessages(active, 50, resolvedSid || undefined).catch(() => []);
        if (list) setMessages(list);
        if (st?.status) setAgentStatus(st.status);
      }
    } catch {}
  }, [currentSessionId]);

  useFocusEffect(
    useCallback(() => {
      loadMessages();
    }, [loadMessages])
  );

  useEffect(() => {
    if (!profile) return;
    const ws = new BridgeWebSocketClient(
      profile,
      (event) => {
        if (event && event.type === 'active_session_changed' && event.sessionId) {
          setCurrentSessionId(event.sessionId);
          if (event.title) {
            setCurrentSessionTitle(event.title);
          }
          loadMessages(event.sessionId);
          return;
        }
        loadMessages();
      },
      (connected) => {
        setWsConnected(connected);
      }
    );
    return () => ws.close();
  }, [profile, loadMessages]);

  const scrollToBottom = () => {
    if (messages && messages.length > 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  };

  const handleSwitchSession = async (session) => {
    if (!profile) return;
    setCurrentSessionId(session.id);
    setCurrentSessionTitle(session.title || 'Untitled');
    setSessionsModalVisible(false);
    try {
      await focusSession(profile, session.id);
    } catch {}
    await loadMessages(session.id);
    setTimeout(scrollToBottom, 60);
  };

  const handleCreateSession = async () => {
    if (!profile) return;
    setCreatingSession(true);
    try {
      const res = await createSession(profile, newSessionText.trim() || undefined);
      setNewSessionModalVisible(false);
      setNewSessionText('');
      if (res?.sessionId) {
        setCurrentSessionId(res.sessionId);
        setCurrentSessionTitle(newSessionText.trim() || 'New Conversation');
        await loadMessages(res.sessionId);
      } else {
        await loadMessages();
      }
    } catch (err) {
      alert(err.message || 'Failed to create conversation');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleSwitchWorkspace = async (target) => {
    await setActiveProfileId(target.id);
    await loadMessages();
  };

  const handleSelectPrompt = (promptText) => {
    setInputText(promptText);
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        multiple: true,
        copyToCacheDirectory: true
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setAttachments((prev) => [...prev, ...res.assets]);
      }
    } catch (err) {
      alert(err.message || 'Failed to select attachment');
    }
  };

  const handleRemoveAttachment = (idxToRemove) => {
    setAttachments((prev) => prev.filter((_, idx) => idx !== idxToRemove));
  };

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if ((!trimmed && attachments.length === 0) || !profile || sending) return;

    setSending(true);
    setSendingStatus(attachments.length > 0 ? 'Uploading attachments...' : 'Sending prompt...');
    const pendingAttachments = [...attachments];
    setInputText('');
    setAttachments([]);

    try {
      let messageText = trimmed;
      if (pendingAttachments.length > 0) {
        const uploadedList = [];
        for (let i = 0; i < pendingAttachments.length; i++) {
          const att = pendingAttachments[i];
          setSendingStatus(`Uploading (${i + 1}/${pendingAttachments.length}): ${att.name || 'file'}...`);
          const res = await uploadFile(profile, att);
          uploadedList.push(res);
        }

        const summaryList = uploadedList
          .map((u) => `[Attachment: ${u.originalName} | Saved to: ${u.path} (${u.mimeType}, ${Math.round(u.size / 1024)}KB)]\nAgent instruction: The user attached ${u.originalName}. It is stored at "${u.path}". Please inspect and view this file.`)
          .join('\n\n');

        messageText = trimmed ? `${summaryList}\n\n${trimmed}` : summaryList;
      }

      setSendingStatus('Delivering prompt to agent...');

      const optimisticId = `user-opt-${Date.now()}`;
      const optimisticMsg = {
        id: optimisticId,
        role: 'user',
        text: messageText,
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(scrollToBottom, 60);

      await sendPrompt(profile, messageText, currentSessionId || undefined);
      await loadMessages(currentSessionId || undefined);
      setTimeout(scrollToBottom, 150);
    } catch (err) {
      alert(err.message || 'Failed to send message');
      setAttachments(pendingAttachments);
      setInputText(trimmed);
    } finally {
      setSending(false);
      setSendingStatus('');
    }
  };

  const handleStop = async () => {
    if (!profile) return;
    try {
      await sendStop(profile, currentSessionId || undefined);
      await loadMessages(currentSessionId || undefined);
    } catch (err) {
      alert(err.message || 'Failed to stop agent');
    }
  };

  const isWorking = agentStatus === 'generating';
  const canSend = !sending && (Boolean(inputText.trim()) || attachments.length > 0);

  const renderItem = useCallback(
    ({ item }) => <ChatMessageBubble item={item} theme={theme} fontSize={chatTextSize} />,
    [theme, chatTextSize]
  );

  const statusLabel = wsConnected
    ? `LIVE · ${(profile?.name || 'LAPTOP').toUpperCase()}`
    : `${(profile?.name || 'LAPTOP').toUpperCase()}`;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar title={profile?.name || 'acme / dashboard'} status={statusLabel} />

      <View style={[styles.sessionBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <TouchableOpacity
          style={styles.sessionSelector}
          onPress={() => setSessionsModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.sessionDot, { backgroundColor: isWorking ? theme.success : theme.accent }]} />
          <Text style={[styles.sessionTitleText, { color: theme.text }]} numberOfLines={1}>
            {currentSessionTitle || 'Active Conversation'}
          </Text>
          <Icon name="chevron" size={14} color={theme.muted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.newSessionBtn, { backgroundColor: theme.raised, borderColor: theme.border }]}
          onPress={() => setNewSessionModalVisible(true)}
          activeOpacity={0.7}
        >
          <Icon name="plus" size={14} color={theme.accent} />
          <Text style={[styles.newSessionBtnText, { color: theme.accent }]}>New</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.chatBody, { backgroundColor: theme.bg }]}>
        <FlatList
          ref={flatListRef}
          inverted={messages.length > 0}
          data={messages.length > 0 ? reversedMessages : []}
          keyExtractor={(item, index) => `${item?.id || 'msg'}-${index}`}
          renderItem={renderItem}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            setShowScrollBottom(y > 140);
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            messages.length > 0
              ? { paddingTop: defaultBottomMargin + 76 }
              : { paddingBottom: defaultBottomMargin + 76 },
            messages.length === 0 && styles.listContentEmpty
          ]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            isWorking ? <AgentWorkingIndicator theme={theme} /> : null
          }
          ListFooterComponent={
            messages.length > 0 ? (
              <Text style={[styles.dateLabel, { color: theme.subtle }]}>TODAY, 10:42</Text>
            ) : null
          }
          ListEmptyComponent={
            <ChatEmptyState
              profile={profile}
              allProfiles={allProfiles}
              onSwitchWorkspace={handleSwitchWorkspace}
              onSelectPrompt={handleSelectPrompt}
              theme={theme}
            />
          }
        />

        {showScrollBottom && (
          <TouchableOpacity
            style={[
              styles.scrollBottomButton,
              {
                backgroundColor: isDark ? 'rgba(28, 28, 32, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.08)',
                bottom: defaultBottomMargin + 76
              }
            ]}
            onPress={scrollToBottom}
            activeOpacity={0.8}
          >
            <Icon name="arrow-down" size={17} color={theme.accent} />
          </TouchableOpacity>
        )}
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.bottomGlassBackdrop,
          {
            height: defaultBottomMargin + 85,
            backgroundColor: isDark ? 'rgba(10, 10, 12, 0.68)' : 'rgba(250, 250, 252, 0.72)',
            borderTopColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'
          }
        ]}
      />

      <Animated.View
        style={[
          styles.composerContainer,
          {
            bottom: composerBottomAnim
          }
        ]}
      >
        {sending && (
          <View
            style={[
              styles.sendingBar,
              {
                backgroundColor: isDark ? 'rgba(24, 24, 28, 0.85)' : 'rgba(255, 255, 255, 0.88)',
                borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
              }
            ]}
          >
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={[styles.sendingText, { color: theme.text }]} numberOfLines={1}>
              {sendingStatus || 'Sending prompt...'}
            </Text>
          </View>
        )}

        {attachments.length > 0 && (
          <View style={styles.attachmentStrip}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachmentStripContent}
            >
              {attachments.map((item, index) => (
                <View
                  key={`att-${item.name}-${index}`}
                  style={[
                    styles.attachmentChip,
                    {
                      backgroundColor: isDark ? 'rgba(32, 32, 38, 0.82)' : 'rgba(240, 240, 245, 0.88)',
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)'
                    }
                  ]}
                >
                  <Icon name="attach" size={14} color={theme.accent} />
                  <View style={styles.attachmentChipTextWrap}>
                    <Text style={[styles.attachmentChipName, { color: theme.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {item.size ? (
                      <Text style={[styles.attachmentChipSize, { color: theme.muted }]}>
                        {Math.round(item.size / 1024)} KB
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.attachmentRemoveBtn}
                    onPress={() => handleRemoveAttachment(index)}
                    disabled={sending}
                    activeOpacity={0.7}
                  >
                    <Icon name="x" size={13} color={theme.muted} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View
          style={[
            styles.composer,
            {
              backgroundColor: isDark ? 'rgba(22, 22, 26, 0.78)' : 'rgba(255, 255, 255, 0.82)',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)',
              borderTopColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.95)'
            }
          ]}
        >
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handlePickDocument}
            disabled={sending}
            activeOpacity={0.7}
          >
            <Icon name="attach" size={20} color={attachments.length > 0 ? theme.accent : theme.muted} />
          </TouchableOpacity>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                textAlign: 'left',
                textAlignVertical: 'center'
              }
            ]}
            placeholder={isWorking ? 'Give follow-up prompt...' : 'Message your agent'}
            placeholderTextColor={theme.subtle}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            editable={!sending}
            onFocus={() => {
              setTimeout(scrollToBottom, 150);
            }}
          />
          <View style={styles.composerActions}>
            {isWorking && (
              <TouchableOpacity
                style={[styles.composerBtn, styles.stopBtn, { backgroundColor: theme.danger }]}
                onPress={handleStop}
                disabled={sending}
                activeOpacity={0.8}
              >
                <View style={styles.stopSquare} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.composerBtn,
                isWorking ? styles.sendBtnWorking : styles.sendBtnIdle,
                {
                  backgroundColor: canSend
                    ? theme.accent
                    : (isWorking
                        ? (theme.mode === 'dark' ? '#383838' : '#e4e4e7')
                        : `${theme.accent}65`),
                  opacity: canSend ? 1 : (isWorking ? 0.45 : 0.6)
                }
              ]}
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Icon
                  name="send"
                  size={isWorking ? 16 : 19}
                  color={canSend ? '#ffffff' : (isWorking ? theme.muted : '#ffffff')}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Animated.View>

      <Modal
        visible={sessionsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSessionsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>Conversations</Text>
              <TouchableOpacity onPress={() => setSessionsModalVisible(false)}>
                <Icon name="x" size={20} color={theme.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 360 }}>
              {sortedSessions.length === 0 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                  <Text style={{ color: theme.muted, fontSize: 12 }}>No conversations found</Text>
                </View>
              ) : (
                sortedSessions.map((s) => {
                  const isSelected = s.id === currentSessionId;
                  const statusTone = s.status === 'generating' ? 'running' : s.status === 'awaiting_approval' ? 'warn' : 'muted';
                  const badgeText = s.status === 'generating' ? 'RUNNING' : s.status === 'awaiting_approval' ? 'APPROVAL' : 'IDLE';
                  const timeText = formatSessionTime(s.lastActivityAt || s.lastModified);

                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        styles.sessionRow,
                        {
                          backgroundColor: isSelected ? theme.raised : 'transparent',
                          borderColor: isSelected ? theme.accent : theme.border
                        }
                      ]}
                      onPress={() => handleSwitchSession(s)}
                    >
                      <View style={styles.sessionRowLeft}>
                        <View style={styles.sessionRowTitleRow}>
                          <Text style={[styles.sessionRowTitle, { color: theme.text }]} numberOfLines={1}>
                            {s.title || 'Untitled'}
                          </Text>
                          {Boolean(timeText) && (
                            <Text style={[styles.sessionRowTime, { color: theme.muted }]}>
                              {timeText}
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.sessionRowMeta, { color: theme.muted }]}>
                          {s.stepCount ? `${s.stepCount} steps` : 'Active conversation'}
                        </Text>
                      </View>
                      <StatusBadge text={badgeText} tone={statusTone} />
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.modalNewBtn, { backgroundColor: theme.accent }]}
              onPress={() => {
                setSessionsModalVisible(false);
                setNewSessionModalVisible(true);
              }}
            >
              <Icon name="plus" size={16} color="#ffffff" />
              <Text style={styles.modalNewBtnText}>Start New Conversation</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={newSessionModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewSessionModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>New Conversation</Text>
              <TouchableOpacity onPress={() => setNewSessionModalVisible(false)}>
                <Icon name="x" size={20} color={theme.muted} />
              </TouchableOpacity>
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.inputLabel, { color: theme.muted }]}>INITIAL PROMPT (OPTIONAL)</Text>
              <TextInput
                style={[
                  styles.modalInput,
                  {
                    backgroundColor: theme.raised,
                    borderColor: theme.border,
                    color: theme.text
                  }
                ]}
                value={newSessionText}
                onChangeText={setNewSessionText}
                placeholder="What would you like the agent to work on?"
                placeholderTextColor={theme.subtle}
                multiline
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: theme.border }]}
                onPress={() => setNewSessionModalVisible(false)}
              >
                <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreateBtn, { backgroundColor: theme.accent }]}
                onPress={handleCreateSession}
                disabled={creatingSession}
              >
                {creatingSession ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '600' }}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const fontRegular = Platform.select({
  ios: 'Poppins-Regular',
  android: 'Poppins_400Regular',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontBold = Platform.select({
  ios: 'Poppins-Bold',
  android: 'Poppins_700Bold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontSemiBold = Platform.select({
  ios: 'Poppins-SemiBold',
  android: 'Poppins_600SemiBold',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontMedium = Platform.select({
  ios: 'Poppins-Medium',
  android: 'Poppins_500Medium',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const fontMono = Platform.select({
  ios: 'JetBrainsMono-Regular',
  android: 'monospace',
  web: 'JetBrains Mono, monospace',
  default: 'monospace'
});

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  chatBody: {
    flex: 1,
    position: 'relative'
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24
  },
  dateLabel: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 0.8,
    marginVertical: 14,
    fontFamily: fontSemiBold
  },
  agentMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 14,
    maxWidth: '93%'
  },
  agentAvatar: {
    width: 27,
    height: 27,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  agentAvatarText: {
    color: '#ffffff',
    fontSize: 9,
    fontFamily: fontBold
  },
  agentBubble: {
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderWidth: 1,
    maxWidth: '88%'
  },
  userMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 14,
    marginLeft: 'auto',
    maxWidth: '90%'
  },
  userBubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderTopRightRadius: 5,
    borderWidth: 1
  },
  userBubbleText: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fontRegular
  },
  agentWorkingBubble: {
    maxWidth: '84%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6
  },
  agentWorkingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12
  },
  agentWorkingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  agentWorkingLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  agentWorkingBadgeText: {
    fontSize: 9,
    fontFamily: fontBold,
    letterSpacing: 0.8
  },
  agentWorkingTimer: {
    fontSize: 10,
    fontFamily: fontMono
  },
  agentWorkingPhraseWrap: {
    minHeight: 20,
    justifyContent: 'center'
  },
  agentWorkingPhrase: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontMedium
  },
  agentWorkingDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 10,
    marginTop: 2
  },
  agentWorkingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5
  },
  mdContainer: {
    gap: 4
  },
  mdH1: {
    fontSize: 17,
    fontFamily: fontBold,
    marginTop: 6,
    marginBottom: 2
  },
  mdH2: {
    fontSize: 15,
    fontFamily: fontBold,
    marginTop: 6,
    marginBottom: 2
  },
  mdH3: {
    fontSize: 13,
    fontFamily: fontSemiBold,
    marginTop: 4,
    marginBottom: 2
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 2
  },
  bulletDot: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: fontBold
  },
  textRow: {
    marginTop: 2
  },
  bubbleText: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fontRegular
  },
  boldText: {
    fontFamily: fontBold
  },
  inlineCode: {
    fontSize: 11,
    fontFamily: fontMono
  },
  fileLinkInline: {
    fontFamily: fontMedium,
    fontSize: 12
  },
  webLinkInline: {
    fontFamily: fontMedium,
    fontSize: 12,
    textDecorationLine: 'underline'
  },
  blinker: {
    fontSize: 13,
    fontFamily: fontBold
  },
  toolStep: {
    height: 52,
    marginLeft: 35,
    marginBottom: 14,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  tinyIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toolStepContent: {
    flex: 1
  },
  toolStepTitle: {
    fontSize: 11,
    fontFamily: fontSemiBold
  },
  toolStepDesc: {
    fontSize: 11,
    marginTop: 1,
    fontFamily: fontRegular
  },
  codeBubble: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 245,
    marginVertical: 4
  },
  codeHeader: {
    height: 34,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  codeLang: {
    fontSize: 10,
    fontFamily: fontMono
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  copyText: {
    fontSize: 10,
    fontFamily: fontRegular
  },
  codePre: {
    padding: 12,
    fontSize: 10,
    lineHeight: 16,
    fontFamily: fontMono
  },
  scrollBottomButton: {
    position: 'absolute',
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8
      },
      android: {
        elevation: 8
      },
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)'
      }
    })
  },
  composerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 10
  },
  bottomGlassBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    zIndex: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)'
      }
    })
  },
  composer: {
    width: '100%',
    maxWidth: 440,
    minHeight: 56,
    borderRadius: 9999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 7,
    gap: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.35,
        shadowRadius: 20
      },
      android: {
        elevation: 14
      },
      web: {
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.22)',
        backdropFilter: 'blur(24px) saturate(190%)',
        WebkitBackdropFilter: 'blur(24px) saturate(190%)'
      }
    })
  },
  attachButton: {
    width: 38,
    height: 38,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  input: {
    flex: 1,
    fontSize: 13,
    paddingVertical: Platform.OS === 'android' ? 6 : 8,
    paddingLeft: 4,
    paddingRight: 6,
    textAlign: 'left',
    textAlignVertical: 'center',
    maxHeight: 76,
    fontFamily: fontRegular
  },
  sendButton: {
    width: 39,
    height: 39,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center'
  },
  attachmentStrip: {
    width: '100%',
    maxWidth: 440,
    marginBottom: 8
  },
  attachmentStripContent: {
    gap: 8,
    paddingHorizontal: 4
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    borderWidth: 1,
    gap: 8,
    maxWidth: 220
  },
  attachmentChipTextWrap: {
    flexShrink: 1
  },
  attachmentChipName: {
    fontSize: 11,
    fontFamily: fontMedium
  },
  attachmentChipSize: {
    fontSize: 9,
    fontFamily: fontRegular
  },
  attachmentRemoveBtn: {
    padding: 3,
    borderRadius: 9999,
    marginLeft: 2
  },
  userAttachmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 6,
    alignSelf: 'flex-start'
  },
  userAttachmentText: {
    color: '#ffffff',
    fontSize: 11,
    fontFamily: fontMedium
  },
  stopButton: {},
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  composerBtn: {
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendBtnIdle: {
    width: 39,
    height: 39,
    borderRadius: 9999
  },
  sendBtnWorking: {
    width: 34,
    height: 34,
    borderRadius: 17
  },
  stopBtn: {
    width: 34,
    height: 34,
    borderRadius: 17
  },
  stopSquare: {
    width: 10,
    height: 10,
    backgroundColor: '#ffffff',
    borderRadius: 2
  },
  sendingBar: {
    width: '100%',
    maxWidth: 440,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6
  },
  sendingText: {
    fontSize: 11,
    fontFamily: fontMedium,
    flex: 1
  },
  listContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 20
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 16
  },
  orbWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative'
  },
  orbPulseRing: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5
  },
  orbInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center'
  },
  emptyHeading: {
    fontSize: 18,
    fontFamily: fontBold,
    marginBottom: 4,
    textAlign: 'center'
  },
  emptySub: {
    fontSize: 12,
    fontFamily: fontRegular,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 280
  },
  activeWsCard: {
    width: '100%',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16
  },
  activeWsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  wsLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  wsTitle: {
    fontSize: 14,
    fontFamily: fontSemiBold
  },
  onlinePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  onlinePillText: {
    fontSize: 10,
    fontFamily: fontBold,
    letterSpacing: 0.5
  },
  wsHost: {
    fontSize: 11,
    fontFamily: fontRegular,
    marginLeft: 16
  },
  switchSection: {
    width: '100%',
    marginBottom: 16
  },
  sectionEyebrow: {
    fontSize: 10,
    fontFamily: fontBold,
    letterSpacing: 0.8,
    marginBottom: 8
  },
  switchGrid: {
    gap: 8
  },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1
  },
  switchCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1
  },
  switchCardName: {
    fontSize: 13,
    fontFamily: fontMedium
  },
  startersSection: {
    width: '100%'
  },
  starterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  starterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1
  },
  starterText: {
    fontSize: 12,
    fontFamily: fontMedium
  },
  sessionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1
  },
  sessionSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 10
  },
  sessionDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  sessionTitleText: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1
  },
  newSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1
  },
  newSessionBtnText: {
    fontSize: 11,
    fontWeight: '600'
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8
  },
  sessionRowLeft: {
    flex: 1,
    marginRight: 10
  },
  sessionRowTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2
  },
  sessionRowMeta: {
    fontSize: 11
  },
  modalNewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    marginTop: 12
  },
  modalNewBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    borderRadius: 22,
    borderWidth: 1,
    padding: 20
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700'
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 6
  },
  modalInput: {
    height: 80,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 13,
    textAlignVertical: 'top'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10
  },
  modalCancelBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalCreateBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tableScroll: {
    marginVertical: 6
  },
  tableContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden'
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1
  },
  tableRow: {
    flexDirection: 'row'
  },
  tableCell: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center'
  },
  tableHeaderCell: {},
  tableHeaderText: {
    fontFamily: fontBold
  },
  tableCellText: {
    fontFamily: fontRegular
  },
  calloutCard: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 8,
    padding: 10,
    marginVertical: 6,
    gap: 4
  },
  calloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2
  },
  calloutLabel: {
    fontFamily: fontBold,
    fontSize: 11,
    letterSpacing: 0.5
  },
  calloutBody: {
    gap: 2
  },
  quoteCard: {
    borderLeftWidth: 3,
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginVertical: 4,
    gap: 2
  },
  mdHr: {
    height: 1,
    marginVertical: 10
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    marginBottom: 1
  },
  sessionRowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 2
  },
  sessionRowTime: {
    fontSize: 11
  }
});
