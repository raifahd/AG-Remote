import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import StatusBadge from '../../src/components/StatusBadge.js';
import {
  getProfiles,
  saveProfile,
  deleteProfile,
  getActiveProfile,
  setActiveProfileId,
  getCachedSessions,
  saveCachedSessions
} from '../../src/storage.js';
import { probeAllProfiles, fetchState, fetchSessions, focusSession, createSession } from '../../src/api.js';

export default function WorkspacesScreen() {
  const router = useRouter();
  const { theme, isDark } = useTheme();

  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfileState] = useState(null);
  const [activeState, setActiveState] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [switchingSessionId, setSwitchingSessionId] = useState(null);
  const [probes, setProbes] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [ntfyTopic, setNtfyTopic] = useState('');

  const [newSessionModalVisible, setNewSessionModalVisible] = useState(false);
  const [newSessionText, setNewSessionText] = useState('');
  const [creatingSession, setCreatingSession] = useState(false);

  const loadData = useCallback(async () => {
    const list = await getProfiles();
    const active = await getActiveProfile();
    setProfiles(list);
    setActiveProfileState(active);

    const cached = await getCachedSessions(active?.id);
    if (cached && cached.length > 0) {
      setSessions(cached);
    }

    if (active) {
      try {
        const [s, sess] = await Promise.all([
          fetchState(active).catch(() => null),
          fetchSessions(active).catch(() => null)
        ]);
        setActiveState(s);
        if (sess && Array.isArray(sess) && sess.length > 0) {
          setSessions(sess);
          saveCachedSessions(sess, active.id);
        } else if (cached && cached.length > 0) {
          setSessions(cached);
        }
      } catch {
        setActiveState(null);
        if (cached && cached.length > 0) {
          setSessions(cached);
        }
      }
    } else {
      setActiveState(null);
      if (cached && cached.length > 0) {
        setSessions(cached);
      }
    }

    if (list.length > 0) {
      const results = await probeAllProfiles(list);
      const map = {};
      results.forEach((r) => {
        map[r.profile.id] = r;
      });
      setProbes(map);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSelect = async (profile) => {
    await setActiveProfileId(profile.id);
    setActiveProfileState(profile);
    await loadData();
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setName('');
    setBaseUrl('http://100.');
    setToken('');
    setNtfyTopic('agremote_');
    setModalVisible(true);
  };

  const handleOpenEdit = (profile) => {
    setEditingId(profile.id);
    setName(profile.name || '');
    setBaseUrl(profile.baseUrl || '');
    setToken(profile.token || '');
    setNtfyTopic(profile.ntfyTopic || '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!baseUrl.trim() || !token.trim()) {
      Alert.alert('Missing fields', 'Base URL and Bearer Token are required.');
      return;
    }

    const id = editingId || `profile_${Date.now()}`;
    const cleanUrl = baseUrl.trim().replace(/\/+$/, '');
    const newProfile = {
      id,
      name: name.trim() || cleanUrl,
      baseUrl: cleanUrl,
      token: token.trim(),
      ntfyTopic: ntfyTopic.trim(),
      updatedAt: new Date().toISOString()
    };

    await saveProfile(newProfile);
    if (!activeProfile || activeProfile.id === id) {
      await setActiveProfileId(id);
    }
    setModalVisible(false);
    await loadData();
  };

  const handleSelectSession = async (session) => {
    if (activeProfile) {
      setSwitchingSessionId(session.id);
      try {
        await focusSession(activeProfile, session.id);
      } catch {}
      setSwitchingSessionId(null);
    }
    router.push({
      pathname: '/(tabs)/chat',
      params: { sessionId: session.id, sessionTitle: session.title }
    });
  };

  const handleCreateSession = async () => {
    if (!activeProfile) return;
    setCreatingSession(true);
    try {
      const res = await createSession(activeProfile, newSessionText.trim() || undefined);
      setNewSessionModalVisible(false);
      setNewSessionText('');
      await loadData();
      if (res?.sessionId) {
        router.push({
          pathname: '/(tabs)/chat',
          params: { sessionId: res.sessionId, sessionTitle: newSessionText.trim() || 'New Conversation' }
        });
      }
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create conversation');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleDelete = (profile) => {
    Alert.alert(
      'Remove Bridge',
      `Are you sure you want to remove "${profile.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await deleteProfile(profile.id);
            await loadData();
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar
        title="Your bridges"
        status={`${profiles.length} ${profiles.length === 1 ? 'BRIDGE' : 'BRIDGES'}`}
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />
        }
      >
        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Laptops</Text>
            <TouchableOpacity style={styles.headingAction} onPress={handleOpenAdd}>
              <Icon name="plus" size={17} color={theme.accent} />
              <Text style={[styles.headingActionText, { color: theme.accent }]}>Add</Text>
            </TouchableOpacity>
          </View>

          {profiles.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.muted }]}>No bridges configured yet.</Text>
            </View>
          ) : (
            profiles.map((p) => {
              const probe = probes[p.id];
              const isOnline = probe ? probe.ok : false;
              const isCurrent = activeProfile?.id === p.id;
              const detailText = isOnline
                ? `${probe.os ? `${probe.os} · ` : ''}Last active now`
                : `${p.baseUrl.replace(/^https?:\/\//, '')}`;

              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.bridgeCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: isCurrent ? theme.accent : theme.border
                    }
                  ]}
                  onPress={() => handleSelect(p)}
                  onLongPress={() => handleOpenEdit(p)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.machineIcon, { backgroundColor: theme.raised }]}>
                    <Icon name="monitor" size={20} color={isCurrent ? theme.accent : theme.text} />
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={[styles.cardDetail, { color: theme.muted }]} numberOfLines={1}>
                      {detailText}
                    </Text>
                  </View>
                  <StatusBadge
                    text={isOnline ? 'ONLINE' : 'OFFLINE'}
                    tone={isOnline ? 'success' : 'muted'}
                  />
                  <TouchableOpacity
                    onPress={() => handleOpenEdit(p)}
                    style={styles.chevronWrap}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Icon name="chevron" size={17} color={theme.subtle} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View style={styles.headingTitleRow}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Conversations</Text>
              {activeProfile && probes[activeProfile.id]?.ok === false && sessions.length > 0 && (
                <View style={[styles.cachedBadge, { backgroundColor: isDark ? '#f59e0b22' : '#fef3c7', borderColor: isDark ? '#78350f' : '#fcd34d' }]}>
                  <Text style={[styles.cachedBadgeText, { color: isDark ? '#fbbf24' : '#92400e' }]}>
                    CACHED
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[styles.headingAction, activeProfile && probes[activeProfile.id]?.ok === false && { opacity: 0.45 }]}
              onPress={() => {
                if (activeProfile && probes[activeProfile.id]?.ok === false) {
                  Alert.alert('Laptop Offline', 'Cannot start new conversations while your laptop is unreachable.');
                  return;
                }
                setNewSessionModalVisible(true);
              }}
            >
              <Icon name="plus" size={17} color={theme.accent} />
              <Text style={[styles.headingActionText, { color: theme.accent }]}>New</Text>
            </TouchableOpacity>
          </View>

          {sessions.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.emptyText, { color: theme.muted }]}>
                {activeProfile
                  ? (probes[activeProfile.id]?.ok === false
                      ? 'Laptop is offline. No cached conversations found on this device.'
                      : 'No conversations found on bridge.')
                  : 'Select a bridge above to view conversations.'}
              </Text>
            </View>
          ) : (
            sessions.map((s) => {
              const isCurrent = s.id === activeState?.activeSessionId;
              const isSwitching = switchingSessionId === s.id;
              const statusTone = s.status === 'generating' ? 'running' : s.status === 'awaiting_approval' ? 'warn' : 'muted';
              const badgeText = s.status === 'generating' ? 'RUNNING' : s.status === 'awaiting_approval' ? 'APPROVAL' : 'IDLE';
              const stepText = s.stepCount ? `${s.stepCount} steps` : '';
              const timeText = s.lastActivityAt
                ? new Date(s.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '';
              const metaText = [stepText, timeText].filter(Boolean).join(' · ');

              return (
                <TouchableOpacity
                  key={s.id}
                  style={[
                    styles.workspaceCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: isCurrent ? theme.accent : theme.border
                    }
                  ]}
                  onPress={() => handleSelectSession(s)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.workspaceMark, { backgroundColor: isCurrent ? theme.accent : theme.raised }]}>
                    <Text style={[styles.workspaceMarkText, { color: isCurrent ? '#ffffff' : theme.text }]}>
                      {(s.title || 'C')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>
                      {s.title || 'Untitled'}
                    </Text>
                    <View style={styles.subStatusRow}>
                      {s.status === 'generating' ? (
                        <View style={[styles.greenDot, { backgroundColor: theme.success }]} />
                      ) : null}
                      <Text style={[styles.cardDetail, { color: theme.muted }]} numberOfLines={1}>
                        {metaText || (s.workspace ? s.workspace.split('/').pop() : 'Conversation')}
                      </Text>
                    </View>
                  </View>
                  {isSwitching ? (
                    <ActivityIndicator size="small" color={theme.accent} />
                  ) : (
                    <StatusBadge text={badgeText} tone={statusTone} />
                  )}
                  <Icon name="chevron" size={18} color={theme.muted} />
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <TouchableOpacity
          style={[styles.addBridgeDashed, { borderColor: theme.border }]}
          onPress={handleOpenAdd}
          activeOpacity={0.8}
        >
          <View style={[styles.addBridgeIconCircle, { backgroundColor: `${theme.accent}24` }]}>
            <Icon name="plus" size={20} color={theme.accent} />
          </View>
          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>Add another bridge</Text>
            <Text style={[styles.cardDetail, { color: theme.muted }]}>
              Connect a laptop with a secure code
            </Text>
          </View>
          <Icon name="chevron" size={18} color={theme.muted} />
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Bridge' : 'Add Bridge'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="x" size={20} color={theme.muted} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.qrButton, { backgroundColor: theme.raised, borderColor: theme.border }]}
              onPress={() => {
                setModalVisible(false);
                router.push('/scanner');
              }}
            >
              <Icon name="wifi" size={18} color={theme.accent} />
              <Text style={[styles.qrButtonText, { color: theme.accent }]}>Scan Bridge QR Code</Text>
            </TouchableOpacity>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.muted }]}>BRIDGE NAME</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.raised, borderColor: theme.border, color: theme.text }]}
                value={name}
                onChangeText={setName}
                placeholder="laptop-deb"
                placeholderTextColor={theme.subtle}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.muted }]}>BASE URL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.raised, borderColor: theme.border, color: theme.text }]}
                value={baseUrl}
                onChangeText={setBaseUrl}
                placeholder="http://100.x.y.z:3000"
                placeholderTextColor={theme.subtle}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.muted }]}>BEARER TOKEN</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.raised, borderColor: theme.border, color: theme.text }]}
                value={token}
                onChangeText={setToken}
                placeholder="64-character token"
                placeholderTextColor={theme.subtle}
                autoCapitalize="none"
                secureTextEntry
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.muted }]}>NTFY TOPIC (OPTIONAL)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.raised, borderColor: theme.border, color: theme.text }]}
                value={ntfyTopic}
                onChangeText={setNtfyTopic}
                placeholder="agremote_..."
                placeholderTextColor={theme.subtle}
                autoCapitalize="none"
              />
            </View>

            <View style={styles.modalActions}>
              {editingId && (
                <TouchableOpacity
                  style={[styles.deleteButton, { borderColor: theme.danger }]}
                  onPress={() => {
                    const toDelete = profiles.find((p) => p.id === editingId);
                    setModalVisible(false);
                    if (toDelete) handleDelete(toDelete);
                  }}
                >
                  <Text style={[styles.deleteButtonText, { color: theme.danger }]}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.accent }]}
                onPress={handleSave}
              >
                <Text style={styles.saveButtonText}>Save Bridge</Text>
              </TouchableOpacity>
            </View>
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

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: theme.muted }]}>INITIAL PROMPT (OPTIONAL)</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    height: 80,
                    paddingTop: 10,
                    textAlignVertical: 'top',
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
                style={[styles.deleteButton, { borderColor: theme.border }]}
                onPress={() => setNewSessionModalVisible(false)}
              >
                <Text style={[styles.deleteButtonText, { color: theme.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: theme.accent }]}
                onPress={handleCreateSession}
                disabled={creatingSession}
              >
                {creatingSession ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Create</Text>
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

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 110
  },
  section: {
    marginBottom: 25
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginHorizontal: 1
  },
  headingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  cachedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1
  },
  cachedBadgeText: {
    fontSize: 9,
    fontFamily: fontBold,
    letterSpacing: 0.8
  },
  sectionTitle: {
    fontSize: 16,
    letterSpacing: -0.4,
    fontFamily: fontBold
  },
  headingAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  headingActionText: {
    fontSize: 11,
    fontFamily: fontSemiBold
  },
  emptyCard: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 12,
    fontFamily: fontRegular
  },
  bridgeCard: {
    minHeight: 66,
    padding: 11,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  workspaceCard: {
    minHeight: 66,
    padding: 11,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  machineIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  workspaceMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  workspaceMarkText: {
    color: '#ffffff',
    fontFamily: fontBold,
    fontSize: 16
  },
  cardInfo: {
    flex: 1
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: fontBold,
    lineHeight: 18
  },
  cardDetail: {
    fontSize: 11,
    fontFamily: fontRegular,
    marginTop: 2
  },
  subStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  chevronWrap: {
    padding: 4
  },
  addBridgeDashed: {
    width: '100%',
    paddingVertical: 15,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 18
  },
  addBridgeIconCircle: {
    width: 35,
    height: 35,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center'
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
    fontSize: 17,
    fontWeight: '700'
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16
  },
  qrButtonText: {
    fontSize: 12,
    fontWeight: '600'
  },
  inputGroup: {
    marginBottom: 12
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 4
  },
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 13
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16
  },
  deleteButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteButtonText: {
    fontSize: 12,
    fontWeight: '600'
  },
  saveButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  }
});

