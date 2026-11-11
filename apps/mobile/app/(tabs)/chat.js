import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Easing
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { useTheme } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import { getActiveProfile, getProfiles, setActiveProfileId } from '../../src/storage.js';
import { fetchMessages, fetchState, sendPrompt, sendStop, uploadFile } from '../../src/api.js';
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

function parseInline(text, theme, lineKey) {
  if (!text) return [];
  const singleTick = String.fromCharCode(96);
  const parts = text.split(singleTick);
  const elements = [];

  for (let pIdx = 0; pIdx < parts.length; pIdx++) {
    const part = parts[pIdx];
    if (!part) continue;

    if (pIdx % 2 === 1) {
      elements.push(
        <Text
          key={`${lineKey}-ic-${pIdx}`}
          style={[styles.inlineCode, { color: theme.accent }]}
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
            key={`${lineKey}-bp-${pIdx}-${bIdx}`}
            style={bIdx % 2 === 1 ? styles.boldText : undefined}
          >
            {bp}
          </Text>
        );
      }
    }
  }

  return elements;
}

function MarkdownMessage({ text, theme }) {
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
        />
      );
    } else {
      const lines = block.split('\n');
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j];
        if (!line.trim()) {
          elements.push(<View key={`sp-${i}-${j}`} style={{ height: 6 }} />);
          continue;
        }

        if (line.startsWith('### ')) {
          elements.push(
            <Text key={`h3-${i}-${j}`} style={[styles.mdH3, { color: theme.text }]}>
              {line.slice(4)}
            </Text>
          );
          continue;
        }
        if (line.startsWith('## ')) {
          elements.push(
            <Text key={`h2-${i}-${j}`} style={[styles.mdH2, { color: theme.text }]}>
              {line.slice(3)}
            </Text>
          );
          continue;
        }
        if (line.startsWith('# ')) {
          elements.push(
            <Text key={`h1-${i}-${j}`} style={[styles.mdH1, { color: theme.text }]}>
              {line.slice(2)}
            </Text>
          );
          continue;
        }

        const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
        const lineContent = isBullet ? line.trim().slice(2) : line;

        elements.push(
          <View
            key={`ln-${i}-${j}`}
            style={isBullet ? styles.bulletRow : styles.textRow}
          >
            {isBullet && (
              <Text style={[styles.bulletDot, { color: theme.accent }]}>• </Text>
            )}
            <Text style={[styles.bubbleText, { color: theme.text }]}>
              {parseInline(lineContent, theme, `${i}-${j}`)}
            </Text>
          </View>
        );
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

