import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import { getActiveProfile, getTerminalHistory, saveTerminalHistory } from '../../src/storage.js';
import { fetchTerminalAllowlist, execTerminal, killTerminal } from '../../src/api.js';

function stripAnsi(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

const QUICK_COMMANDS = [
  'git status',
  'git diff',
  'git log -n 5',
  'npm test',
  'pnpm typecheck',
  'ls -la',
  'pwd'
];

export default function TerminalScreen() {
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const router = useRouter();

  const [profile, setProfile] = useState(null);
  const [outputLines, setOutputLines] = useState([
    { id: '1', text: '— Antigravity Sandboxed Terminal Engine —', type: 'system' },
    { id: '2', text: 'Type a command or tap a quick action below.\n', type: 'system' }
  ]);
  const [cwd, setCwd] = useState('~');
  const [inputCmd, setInputCmd] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [allowlist, setAllowlist] = useState([]);

  const scrollRef = useRef(null);

  const appendOutput = useCallback((text, type = 'stdout') => {
    const clean = stripAnsi(text);
    if (!clean) return;
    setOutputLines((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text: clean, type }
    ]);
  }, []);

  const loadProfileAndConfig = useCallback(async () => {
    try {
      const active = await getActiveProfile();
      setProfile(active);
      const hist = await getTerminalHistory();
      setHistory(hist || []);

      if (active) {
        try {
          const info = await fetchTerminalAllowlist(active);
          if (info?.cwd) setCwd(info.cwd);
          if (Array.isArray(info?.allowlist)) setAllowlist(info.allowlist);
        } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadProfileAndConfig();
  }, [loadProfileAndConfig]);

  useEffect(() => {
    if (scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [outputLines]);

  const handleRunCommand = async (cmdToRun) => {
    const cmd = (cmdToRun || inputCmd).trim();
    if (!cmd || isRunning) return;

    if (!profile) {
      appendOutput('Error: No active Antigravity profile connected.\n', 'stderr');
      return;
    }

    appendOutput(`$ ${cmd}\n`, 'cmd');
    setInputCmd('');
    setIsRunning(true);

    const updatedHist = [cmd, ...history.filter((c) => c !== cmd)].slice(0, 25);
    setHistory(updatedHist);
    setHistoryIdx(-1);
    void saveTerminalHistory(updatedHist);

    try {
      const res = await execTerminal(profile, {
        command: cmd,
        sessionId: 'mobile-terminal',
        cwd
      });

      if (res?.output) {
        appendOutput(res.output, 'stdout');
      }
      if (res?.cwd) {
        setCwd(res.cwd);
      }
      if (typeof res?.exitCode === 'number') {
        appendOutput(`[Exited with code ${res.exitCode}]\n`, res.exitCode === 0 ? 'system' : 'stderr');
      }
    } catch (err) {
      appendOutput(`\n${err.message || 'Command failed'}\n`, 'stderr');
    } finally {
      setIsRunning(false);
    }
  };

  const handleKill = async () => {
    if (!profile || !isRunning) return;
    try {
      await killTerminal(profile, { sessionId: 'mobile-terminal' });
      appendOutput('\n[Process terminated by user]\n', 'system');
    } catch (err) {
      appendOutput(`\nFailed to kill process: ${err.message}\n`, 'stderr');
    } finally {
      setIsRunning(false);
    }
  };

  const handleHistoryNav = (direction) => {
    if (history.length === 0) return;
    let nextIdx = historyIdx + direction;
    if (nextIdx < -1) nextIdx = -1;
    if (nextIdx >= history.length) nextIdx = history.length - 1;

    setHistoryIdx(nextIdx);
    if (nextIdx === -1) {
      setInputCmd('');
    } else {
      setInputCmd(history[nextIdx] || '');
    }
  };

  const handleClear = () => {
    setOutputLines([
      { id: `${Date.now()}`, text: `Terminal cleared. CWD: ${cwd}\n`, type: 'system' }
    ]);
  };

  const handleInjectIntoChat = () => {
    const recentLines = outputLines
      .slice(-20)
      .map((l) => l.text)
      .join('');
    const promptText = `Here is the terminal output from \`${cwd}\`:\n\`\`\`\n${recentLines.trim()}\n\`\`\`\nCan you inspect this and help me?`;
    router.push({
      pathname: '/(tabs)/chat',
      params: { injectedPrompt: promptText }
    });
  };

  const terminalBg = isDark ? '#0a0a0c' : '#141416';
  const terminalText = isDark ? '#ececef' : '#f4f4f6';
  const monoFont = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar title="Terminal" subtitle={isRunning ? 'Executing...' : 'Sandboxed Shell'} />

      {/* Path & Controls Bar */}
      <View style={[styles.pathBar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.pathLeft}>
          <Icon name="terminal" size={15} color={theme.accent} />
          <Text style={[styles.pathText, { color: theme.textMuted }]} numberOfLines={1}>
            {cwd}
          </Text>
        </View>
        <View style={styles.pathActions}>
          {isRunning ? (
            <TouchableOpacity style={styles.killBtn} onPress={handleKill}>
              <Text style={styles.killBtnText}>Kill</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
              <Text style={[styles.clearBtnText, { color: theme.textMuted }]}>Clear</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.injectBtn} onPress={handleInjectIntoChat}>
            <Icon name="chat" size={13} color={theme.accent} />
            <Text style={[styles.injectBtnText, { color: theme.accent }]}>To Chat</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick Action Chips */}
      <View style={styles.chipScrollWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipContainer}>
          {QUICK_COMMANDS.map((cmd) => (
            <TouchableOpacity
              key={cmd}
              style={[styles.chip, { backgroundColor: theme.surface, borderColor: theme.border }]}
              onPress={() => handleRunCommand(cmd)}
              disabled={isRunning}
            >
              <Text style={[styles.chipText, { color: theme.text }]}>{cmd}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Monospace Output Viewport */}
      <View style={[styles.viewport, { backgroundColor: terminalBg, borderColor: theme.border }]}>
        <ScrollView
          ref={scrollRef}
          style={styles.viewportScroll}
          contentContainerStyle={styles.viewportContent}
          keyboardDismissMode="on-drag"
        >
          {outputLines.map((line) => {
            let color = terminalText;
            if (line.type === 'cmd') color = theme.accent;
            else if (line.type === 'system') color = '#a1a1aa';
            else if (line.type === 'stderr') color = '#f87171';

            return (
              <Text key={line.id} style={[styles.terminalLine, { color, fontFamily: monoFont }]}>
                {line.text}
              </Text>
            );
          })}
          {isRunning && (
            <View style={styles.runningIndicator}>
              <ActivityIndicator size="small" color={theme.accent} />
              <Text style={[styles.runningText, { color: theme.accent, fontFamily: monoFont }]}>
                Running command...
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Command Input Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 84 : 0}
      >
        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              marginBottom: Math.max(insets.bottom, 12) + 76
            }
          ]}
        >
          {/* History Navigation Buttons */}
          <View style={styles.historyControls}>
            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() => handleHistoryNav(1)}
              disabled={history.length === 0}
            >
              <Icon name="chevron-up" size={16} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.historyBtn}
              onPress={() => handleHistoryNav(-1)}
              disabled={historyIdx === -1}
            >
              <Icon name="arrow-down" size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.promptPrefix, { color: theme.accent, fontFamily: monoFont }]}>$</Text>

          <TextInput
            style={[styles.input, { color: theme.text, fontFamily: monoFont }]}
            value={inputCmd}
            onChangeText={setInputCmd}
            placeholder={isRunning ? 'Command in progress...' : 'Enter command (e.g. git status)...'}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!isRunning}
            onSubmitEditing={() => handleRunCommand()}
            returnKeyType="go"
          />

          <TouchableOpacity
            style={[
              styles.runBtn,
              {
                backgroundColor: inputCmd.trim() && !isRunning ? theme.accent : theme.border
              }
            ]}
            onPress={() => handleRunCommand()}
            disabled={!inputCmd.trim() || isRunning}
          >
            <Icon name="send" size={15} color={inputCmd.trim() && !isRunning ? '#ffffff' : theme.textMuted} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  pathLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8
  },
  pathText: {
    fontSize: 11,
    marginLeft: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  pathActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  killBtn: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  killBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700'
  },
  clearBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  clearBtnText: {
    fontSize: 11
  },
  injectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124, 92, 255, 0.35)',
    gap: 4
  },
  injectBtnText: {
    fontSize: 11,
    fontWeight: '600'
  },
  chipScrollWrapper: {
    height: 38
  },
  chipContainer: {
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  chipText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  viewport: {
    flex: 1,
    marginHorizontal: 10,
    marginTop: 4,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden'
  },
  viewportScroll: {
    flex: 1
  },
  viewportContent: {
    padding: 10
  },
  terminalLine: {
    fontSize: 11.5,
    lineHeight: 17
  },
  runningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8
  },
  runningText: {
    fontSize: 11.5
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6
  },
  historyControls: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },
  historyBtn: {
    padding: 2
  },
  promptPrefix: {
    fontSize: 14,
    fontWeight: '700'
  },
  input: {
    flex: 1,
    fontSize: 12,
    paddingVertical: 4,
    paddingHorizontal: 4
  },
  runBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  }
});

