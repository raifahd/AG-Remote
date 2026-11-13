import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Animated,
  Platform
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useTheme } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import StatusBadge from '../../src/components/StatusBadge.js';
import { getActiveProfile } from '../../src/storage.js';
import { fetchState, checkHealth, sendApprove, sendReject, fetchMessages } from '../../src/api.js';
import { BridgeWebSocketClient } from '../../src/websocket.js';

export default function HomeScreen() {
  const { theme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [degradedInfo, setDegradedInfo] = useState(null);
  const [holding, setHolding] = useState(false);
  const [blinker, setBlinker] = useState(true);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1100,
          useNativeDriver: true
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: true
        })
      ])
    );
    pulseLoop.start();

    const blinkerInterval = setInterval(() => {
      setBlinker((b) => !b);
    }, 550);

    return () => {
      pulseLoop.stop();
      clearInterval(blinkerInterval);
    };
  }, [pulseAnim]);

  const loadData = useCallback(async () => {
    try {
      const active = await getActiveProfile();
      setProfile(active);
      if (active) {
        const [s, h, msgList] = await Promise.all([
          fetchState(active).catch(() => null),
          checkHealth(active.baseUrl).catch(() => null),
          fetchMessages(active, 5).catch(() => [])
        ]);
        if (s) setState(s);
        if (msgList) setMessages(msgList);
        if (h?.health?.status === 'degraded') {
          setDegradedInfo(h.health.degradedReason || 'Bridge running in degraded mode');
        } else {
          setDegradedInfo(null);
        }
      }
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    if (!profile) return;
    const ws = new BridgeWebSocketClient(
      profile,
      () => {
        loadData();
      },
      (connected) => {
        setWsConnected(connected);
      }
    );
    return () => ws.close();
  }, [profile, loadData]);

  const handleApprove = async () => {
    if (!profile || !state?.pendingApproval) return;
    try {
      await sendApprove(profile, state.pendingApproval.requestId);
      await loadData();
    } catch (err) {
      alert(err.message || 'Approval failed');
    }
  };

  const handleReject = async () => {
    if (!profile || !state?.pendingApproval) return;
    try {
      await sendReject(profile, state.pendingApproval.requestId);
      await loadData();
    } catch (err) {
      alert(err.message || 'Rejection failed');
    }
  };

  const status = state?.status ?? (profile ? 'idle' : 'offline');
  const isWorking = status === 'generating';
  const approval = state?.pendingApproval;

  const getStatusText = () => {
    if (!profile) return 'Disconnected';
    if (status === 'generating') return 'Working';
    if (status === 'awaiting_approval') return 'Approval Needed';
    if (status === 'error') return 'Error';
    return 'Ready';
  };

  const getStatusDesc = () => {
    if (!profile) return 'Add a bridge in Workspaces tab';
    if (status === 'generating') return 'Executing instructions';
    if (status === 'awaiting_approval') return 'Action required by agent';
    if (status === 'error') return 'Encountered an error';
    return 'Standing by for prompts';
  };

  const timelineItems = messages.slice(0, 3).map((m, idx) => {
    const isTool = m.kind === 'tool';
    const isAgent = m.sender === 'agent';
    return {
      icon: isTool ? 'terminal' : isAgent ? 'file' : 'shield',
      title: isTool ? 'Executed tool' : isAgent ? 'Agent response' : 'User message',
      desc: (m.text || m.summary || 'Activity').slice(0, 36)
    };
  });

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            tintColor={theme.accent}
          />
        }
      >
        <TouchableOpacity
          style={[styles.connectionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.navigate('/(tabs)/workspaces')}
          activeOpacity={0.8}
        >
          <View style={styles.machine}>
            <View style={[styles.machineIcon, { backgroundColor: theme.raised }]}>
              <Icon name="monitor" size={20} color={theme.text} />
            </View>
            <View style={styles.machineDetails}>
              <Text style={[styles.connectedEyebrow, { color: theme.muted }]}>CONNECTED TO</Text>
              <Text style={[styles.machineName, { color: theme.text }]} numberOfLines={1}>
                {profile?.name || 'No bridge paired'}
              </Text>
              <Text style={[styles.machineOs, { color: theme.muted }]} numberOfLines={1}>
                {profile ? `${profile.baseUrl.replace(/^https?:\/\//, '')} · Antigravity` : 'Tap to connect'}
              </Text>
            </View>
          </View>
          <StatusBadge
            text={wsConnected ? 'ONLINE' : degradedInfo ? 'DEGRADED' : profile ? 'POLLING' : 'OFFLINE'}
            tone={wsConnected ? 'success' : degradedInfo ? 'warning' : 'muted'}
          />
        </TouchableOpacity>

        {!profile && (
          <View style={[styles.onboardCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.onboardHeader}>
              <View style={[styles.onboardIconCircle, { backgroundColor: `${theme.accent}20` }]}>
                <Icon name="wifi" size={22} color={theme.accent} />
              </View>
              <View style={styles.onboardHeaderText}>
                <Text style={[styles.onboardTitle, { color: theme.text }]}>Pair with Antigravity</Text>
                <Text style={[styles.onboardSub, { color: theme.muted }]}>
                  Connect your phone to your computer over Tailscale.
                </Text>
              </View>
            </View>
            <View style={styles.onboardSteps}>
              <Text style={[styles.onboardStepText, { color: theme.subtle }]}>
                1. Open Antigravity on your computer
              </Text>
              <Text style={[styles.onboardStepText, { color: theme.subtle }]}>
                2. Click "AG Remote" in the bottom status bar
              </Text>
              <Text style={[styles.onboardStepText, { color: theme.subtle }]}>
                3. Scan the QR code displayed on screen
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.onboardButton, { backgroundColor: theme.accent }]}
              onPress={() => router.push('/scanner')}
              activeOpacity={0.85}
            >
              <Icon name="wifi" size={17} color="#ffffff" />
              <Text style={styles.onboardButtonText}>Scan Bridge QR Code</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.agentState}>
          <View style={styles.orbWrap}>
            <Animated.View
              style={[
                styles.orbRing,
                {
                  borderColor: `${theme.accent}B0`,
                  transform: [{ scale: pulseAnim }]
                }
              ]}
            />
            <View
              style={[
                styles.orb,
                {
                  backgroundColor: theme.raised,
                  borderColor: theme.accent
                }
              ]}
            >
              <View
                style={[
                  styles.pulseDot,
                  {
                    borderColor: theme.bg,
                    backgroundColor: isWorking ? theme.success : theme.muted
                  }
                ]}
              />
              <Icon name="terminal" size={30} color={theme.accent} />
            </View>
          </View>
          <Text style={[styles.agentEyebrow, { color: theme.muted }]}>AGENT STATUS</Text>
          <View style={styles.agentHeadingRow}>
            <Text style={[styles.agentHeading, { color: theme.text }]}>
              {getStatusText()}
            </Text>
            {isWorking && (
              <Text
                style={[
                  styles.blinker,
                  { color: theme.accent, opacity: blinker ? 1 : 0 }
                ]}
              >
                {' |'}
              </Text>
            )}
          </View>
          <Text style={[styles.agentDesc, { color: theme.muted }]}>{getStatusDesc()}</Text>
        </View>

        {approval && (
          <View style={[styles.approvalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.approvalTop}>
              <View style={[styles.cardIconWarn, { backgroundColor: `${theme.warning}24` }]}>
                <Icon name="terminal" size={18} color={theme.warning} />
              </View>
              <StatusBadge text="ACTION REQUIRED" tone="warning" />
              <TouchableOpacity style={styles.moreButton}>
                <Icon name="more" size={16} color={theme.muted} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.approvalTitle, { color: theme.text }]}>
              {approval.kind === 'command'
                ? 'Run terminal command'
                : approval.kind === 'file_write'
                ? 'File edit required'
                : 'Tool approval required'}
            </Text>
            <Text style={[styles.approvalDesc, { color: theme.muted }]}>
              {approval.summary || 'Confirm whether to proceed with this operation.'}
            </Text>
            {approval.command && (
              <View style={[styles.codeWrap, { backgroundColor: theme.bg }]}>
                <Text style={[styles.codeText, { color: theme.text }]}>{approval.command}</Text>
              </View>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.accent },
                  holding && styles.holdingButton
                ]}
                onPressIn={() => setHolding(true)}
                onPressOut={() => {
                  setHolding(false);
                  handleApprove();
                }}
                activeOpacity={0.9}
              >
                <Icon name="check" size={18} color="#ffffff" />
                <Text style={styles.primaryButtonText}>
                  {holding ? 'Release to approve' : 'Hold to approve'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: theme.raised, borderColor: theme.border }]}
                onPress={handleReject}
              >
                <Icon name="x" size={18} color={theme.text} />
                <Text style={[styles.secondaryButtonText, { color: theme.text }]}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.quickPromptCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
          onPress={() => router.navigate('/(tabs)/chat')}
          activeOpacity={0.8}
        >
          <View style={[styles.plusIconWrap, { backgroundColor: theme.raised }]}>
            <Icon name="plus" size={19} color={theme.accent} />
          </View>
          <Text style={[styles.quickPromptPlaceholder, { color: theme.muted }]}>
            Send a quick prompt
          </Text>
          <Text style={[styles.shortcutText, { color: theme.subtle }]}>⌘ ↵</Text>
        </TouchableOpacity>

        <View style={styles.activitySection}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Recent activity</Text>
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => router.navigate('/(tabs)/chat')}
            >
              <Text style={[styles.viewAllText, { color: theme.accent }]}>View all</Text>
              <Icon name="arrow" size={16} color={theme.accent} />
            </TouchableOpacity>
          </View>

          <View style={[styles.timeline, { borderTopColor: theme.border }]}>
            {timelineItems.length > 0 ? (
              timelineItems.map((item, idx) => (
                <TouchableOpacity
                  key={`act-${idx}`}
                  style={[styles.timelineItem, { borderBottomColor: theme.border }]}
                  onPress={() => router.navigate('/(tabs)/chat')}
                  activeOpacity={0.7}
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
                    <Icon name={item.icon} size={17} color={theme.accent} />
                  </View>
                  <View style={styles.timelineDetails}>
                    <Text style={[styles.timelineTitle, { color: theme.text }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={[styles.timelineDesc, { color: theme.muted }]} numberOfLines={1}>
                      {item.desc}
                    </Text>
                  </View>
                  <Icon name="chevron" size={17} color={theme.subtle} />
                </TouchableOpacity>
              ))
            ) : (
              <View style={[styles.timelineItem, { borderBottomColor: theme.border }]}>
                <View
                  style={[
                    styles.tinyIcon,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border
                    }
                  ]}
                >
                  <Icon name="file" size={17} color={theme.accent} />
                </View>
                <View style={styles.timelineDetails}>
                  <Text style={[styles.timelineTitle, { color: theme.text }]}>No recent activity</Text>
                  <Text style={[styles.timelineDesc, { color: theme.muted }]}>Standing by</Text>
                </View>
                <Icon name="chevron" size={17} color={theme.subtle} />
              </View>
            )}
          </View>
        </View>
      </ScrollView>
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

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 110
  },
  connectionCard: {
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  machine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    flex: 1,
    marginRight: 8
  },
  machineIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  machineDetails: {
    flex: 1
  },
  connectedEyebrow: {
    fontSize: 9,
    letterSpacing: 0.9,
    fontFamily: fontSemiBold,
    marginBottom: 1
  },
  machineName: {
    fontSize: 13,
    fontFamily: fontBold,
    lineHeight: 18
  },
  machineOs: {
    fontSize: 11,
    fontFamily: fontRegular,
    marginTop: 1
  },
  agentState: {
    alignItems: 'center',
    paddingTop: 31,
    paddingBottom: 26
  },
  orbWrap: {
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 8
  },
  orbRing: {
    position: 'absolute',
    width: 103,
    height: 103,
    borderRadius: 52,
    borderWidth: 1
  },
  orb: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pulseDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2
  },
  agentEyebrow: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontFamily: fontSemiBold,
    marginBottom: 2
  },
  agentHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  agentHeading: {
    fontSize: 30,
    fontFamily: fontBold,
    letterSpacing: -1.2,
    lineHeight: 36
  },
  blinker: {
    fontSize: 26,
    fontFamily: fontBold
  },
  agentDesc: {
    fontSize: 12,
    fontFamily: fontRegular,
    marginTop: 3
  },
  approvalCard: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 14
  },
  approvalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9
  },
  cardIconWarn: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
  },
  moreButton: {
    marginLeft: 'auto',
    padding: 4
  },
  approvalTitle: {
    fontSize: 17,
    letterSpacing: -0.4,
    fontFamily: fontBold,
    marginTop: 12,
    marginBottom: 2
  },
  approvalDesc: {
    fontSize: 12,
    fontFamily: fontRegular,
    marginBottom: 11
  },
  codeWrap: {
    paddingVertical: 10,
    paddingHorizontal: 11,
    borderRadius: 10,
    marginBottom: 12
  },
  codeText: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' })
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4
  },
  primaryButton: {
    flex: 1.55,
    height: 45,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  holdingButton: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: fontSemiBold
  },
  secondaryButton: {
    flex: 1,
    height: 45,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7
  },
  secondaryButtonText: {
    fontSize: 12,
    fontFamily: fontSemiBold
  },
  quickPromptCard: {
    height: 56,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 7,
    gap: 8,
    marginBottom: 24
  },
  plusIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  quickPromptPlaceholder: {
    flex: 1,
    fontSize: 12,
    fontFamily: fontRegular
  },
  shortcutText: {
    fontSize: 10,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    paddingRight: 6
  },
  activitySection: {
    marginTop: 4
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginHorizontal: 1
  },
  sectionTitle: {
    fontSize: 16,
    letterSpacing: -0.4,
    fontFamily: fontBold
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  viewAllText: {
    fontSize: 11,
    fontFamily: fontSemiBold
  },
  timeline: {
    borderTopWidth: 1
  },
  timelineItem: {
    minHeight: 62,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  tinyIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timelineDetails: {
    flex: 1
  },
  timelineTitle: {
    fontSize: 12,
    fontFamily: fontSemiBold
  },
  timelineDesc: {
    fontSize: 11,
    fontFamily: fontRegular,
    marginTop: 2
  },
  onboardCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16
  },
  onboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12
  },
  onboardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  onboardHeaderText: {
    flex: 1
  },
  onboardTitle: {
    fontSize: 15,
    fontFamily: fontBold,
    letterSpacing: -0.3
  },
  onboardSub: {
    fontSize: 12,
    fontFamily: fontRegular,
    marginTop: 2,
    lineHeight: 16
  },
  onboardSteps: {
    gap: 4,
    marginBottom: 14,
    paddingLeft: 4
  },
  onboardStepText: {
    fontSize: 12,
    fontFamily: fontMedium
  },
  onboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8
  },
  onboardButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: fontSemiBold
  }
});
