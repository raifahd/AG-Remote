import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Link01Icon,
  StopCircleIcon,
  Alert02Icon,
  Tick02Icon,
  Cancel01Icon
} from '@hugeicons/core-free-icons';
import { useTheme } from '../../src/theme.js';
import { getActiveProfile } from '../../src/storage.js';
import { fetchState, checkHealth, sendApprove, sendReject, sendStop } from '../../src/api.js';
import { BridgeWebSocketClient } from '../../src/websocket.js';

export default function HomeScreen() {
  const { theme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [degradedInfo, setDegradedInfo] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const active = await getActiveProfile();
      setProfile(active);
      if (active) {
        const [s, h] = await Promise.all([
          fetchState(active),
          checkHealth(active.baseUrl).catch(() => null)
        ]);
        setState(s);
        if (h && h.health && h.health.status === 'degraded') {
          setDegradedInfo(h.health.degradedReason || 'Bridge running in degraded mode');
        } else {
          setDegradedInfo(null);
        }
      }
    } catch {
      // transient fetch failure
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
    setActionInProgress(true);
    try {
      await sendApprove(profile, state.pendingApproval.requestId);
      await loadData();
    } catch (err) {
      alert(err.message || 'Approval failed');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleReject = async () => {
    if (!profile || !state?.pendingApproval) return;
    setActionInProgress(true);
    try {
      await sendReject(profile, state.pendingApproval.requestId);
      await loadData();
    } catch (err) {
      alert(err.message || 'Rejection failed');
    } finally {
      setActionInProgress(false);
    }
  };

  const handleStop = async () => {
    if (!profile) return;
    setActionInProgress(true);
    try {
      await sendStop(profile);
      await loadData();
    } catch (err) {
      alert(err.message || 'Stop failed');
    } finally {
      setActionInProgress(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.text} size="large" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: theme.bg }]}>
        <HugeiconsIcon icon={Link01Icon} size={64} color={theme.textMuted} />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>No Bridge Connected</Text>
        <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
          Pair your phone with Antigravity running on your PC.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.text }]}
          onPress={() => router.push('/bridges')}
        >
          <Text style={[styles.primaryButtonText, { color: theme.bg }]}>Configure Bridges</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = state?.status ?? 'idle';
  const approval = state?.pendingApproval;

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadData();
          }}
          tintColor={theme.text}
        />
      }
    >
      <View style={[styles.headerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.headerHost, { color: theme.text }]}>{profile.name || 'Antigravity Host'}</Text>
            <Text style={[styles.headerUrl, { color: theme.textMuted }]}>{profile.baseUrl}</Text>
          </View>
          <View style={styles.connectionBadge}>
            <View
              style={[
                styles.dot,
                { backgroundColor: wsConnected ? theme.green : theme.textMuted }
              ]}
            />
            <Text style={[styles.dotLabel, { color: theme.textMuted }]}>
              {wsConnected ? 'Live' : 'Polling'}
            </Text>
          </View>
        </View>
      </View>

      {degradedInfo && (
        <View style={[styles.degradedBanner, { borderColor: theme.amber }]}>
          <HugeiconsIcon icon={Alert02Icon} size={18} color={theme.amber} />
          <Text style={[styles.degradedBannerText, { color: theme.amber }]}>
            {degradedInfo}
          </Text>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>AGENT STATUS</Text>
        <View style={styles.statusRow}>
          <Text
            style={[
              styles.statusText,
              {
                color:
                  status === 'generating'
                    ? theme.text
                    : status === 'awaiting_approval'
                    ? theme.amber
                    : status === 'error'
                    ? theme.red
                    : theme.textSecondary
              }
            ]}
          >
            {status.replace('_', ' ').toUpperCase()}
          </Text>
        </View>

        {state?.activeSessionId ? (
          <View style={styles.sessionBox}>
            <Text style={[styles.sessionLabel, { color: theme.textMuted }]}>Active Session</Text>
            <Text style={[styles.sessionId, { color: theme.textSecondary }]} numberOfLines={1}>
              {state.activeSessionId}
            </Text>
          </View>
        ) : null}

        {status === 'generating' ? (
          <TouchableOpacity
            style={[styles.stopButton, { borderColor: theme.red, backgroundColor: theme.redSurface }]}
            onPress={handleStop}
            disabled={actionInProgress}
          >
            <HugeiconsIcon icon={StopCircleIcon} size={18} color={theme.red} style={{ marginRight: 6 }} />
            <Text style={[styles.stopButtonText, { color: theme.red }]}>Stop Generation</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {approval ? (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.amber }]}>
          <View style={styles.approvalHeader}>
            <View style={styles.approvalTagRow}>
              <HugeiconsIcon icon={Alert02Icon} size={16} color={theme.amber} style={{ marginRight: 4 }} />
              <Text style={[styles.approvalTitle, { color: theme.amber }]}>Approval Required</Text>
            </View>
            <View style={[styles.kindPill, { backgroundColor: theme.amberSurface }]}>
              <Text style={[styles.kindPillText, { color: theme.amber }]}>
                {approval.kind.toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={[styles.codeBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
            <Text style={[styles.codeText, { color: theme.text }]}>{approval.summary}</Text>
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.approveBtn, { backgroundColor: theme.green }]}
              onPress={handleApprove}
              disabled={actionInProgress}
            >
              <HugeiconsIcon icon={Tick02Icon} size={20} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.btnText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.rejectBtn, { backgroundColor: theme.red }]}
              onPress={handleReject}
              disabled={actionInProgress}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={20} color="#ffffff" style={{ marginRight: 4 }} />
              <Text style={styles.btnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40
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
    padding: 24
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24
  },
  primaryButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 15
  },
  headerCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  headerHost: {
    fontSize: 16,
    fontWeight: '700'
  },
  headerUrl: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: 'monospace'
  },
  connectionBadge: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  dotLabel: {
    fontSize: 12,
    fontWeight: '600'
  },
  card: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4
  },
  statusText: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  sessionBox: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#27272a'
  },
  sessionLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2
  },
  sessionId: {
    fontSize: 13,
    fontFamily: 'monospace'
  },
  stopButton: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1
  },
  degradedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.08)'
  },
  degradedBannerText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1
  },
  stopButtonText: {
    fontWeight: '700',
    fontSize: 14
  },
  approvalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  approvalTagRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  approvalTitle: {
    fontSize: 16,
    fontWeight: '800'
  },
  kindPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6
  },
  kindPillText: {
    fontSize: 11,
    fontWeight: '800'
  },
  codeBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginVertical: 12
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 8
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 8
  },
  btnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15
  }
});

