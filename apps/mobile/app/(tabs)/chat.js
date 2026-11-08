import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  BubbleChatIcon,
  ArrowUp01Icon,
  StopIcon
} from '@hugeicons/core-free-icons';
import { useTheme } from '../../src/theme.js';
import { getActiveProfile } from '../../src/storage.js';
import { fetchMessages, fetchState, sendPrompt, sendStop } from '../../src/api.js';
import { BridgeWebSocketClient } from '../../src/websocket.js';

function MarkdownMessage({ text, theme }) {
  if (!text) return null;

  const tripleTick = String.fromCharCode(96, 96, 96);
  const singleTick = String.fromCharCode(96);
  const blocks = text.split(tripleTick);

  return (
    <View style={styles.mdContainer}>
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          let code = block;
          const firstNl = block.indexOf('\n');
          if (firstNl !== -1) {
            code = block.slice(firstNl + 1);
          }
          return (
            <View key={`cb-${i}`} style={styles.codeBlock}>
              <Text style={styles.codeText}>{code.trimEnd()}</Text>
            </View>
          );
        }

        const lines = block.split('\n');
        return lines.map((line, lineIdx) => {
          if (!line.trim()) {
            return <View key={`sp-${i}-${lineIdx}`} style={{ height: 6 }} />;
          }

          if (line.startsWith('### ')) {
            return (
              <Text key={`h3-${i}-${lineIdx}`} style={[styles.mdH3, { color: theme.text }]}>
                {line.slice(4)}
              </Text>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <Text key={`h2-${i}-${lineIdx}`} style={[styles.mdH2, { color: theme.text }]}>
                {line.slice(3)}
              </Text>
            );
          }
          if (line.startsWith('# ')) {
            return (
              <Text key={`h1-${i}-${lineIdx}`} style={[styles.mdH1, { color: theme.text }]}>
                {line.slice(2)}
              </Text>
            );
          }

          const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
          const lineContent = isBullet ? line.trim().slice(2) : line;

          const inlineParts = lineContent.split(singleTick);

          return (
            <View
              key={`ln-${i}-${lineIdx}`}
              style={isBullet ? styles.bulletRow : styles.textRow}
            >
              {isBullet && (
                <Text style={[styles.bulletDot, { color: theme.textSecondary }]}>• </Text>
              )}
              <Text style={[styles.regularText, { color: theme.agentText }]}>
                {inlineParts.map((part, partIdx) => {
                  if (partIdx % 2 === 1) {
                    return (
                      <Text
                        key={`ic-${partIdx}`}
                        style={[styles.inlineCode, { color: theme.text }]}
                      >
                        {part}
                      </Text>
                    );
                  }

                  const boldParts = part.split('**');
                  return boldParts.map((bp, bpIdx) => (
                    <Text
                      key={`bp-${bpIdx}`}
                      style={bpIdx % 2 === 1 ? styles.boldText : undefined}
                    >
                      {bp}
                    </Text>
                  ));
                })}
              </Text>
            </View>
          );
        });
      })}
    </View>
  );
}