const ChatMessageBubble = React.memo(function ChatMessageBubble({ item, theme }) {
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

    const bubbleBg = theme.userBubble || (theme.mode === 'dark' ? '#ffffff' : '#000000');
    const bubbleTextColor = theme.userText || (theme.mode === 'dark' ? '#000000' : '#ffffff');

    return (
      <View style={styles.userMessageRow}>
        <View style={[styles.userBubble, { backgroundColor: bubbleBg }]}>
          {badgeLabel && (
            <View style={[styles.userAttachmentBadge, { backgroundColor: theme.mode === 'dark' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.15)' }]}>
              <Icon name="attach" size={13} color={bubbleTextColor} />
              <Text style={[styles.userAttachmentText, { color: bubbleTextColor }]} numberOfLines={2}>
                {badgeLabel}
              </Text>
            </View>
          )}
          {Boolean(bodyText) && (
            <Text style={[styles.userBubbleText, { color: bubbleTextColor }]}>{bodyText}</Text>
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
        <MarkdownMessage text={item.text} theme={theme} />
      </View>
    </View>
  );
});

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const [profile, setProfile] = useState(null);
  const [allProfiles, setAllProfiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [agentStatus, setAgentStatus] = useState('idle');
  const [wsConnected, setWsConnected] = useState(false);
  const [blinker, setBlinker] = useState(true);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const flatListRef = useRef(null);
  const initialScrolledRef = useRef(false);
  const defaultBottomMargin = Math.max(insets.bottom, 16) + 78;
  const composerBottomAnim = useRef(new Animated.Value(defaultBottomMargin)).current;
  const isKeyboardOpenRef = useRef(false);

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
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, duration + 50);
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
  }, [insets.bottom]);

  const loadMessages = useCallback(async () => {
    try {
      const [active, profilesList] = await Promise.all([
        getActiveProfile(),
        getProfiles()
      ]);
      setProfile(active);
      setAllProfiles(profilesList || []);
      if (active) {
        const [list, st] = await Promise.all([
          fetchMessages(active, 50).catch(() => []),
          fetchState(active).catch(() => null)
        ]);
        if (list) {
          setMessages(list);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 30);
          setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: false });
          }, 120);
        }
        if (st?.status) setAgentStatus(st.status);
      }
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      initialScrolledRef.current = false;
      loadMessages().then(() => {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 30);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 150);
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false });
        }, 350);
      });
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

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
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
    const pendingAttachments = [...attachments];
    setInputText('');
    setAttachments([]);

    try {
      let messageText = trimmed;
      if (pendingAttachments.length > 0) {
        const uploadedList = [];
        for (const att of pendingAttachments) {
          const res = await uploadFile(profile, att);
          uploadedList.push(res);
        }

        const summaryList = uploadedList
          .map((u) => `[Attachment: ${u.originalName} | Saved to: ${u.path} (${u.mimeType}, ${Math.round(u.size / 1024)}KB)]\nAgent instruction: The user attached ${u.originalName}. It is stored at "${u.path}". Please inspect and view this file.`)
          .join('\n\n');

        messageText = trimmed ? `${summaryList}\n\n${trimmed}` : summaryList;
      }

      const optimisticId = `user-opt-${Date.now()}`;
      const optimisticMsg = {
        id: optimisticId,
        role: 'user',
        text: messageText,
        timestamp: Date.now()
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setTimeout(scrollToBottom, 60);

      await sendPrompt(profile, messageText);
      await loadMessages();
      setTimeout(scrollToBottom, 150);
    } catch (err) {
      alert(err.message || 'Failed to send message');
      setAttachments(pendingAttachments);
      setInputText(trimmed);
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

  const renderItem = useCallback(
    ({ item }) => <ChatMessageBubble item={item} theme={theme} />,
    [theme]
  );

  const statusLabel = wsConnected
    ? `LIVE · ${(profile?.name || 'LAPTOP').toUpperCase()}`
    : `${(profile?.name || 'LAPTOP').toUpperCase()}`;

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar title={profile?.name || 'acme / dashboard'} status={statusLabel} />

      <View style={[styles.chatBody, { backgroundColor: theme.bg }]}>
        <FlatList
          ref={flatListRef}
          data={messages || []}
          keyExtractor={(item, index) => `${item?.id || 'msg'}-${index}`}
          renderItem={renderItem}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          onContentSizeChange={() => {
            if (!initialScrolledRef.current && messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
              initialScrolledRef.current = true;
            }
          }}
          onLayout={() => {
            if (messages.length > 0) {
              flatListRef.current?.scrollToEnd({ animated: false });
            }
          }}
          contentContainerStyle={[
            styles.listContent,
            messages.length === 0 && styles.listContentEmpty
          ]}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
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
                    <Text
                      style={[
                        styles.blinker,
                        { color: theme.accent, opacity: blinker ? 1 : 0 }
                      ]}
                    >
                      {' |'}
                    </Text>
                  </Text>
                </View>
              </View>
            ) : null
          }
        />

        {messages.length > 2 && (
          <TouchableOpacity
            style={[
              styles.scrollBottomButton,
              {
                backgroundColor: theme.raised,
                borderColor: theme.border,
                bottom: 14
              }
            ]}
            onPress={scrollToBottom}
            activeOpacity={0.8}
          >
            <Icon name="arrow-down" size={17} color={theme.accent} />
          </TouchableOpacity>
        )}
      </View>

      <Animated.View
        style={[
          styles.composerContainer,
          {
            backgroundColor: theme.bg,
            marginBottom: composerBottomAnim
          }
        ]}
      >
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
                      backgroundColor: theme.raised,
                      borderColor: theme.border
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
              backgroundColor: theme.raised,
              borderColor: theme.border
            }
          ]}
        >
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handlePickDocument}
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
            placeholder="Message your agent"
            placeholderTextColor={theme.subtle}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={2000}
            onFocus={() => {
              setTimeout(scrollToBottom, 150);
            }}
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
              style={[
                styles.sendButton,
                {
                  backgroundColor: (inputText.trim() || attachments.length > 0) ? theme.accent : `${theme.accent}90`,
                  opacity: (inputText.trim() || attachments.length > 0) ? 1 : 0.65
                }
              ]}
              onPress={handleSend}
              disabled={!inputText.trim() && attachments.length === 0}
              activeOpacity={0.8}
            >
              <Icon name="send" size={19} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
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
    lineHeight: 18,
    fontFamily: fontRegular
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
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5
  },
  composerContainer: {
    paddingHorizontal: 20,
    alignItems: 'center'
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
    gap: 6
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
  stopSquare: {
    width: 12,
    height: 12,
    backgroundColor: '#ffffff',
    borderRadius: 3
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
  }
});
