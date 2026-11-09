import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import { getActiveProfile } from '../../src/storage.js';
import { fetchMessages, fetchState, sendPrompt, sendStop } from '../../src/api.js';
import { BridgeWebSocketClient } from '../../src/websocket.js';

function CodeSnippet({ code, lang = 'code', theme }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.codeBubble, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.codeHeader, { backgroundColor: theme.raised }]}>
        <Text style={[styles.codeLang, { color: theme.accent }]}>{lang}</Text>
        <TouchableOpacity style={styles.copyButton} onPress={handleCopy} activeOpacity={0.7}>
          <Icon name={copied ? 'check' : 'copy'} size={15} color={theme.muted} />
          <Text style={[styles.copyText, { color: theme.muted }]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.codePre, { color: theme.text }]}>{code.trimEnd()}</Text>
    </View>
  );
}

function RenderBubbleContent({ text, theme }) {
  if (!text) return null;

  const tripleTick = String.fromCharCode(96, 96, 96);
  if (text.includes(tripleTick)) {
    const parts = text.split(tripleTick);
    return (
      <View style={styles.bubbleCol}>
        {parts.map((part, index) => {
          if (index % 2 === 1) {
            let lang = 'code';
            let codeContent = part;
            const nlIndex = part.indexOf('\n');
            if (nlIndex !== -1) {
              const possibleLang = part.slice(0, nlIndex).trim();
              if (possibleLang) lang = possibleLang;
              codeContent = part.slice(nlIndex + 1);
            }
            return (
              <CodeSnippet
                key={`cs-${index}`}
                code={codeContent}
                lang={lang}
                theme={theme}
              />
            );
          }
          if (!part.trim()) return null;
          return (
            <Text key={`txt-${index}`} style={[styles.bubbleText, { color: theme.text }]}>
              {part.trim()}
            </Text>
          );
        })}
      </View>
    );
  }

  return <Text style={[styles.bubbleText, { color: theme.text }]}>{text}</Text>;
}

export default function ChatScreen() {
  const { theme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [wsConnected, setWsConnected] = useState(false);
  const [blinker, setBlinker] = useState(true);

  const flatListRef = useRef(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setBlinker((b) => !b);
    }, 550);
    return () => clearInterval(interval);
  }, []);

  const loadMessages = useCallback(async () => {
    try {
      const active = await getActiveProfile();
      setProfile(active);
      if (active) {
        const [list, st] = await Promise.all([
          fetchMessages(active, 50).catch(() => []),
          fetchState(active).catch(() => null)
        ]);
        if (list) setMessages(list);
        if (st?.status) setAgentStatus(st.status);
      }
    } catch {
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
      () => {
        loadMessages();
      },
      (connected) => {
        setWsConnected(connected);
      }
    );
    return () => ws.close();
  }, [profile, loadMessages]);

  const handleSend = async () => {
    const trimmed = inputText.trim();
    if (!trimmed || !profile || sending) return;

    setSending(true);
    setInputText('');
    try {
      await sendPrompt(profile, trimmed);
      await loadMessages();
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      alert(err.message || 'Failed to send message');
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

  const isWorking = agentStatus === 'generating';

  const renderItem = ({ item }) => {
    const isUser = item.sender === 'user';
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
      return (
        <View style={styles.userMessageRow}>
          <View style={[styles.userBubble, { backgroundColor: theme.accent }]}>
            <Text style={styles.userBubbleText}>{item.text}</Text>
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
          <RenderBubbleContent text={item.text} theme={theme} />
        </View>
      </View>
    );
  };

  const statusLabel = wsConnected
    ? `LIVE · ${(profile?.name || 'LAPTOP').toUpperCase()}`
    : `${(profile?.name || 'LAPTOP').toUpperCase()}`;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TopBar title={profile?.name || 'acme / dashboard'} status={statusLabel} />

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => String(item.id || item.timestamp || Math.random())}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={<Text style={[styles.dateLabel, { color: theme.subtle }]}>TODAY, 10:42</Text>}
        ListFooterComponent={
          isWorking ? (
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
                <Text style={[styles.bubbleText, { color: theme.text }]}>
                  Agent is generating
                  <Text style={[styles.blinker, { color: theme.accent, opacity: blinker ? 1 : 0 }]}>
                    {' |'}
                  </Text>
                </Text>
              </View>
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        style={[
          styles.scrollBottomButton,
          {
            backgroundColor: theme.raised,
            borderColor: theme.border
          }
        ]}
        onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
        activeOpacity={0.8}
      >
        <Icon name="arrow" size={17} color={theme.accent} />
      </TouchableOpacity>

      <View
        style={[
          styles.composer,
          {
            backgroundColor: theme.raised,
            borderColor: theme.border
          }
        ]}
      >
        <TouchableOpacity style={styles.attachButton} activeOpacity={0.7}>
          <Icon name="attach" size={20} color={theme.muted} />
        </TouchableOpacity>
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder="Message your agent"
          placeholderTextColor={theme.subtle}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={2000}
        />
        {isWorking ? (
          <TouchableOpacity
            style={[styles.sendButton, styles.stopButton, { backgroundColor: theme.danger }]}
            onPress={handleStop}
            activeOpacity={0.8}
          >
            <View style={styles.stopSquare} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: theme.accent }]}
            onPress={handleSend}
            activeOpacity={0.8}
          >
            <Icon name="send" size={18} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 175
  },
  dateLabel: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 0.8,
    marginVertical: 14,
    fontWeight: '600'
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
    fontWeight: '700'
  },
  agentBubble: {
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderWidth: 1
  },
  userMessageRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 14,
    marginLeft: 'auto',
    maxWidth: '90%'
  },
  userBubble: {
    paddingVertical: 11,
    paddingHorizontal: 13,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 5,
    borderBottomRightRadius: 16,
    borderBottomLeftRadius: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 18
      },
      android: {
        elevation: 4
      }
    })
  },
  userBubbleText: {
    color: '#ffffff',
    fontSize: 12,
    lineHeight: 18
  },
  bubbleCol: {
    gap: 8
  },
  bubbleText: {
    fontSize: 12,
    lineHeight: 18
  },
  blinker: {
    fontSize: 13,
    fontWeight: '700'
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
    fontWeight: '600'
  },
  toolStepDesc: {
    fontSize: 11,
    marginTop: 1
  },
  codeBubble: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 245
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
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontWeight: '600'
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  copyText: {
    fontSize: 10
  },
  codePre: {
    padding: 12,
    fontSize: 10,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' })
  },
  scrollBottomButton: {
    position: 'absolute',
    right: 20,
    bottom: 146,
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '90deg' }],
    zIndex: 5
  },
  composer: {
    position: 'absolute',
    bottom: 86,
    left: 20,
    right: 20,
    maxWidth: 440,
    alignSelf: 'center',
    minHeight: 56,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 7,
    gap: 6,
    zIndex: 6,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 9 },
        shadowOpacity: 0.25,
        shadowRadius: 25
      },
      android: {
        elevation: 8
      }
    })
  },
  attachButton: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center'
  },
  input: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 8,
    maxHeight: 76
  },
  sendButton: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  stopButton: {},
  stopSquare: {
    width: 12,
    height: 12,
    backgroundColor: '#ffffff',
    borderRadius: 3
  }
});