export default function ChatScreen() {
  const { theme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState('idle');
  const flatListRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const active = await getActiveProfile();
      setProfile(active);
      if (active) {
        const [list, st] = await Promise.all([
          fetchMessages(active, 50),
          fetchState(active).catch(() => null)
        ]);
        setMessages(list);
        if (st && st.status) {
          setAgentStatus(st.status);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

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
        if (event.type === 'state_changed') {
          if (event.state && event.state.status) {
            setAgentStatus(event.state.status);
          }
        }
        if (event.type === 'message_appended' || event.type === 'run_finished') {
          loadMessages();
        }
      }
    );
    return () => ws.close();
  }, [profile, loadMessages]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !profile || sending) return;

    setInputText('');
    setSending(true);
    setAgentStatus('generating');

    const optimisticMsg = {
      id: `temp-${Date.now()}`,
      role: 'user',
      text,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      await sendPrompt(profile, text);
      await loadMessages();
    } catch (err) {
      alert(err.message || 'Failed to send prompt');
    } finally {
      setSending(false);
    }
  };

  const handleStop = async () => {
    if (!profile) return;
    try {
      await sendStop(profile);
      await loadMessages();
    } catch (err) {
      alert(err.message || 'Failed to stop agent');
    }
  };

  const isGenerating = agentStatus === 'generating' || sending;

  const renderItem = ({ item }) => {
    const isUser = item.role === 'user';
    const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <View style={[styles.bubbleWrapper, isUser ? styles.userWrapper : styles.agentWrapper]}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.userBubble, { backgroundColor: theme.userBubble }]
              : [styles.agentBubble, { backgroundColor: theme.agentBubble, borderColor: theme.borderSubtle }]
          ]}
        >
          {isUser ? (
            <Text style={[styles.userMessageText, { color: theme.userText }]}>
              {item.text}
            </Text>
          ) : (
            <MarkdownMessage text={item.text} theme={theme} />
          )}
          <Text
            style={[
              styles.timestamp,
              { color: isUser ? 'rgba(0,0,0,0.45)' : theme.textMuted }
            ]}
          >
            {isUser ? 'You · ' : 'Antigravity · '}{time}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.text} size="large" />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyContainer}>
          <HugeiconsIcon icon={BubbleChatIcon} size={48} color={theme.textMuted} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No messages yet. Send a prompt to begin pair programming.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListFooterComponent={
            isGenerating ? (
              <View style={[styles.bubbleWrapper, styles.agentWrapper]}>
                <View
                  style={[
                    styles.bubble,
                    styles.agentBubble,
                    {
                      backgroundColor: theme.agentBubble,
                      borderColor: theme.borderSubtle,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8
                    }
                  ]}
                >
                  <ActivityIndicator size="small" color={theme.text} />
                  <Text style={[styles.regularText, { color: theme.textSecondary }]}>
                    Antigravity is working...
                  </Text>
                </View>
              </View>
            ) : null
          }
        />
      )}

      <View style={styles.floatingContainer}>
        <View style={[styles.floatingBar, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <TextInput
            style={[styles.floatingInput, { color: theme.text }]}
            placeholder="Message Antigravity..."
            placeholderTextColor={theme.textMuted}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: inputText.trim().length > 0 ? theme.accent : theme.borderSubtle }
            ]}
            onPress={handleSend}
            disabled={inputText.trim().length === 0 || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.bg} />
            ) : (
              <HugeiconsIcon icon={ArrowUp01Icon} size={18} color={theme.bg} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.whiteCircleStopBtn}
            onPress={handleStop}
            title="Stop generation"
          >
            <HugeiconsIcon icon={StopIcon} size={14} color="#000000" />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20
  },
  listContent: {
    padding: 16,
    paddingBottom: 96
  },
  bubbleWrapper: {
    marginVertical: 6,
    maxWidth: '86%'
  },
  userWrapper: {
    alignSelf: 'flex-end'
  },
  agentWrapper: {
    alignSelf: 'flex-start'
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20
  },
  userBubble: {
    borderBottomRightRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 2
  },
  agentBubble: {
    borderBottomLeftRadius: 4,
    borderWidth: 1
  },
  userMessageText: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '500'
  },
  timestamp: {
    fontSize: 10,
    marginTop: 6,
    alignSelf: 'flex-end'
  },
  mdContainer: {
    width: '100%'
  },
  textRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginVertical: 1
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
    paddingLeft: 4
  },
  bulletDot: {
    fontSize: 14,
    fontWeight: '700'
  },
  regularText: {
    fontSize: 14,
    lineHeight: 21,
    flexShrink: 1
  },
  boldText: {
    fontWeight: '700'
  },
  inlineCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    backgroundColor: 'rgba(128,128,128,0.2)',
    paddingHorizontal: 4,
    borderRadius: 4
  },
  codeBlock: {
    backgroundColor: '#09090b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#27272a',
    padding: 10,
    marginVertical: 6
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    color: '#fafafa'
  },
  mdH1: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 10,
    marginBottom: 4
  },
  mdH2: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4
  },
  mdH3: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 6,
    marginBottom: 2
  },
  floatingContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 16,
    right: 16
  },
  floatingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 9999,
    borderWidth: 1,
    paddingVertical: 6,
    paddingLeft: 18,
    paddingRight: 8,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
    gap: 8
  },
  floatingInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
    maxHeight: 100
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center'
  },
  whiteCircleStopBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3
  }
});
