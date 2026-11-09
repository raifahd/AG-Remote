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
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  RefreshIcon,
  QrCodeIcon,
  Add01Icon,
  NetworkIcon,
  Edit02Icon,
  Delete02Icon,
  StopWatchIcon,
  Notification03Icon,
  Sun01Icon,
  Moon01Icon,
  ShieldCheckIcon,
  Cancel01Icon
} from '@hugeicons/core-free-icons';
import { useTheme } from '../../src/theme.js';
import {
  getProfiles,
  saveProfile,
  deleteProfile,
  getActiveProfile,
  setActiveProfileId,
  getQuietHoursSettings,
  saveQuietHoursSettings
} from '../../src/storage.js';
import { checkHealth, probeAllProfiles, updateSettings } from '../../src/api.js';

export default function BridgesScreen() {
  const router = useRouter();
  const { theme, isDark, toggleTheme } = useTheme();

  const [profiles, setProfiles] = useState([]);
  const [activeProfile, setActiveProfileState] = useState(null);
  const [probes, setProbes] = useState({});
  const [isProbing, setIsProbing] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [ntfyTopic, setNtfyTopic] = useState('');
  const [quietHours, setQuietHours] = useState({ enabled: false, startHour: 23, endHour: 7 });

  const loadData = useCallback(async () => {
    const list = await getProfiles();
    const active = await getActiveProfile();
    const qh = await getQuietHoursSettings();
    setProfiles(list);
    setActiveProfileState(active);
    setQuietHours(qh);

    if (list.length > 0) {
      setIsProbing(true);
      const results = await probeAllProfiles(list);
      const map = {};
      results.forEach((r) => {
        map[r.profile.id] = r;
      });
      setProbes(map);
      setIsProbing(false);
    }
  }, []);

  const handleToggleQuietHours = async () => {
    const updated = { ...quietHours, enabled: !quietHours.enabled };
    setQuietHours(updated);
    await saveQuietHoursSettings(updated);
    if (activeProfile) {
      try {
        await updateSettings(activeProfile, updated);
      } catch {}
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelect = async (profile) => {
    await setActiveProfileId(profile.id);
    setActiveProfileState(profile);
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

  const handleSendTestNotification = async (profile) => {
    if (!profile.ntfyTopic) {
      Alert.alert('No topic', 'This bridge profile has no ntfy topic configured.');
      return;
    }
    try {
      const topicUrl = `https://ntfy.sh/${profile.ntfyTopic}`;
      const res = await fetch(topicUrl, {
        method: 'POST',
        headers: {
          Title: 'AG Remote Test',
          Priority: 'default',
          Tags: 'bell,sparkles'
        },
        body: `Test notification from AG Remote (${profile.name}) at ${new Date().toLocaleTimeString()}`
      });
      if (res.ok) {
        Alert.alert('Notification Dispatched', `Sent to ntfy.sh/${profile.ntfyTopic}`);
      } else {
        Alert.alert('Error', `ntfy responded with status ${res.status}`);
      }
    } catch (err) {
      Alert.alert('Network Error', err.message);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          BRIDGES & SERVERS
        </Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={[styles.smallBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={loadData}
          >
            {isProbing ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <HugeiconsIcon icon={RefreshIcon} size={16} color={theme.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={() => router.push('/scanner')}
          >
            <HugeiconsIcon icon={QrCodeIcon} size={16} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
            onPress={handleOpenAdd}
          >
            <HugeiconsIcon icon={Add01Icon} size={18} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {profiles.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <HugeiconsIcon icon={NetworkIcon} size={36} color={theme.textMuted} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Bridge Profiles</Text>
          <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
            Scan the pairing QR code displayed in Antigravity or add your Tailscale IP manually.
          </Text>
          <View style={styles.emptyButtons}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
              onPress={() => router.push('/scanner')}
            >
              <HugeiconsIcon icon={QrCodeIcon} size={18} color={theme.bg} />
              <Text style={[styles.primaryBtnText, { color: theme.bg }]}>Scan QR Code</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
              onPress={handleOpenAdd}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>Add Manually</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        profiles.map((p) => {
          const isActive = activeProfile && activeProfile.id === p.id;
          const probe = probes[p.id];
          const isReachable = probe ? probe.reachable : null;
          const latency = probe ? probe.latencyMs : null;

          return (
            <TouchableOpacity
              key={p.id}
              activeOpacity={0.8}
              style={[
                styles.profileCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: isActive ? theme.text : theme.borderSubtle
                }
              ]}
              onPress={() => handleSelect(p)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <View
                    style={[
                      styles.indicatorDot,
                      {
                        backgroundColor:
                          isReachable === true
                            ? theme.green
                            : isReachable === false
                            ? theme.red
                            : theme.textMuted
                      }
                    ]}
                  />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{p.name}</Text>
                  {isActive && (
                    <View style={[styles.activeBadge, { backgroundColor: theme.text }]}>
                      <Text style={[styles.activeBadgeText, { color: theme.bg }]}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => handleOpenEdit(p)}
                    style={styles.actionIconBtn}
                  >
                    <HugeiconsIcon icon={Edit02Icon} size={18} color={theme.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDelete(p)}
                    style={styles.actionIconBtn}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={18} color={theme.red} />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={[styles.cardUrl, { color: theme.textMuted }]}>{p.baseUrl}</Text>

              <View style={styles.cardFooter}>
                <View style={styles.metricItem}>
                  <HugeiconsIcon icon={StopWatchIcon} size={14} color={theme.textSecondary} />
                  <Text style={[styles.metricText, { color: theme.textSecondary }]}>
                    {latency !== null ? `${latency} ms` : 'Probing...'}
                  </Text>
                </View>
                {p.ntfyTopic ? (
                  <TouchableOpacity
                    style={styles.metricItem}
                    onPress={() => handleSendTestNotification(p)}
                  >
                    <HugeiconsIcon icon={Notification03Icon} size={14} color={theme.textSecondary} />
                    <Text style={[styles.metricText, { color: theme.textSecondary }]}>
                      Test Ping
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })
      )}

      <View style={[styles.sectionHeader, { marginTop: 28 }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          APPEARANCE & THEME
        </Text>
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <HugeiconsIcon
              icon={isDark ? Moon01Icon : Sun01Icon}
              size={22}
              color={theme.text}
            />
            <View style={{ marginLeft: 12 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Theme Mode</Text>
              <Text style={[styles.settingSub, { color: theme.textSecondary }]}>
                {isDark ? 'Dark (Monochrome OLED)' : 'Light (Minimal Paper)'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.toggleBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={toggleTheme}
          >
            <Text style={[styles.toggleBtnText, { color: theme.text }]}>
              Switch to {isDark ? 'Light' : 'Dark'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.sectionHeader, { marginTop: 28 }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          NOTIFICATIONS & QUIET HOURS
        </Text>
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <HugeiconsIcon
              icon={Notification03Icon}
              size={22}
              color={theme.text}
            />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={[styles.settingLabel, { color: theme.text }]}>Quiet Hours</Text>
              <Text style={[styles.settingSub, { color: theme.textSecondary }]}>
                {quietHours.enabled
                  ? `Mutes non-urgent alerts from ${quietHours.startHour}:00 to 0${quietHours.endHour}:00`
                  : 'Disabled (All notifications delivered)'}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.toggleBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={handleToggleQuietHours}
          >
            <Text style={[styles.toggleBtnText, { color: theme.text }]}>
              {quietHours.enabled ? 'Turn Off' : 'Turn On'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.sectionHeader, { marginTop: 28 }]}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          SECURITY & PROTOCOL
        </Text>
      </View>

      <View style={[styles.settingCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.protocolRow}>
          <HugeiconsIcon icon={ShieldCheckIcon} size={20} color={theme.green} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={[styles.protocolTitle, { color: theme.text }]}>Tailscale cgNAT Only</Text>
            <Text style={[styles.protocolDesc, { color: theme.textSecondary }]}>
              All traffic routes directly over Tailscale WireGuard mesh (100.64.0.0/10). No public IP, no ports forwarded, zero cloud middleman.
            </Text>
          </View>
        </View>
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {editingId ? 'Edit Bridge Profile' : 'Add Bridge Profile'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <HugeiconsIcon icon={Cancel01Icon} size={22} color={theme.text} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Profile Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="e.g. Debian 13 (lumen) or Windows 11"
              placeholderTextColor={theme.textMuted}
              value={name}
              onChangeText={setName}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Base URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="http://100.69.62.84:48123"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              value={baseUrl}
              onChangeText={setBaseUrl}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Bearer Token</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="64-character hex secret"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={token}
              onChangeText={setToken}
            />

            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>ntfy Topic</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.card, borderColor: theme.border, color: theme.text }]}
              placeholder="agremote_..."
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              value={ntfyTopic}
              onChangeText={setNtfyTopic}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={{ color: theme.text, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.accent }]}
                onPress={handleSave}
              >
                <Text style={{ color: theme.bg, fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    padding: 16,
    paddingBottom: 40
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8
  },
  smallBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 8
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
    paddingHorizontal: 12
  },
  emptyButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 8
  },
  primaryBtnText: {
    fontSize: 13,
    fontWeight: '700'
  },
  secondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '600'
  },
  profileCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 12
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700'
  },
  activeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  cardActions: {
    flexDirection: 'row',
    gap: 4
  },
  actionIconBtn: {
    padding: 6
  },
  cardUrl: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 6
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.2)'
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  metricText: {
    fontSize: 12,
    fontWeight: '500'
  },
  settingCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '600'
  },
  settingSub: {
    fontSize: 12,
    marginTop: 2
  },
  toggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '600'
  },
  protocolRow: {
    flexDirection: 'row',
    alignItems: 'flex-start'
  },
  protocolTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4
  },
  protocolDesc: {
    fontSize: 12,
    lineHeight: 18
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700'
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6
  },
  input: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 20
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    borderWidth: 1
  }
});

