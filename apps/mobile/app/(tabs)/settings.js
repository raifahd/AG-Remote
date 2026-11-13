import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme, ACCENTS } from '../../src/theme.js';
import TopBar from '../../src/components/TopBar.js';
import Icon from '../../src/components/Icon.js';
import {
  getActiveProfile,
  getQuietHoursSettings,
  saveQuietHoursSettings,
  deleteProfile
} from '../../src/storage.js';
import { updateSettings } from '../../src/api.js';

export default function SettingsScreen() {
  const router = useRouter();
  const {
    theme,
    isDark,
    setDark,
    accent,
    setAccent,
    chatFontSize,
    setChatFontSize
  } = useTheme();

  const [toast, setToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('New pairing code ready');
  const [notifyApproval, setNotifyApproval] = useState(true);
  const [notifyCompleted, setNotifyCompleted] = useState(true);
  const [quietHours, setQuietHours] = useState({ enabled: false, startHour: 23, endHour: 7 });
  const [activeProfile, setActiveProfile] = useState(null);

  useEffect(() => {
    async function init() {
      const p = await getActiveProfile();
      setActiveProfile(p);
      const qh = await getQuietHoursSettings();
      setQuietHours(qh);
    }
    init();
  }, []);

  const showToast = (message) => {
    setToastMessage(message);
    setToast(true);
    setTimeout(() => {
      setToast(false);
    }, 2800);
  };

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

  const handleRevoke = () => {
    if (!activeProfile) {
      Alert.alert('No Bridge', 'There is no active bridge to disconnect.');
      return;
    }
    Alert.alert(
      'Revoke access token',
      `Are you sure you want to disconnect from "${activeProfile.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            await deleteProfile(activeProfile.id);
            setActiveProfile(null);
            showToast('Disconnected from bridge');
          }
        }
      ]
    );
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <TopBar title="Settings" status="PREFERENCES" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.settingsGroup}>
          <Text style={[styles.groupLabel, { color: theme.muted }]}>APPEARANCE</Text>
          <View style={[styles.settingsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Theme</Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Match your workspace
                </Text>
              </View>
              <View style={[styles.segmented, { backgroundColor: theme.raised }]}>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    !isDark && [styles.segmentSelected, { backgroundColor: theme.surface }]
                  ]}
                  onPress={() => setDark(false)}
                  activeOpacity={0.8}
                >
                  <Icon name="sun" size={15} color={!isDark ? theme.text : theme.muted} />
                  <Text
                    style={[
                      styles.segmentText,
                      { color: !isDark ? theme.text : theme.muted }
                    ]}
                  >
                    Light
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.segmentButton,
                    isDark && [styles.segmentSelected, { backgroundColor: theme.surface }]
                  ]}
                  onPress={() => setDark(true)}
                  activeOpacity={0.8}
                >
                  <Icon name="moon" size={15} color={isDark ? theme.text : theme.muted} />
                  <Text
                    style={[
                      styles.segmentText,
                      { color: isDark ? theme.text : theme.muted }
                    ]}
                  >
                    Dark
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.verticalSetting}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Accent color</Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Used for active controls and your messages
                </Text>
              </View>
              <View style={styles.swatches}>
                {ACCENTS.map((color) => {
                  const isSelected = accent === color;
                  return (
                    <TouchableOpacity
                      key={color}
                      style={[
                        styles.swatch,
                        { backgroundColor: color },
                        isSelected && [styles.swatchActive, { borderColor: theme.text }]
                      ]}
                      onPress={() => setAccent(color)}
                      activeOpacity={0.8}
                    >
                      {isSelected && <Icon name="check" size={14} color="#ffffff" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={[styles.verticalSetting, { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14, marginTop: 4 }]}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Chat font size</Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Text size inside the chat screen only
                </Text>
              </View>
              <View style={[styles.segmented, { backgroundColor: theme.raised, marginTop: 10, alignSelf: 'stretch', justifyContent: 'space-between' }]}>
                {[
                  { key: 'small', label: 'Small' },
                  { key: 'medium', label: 'Default' },
                  { key: 'large', label: 'Large' },
                  { key: 'xlarge', label: 'XL' }
                ].map((item) => {
                  const isSelected = chatFontSize === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[
                        styles.segmentButton,
                        { flex: 1, justifyContent: 'center' },
                        isSelected && [styles.segmentSelected, { backgroundColor: theme.surface }]
                      ]}
                      onPress={() => setChatFontSize(item.key)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isSelected ? theme.accent : theme.muted,
                            fontWeight: isSelected ? '700' : '500'
                          }
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.settingsGroup}>
          <Text style={[styles.groupLabel, { color: theme.muted }]}>NOTIFICATIONS</Text>
          <View style={[styles.settingsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>
                  Agent needs approval
                </Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Critical actions only
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  { backgroundColor: notifyApproval ? theme.accent : '#555555' }
                ]}
                onPress={() => setNotifyApproval(!notifyApproval)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    notifyApproval && styles.toggleThumbOn
                  ]}
                />
              </TouchableOpacity>
            </View>

            <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>
                  Agent completed task
                </Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Summary and changed files
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  { backgroundColor: notifyCompleted ? theme.accent : '#555555' }
                ]}
                onPress={() => setNotifyCompleted(!notifyCompleted)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    notifyCompleted && styles.toggleThumbOn
                  ]}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>Quiet hours</Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Mute non-critical alerts 23:00 - 07:00
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.toggle,
                  { backgroundColor: quietHours.enabled ? theme.accent : '#555555' }
                ]}
                onPress={handleToggleQuietHours}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.toggleThumb,
                    quietHours.enabled && styles.toggleThumbOn
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.settingsGroup}>
          <Text style={[styles.groupLabel, { color: theme.muted }]}>SECURITY</Text>
          <View style={[styles.settingsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TouchableOpacity
              style={[styles.settingLink, { borderBottomColor: theme.border }]}
              onPress={() => {
                showToast('New pairing code ready');
                router.push('/scanner');
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.text }]}>
                  Re-pair this device
                </Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Generate a new secure connection
                </Text>
              </View>
              <Icon name="chevron" size={18} color={theme.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.settingLink}
              onPress={handleRevoke}
              activeOpacity={0.7}
            >
              <View style={styles.settingTextCol}>
                <Text style={[styles.settingTitle, { color: theme.danger }]}>
                  Revoke access token
                </Text>
                <Text style={[styles.settingDetail, { color: theme.muted }]}>
                  Disconnect this mobile device
                </Text>
              </View>
              <Icon name="chevron" size={18} color={theme.muted} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.versionText, { color: theme.subtle }]}>
          AG REMOTE · VERSION 1.0.0
        </Text>
      </ScrollView>

      {toast && (
        <View style={[styles.toast, { backgroundColor: theme.text }]}>
          <Icon name="shield" size={18} color={theme.bg} />
          <Text style={[styles.toastText, { color: theme.bg }]}>{toastMessage}</Text>
          <TouchableOpacity onPress={() => setToast(false)} style={styles.toastClose}>
            <Icon name="x" size={16} color={theme.bg} />
          </TouchableOpacity>
        </View>
      )}
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
    paddingTop: 7,
    paddingBottom: 110
  },
  settingsGroup: {
    marginBottom: 22
  },
  groupLabel: {
    fontSize: 10,
    letterSpacing: Platform.select({ ios: 1.2, default: 0.2 }),
    fontFamily: fontSemiBold,
    marginBottom: 7,
    marginLeft: 2,
    includeFontPadding: false
  },
  settingsCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden'
  },
  settingRow: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1
  },
  verticalSetting: {
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  settingLink: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1
  },
  settingTextCol: {
    flex: 1,
    paddingRight: 10
  },
  settingTitle: {
    fontSize: 12,
    fontFamily: fontBold
  },
  settingDetail: {
    fontSize: 11,
    fontFamily: fontRegular,
    marginTop: 2
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 11
  },
  segmentButton: {
    height: 29,
    paddingHorizontal: 8,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  segmentSelected: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2
      },
      android: {
        elevation: 1
      }
    })
  },
  segmentText: {
    fontSize: 10,
    fontFamily: fontRegular
  },
  swatches: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 11
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center'
  },
  swatchActive: {
    borderWidth: 2
  },
  toggle: {
    width: 37,
    height: 22,
    borderRadius: 20,
    padding: 3,
    justifyContent: 'center'
  },
  toggleThumb: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff'
  },
  toggleThumbOn: {
    transform: [{ translateX: 15 }]
  },
  versionText: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: Platform.select({ ios: 0.6, default: 0 }),
    marginTop: 26,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' })
  },
  toast: {
    position: 'absolute',
    bottom: 95,
    alignSelf: 'center',
    width: '85%',
    maxWidth: 350,
    height: 53,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    zIndex: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 25
      },
      android: {
        elevation: 8
      }
    })
  },
  toastText: {
    fontSize: 11,
    fontWeight: '600',
    flex: 1
  },
  toastClose: {
    padding: 4
  }
});

