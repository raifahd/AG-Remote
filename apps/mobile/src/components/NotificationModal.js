import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme.js';
import Icon from './Icon.js';
import { getActiveProfile } from '../storage.js';
import { sendTestNotification, fetchSettings, updateSettings } from '../api.js';

export default function NotificationModal({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [profile, setProfile] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);

  useEffect(() => {
    if (!visible) {
      setTestResult(null);
      return;
    }
    (async () => {
      try {
        const active = await getActiveProfile();
        setProfile(active);
        if (active) {
          const settings = await fetchSettings(active).catch(() => null);
          if (settings?.quietHours) {
            setQuietHoursEnabled(Boolean(settings.quietHours.enabled));
          }
        }
      } catch {}
    })();
  }, [visible]);

  const handleSendTest = async () => {
    if (!profile || testing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendTestNotification(profile);
      if (res?.ok) {
        setTestResult({ success: true, message: 'Test alert sent to your phone!' });
      } else {
        setTestResult({ success: false, message: 'Notification dispatch failed.' });
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message || 'Error sending test alert.' });
    } finally {
      setTesting(false);
    }
  };

  const handleToggleQuietHours = async () => {
    if (!profile) return;
    const nextVal = !quietHoursEnabled;
    setQuietHoursEnabled(nextVal);
    try {
      await updateSettings(profile, {
        quietHours: {
          enabled: nextVal,
          startHour: 23,
          endHour: 7
        }
      });
    } catch {
      setQuietHoursEnabled(!nextVal);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              paddingBottom: Math.max(insets.bottom, 20) + 12
            }
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.iconWrap, { backgroundColor: theme.raised }]}>
                <Icon name="bell" size={20} color={theme.accent} />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Notifications</Text>
                <Text style={[styles.subtitle, { color: theme.muted }]}>
                  {profile ? profile.name : 'Remote Agent Alerts'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: theme.raised }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Icon name="x" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            <View style={[styles.statusCard, { backgroundColor: theme.raised, borderColor: theme.border }]}>
              <View style={styles.statusRow}>
                <View style={styles.statusLabelRow}>
                  <View style={[styles.pulseDot, { backgroundColor: theme.success }]} />
                  <Text style={[styles.statusText, { color: theme.text }]}>
                    Push Delivery Active
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: `${theme.success}20` }]}>
                  <Text style={[styles.badgeText, { color: theme.success }]}>ntfy.sh</Text>
                </View>
              </View>
              <Text style={[styles.hostText, { color: theme.muted }]}>
                Target Host: {profile?.baseUrl || '100.69.62.84:48123'}
              </Text>

              <TouchableOpacity
                style={[
                  styles.testButton,
                  { backgroundColor: theme.accent },
                  testing && { opacity: 0.7 }
                ]}
                onPress={handleSendTest}
                disabled={testing || !profile}
                activeOpacity={0.8}
              >
                {testing ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Icon name="send" size={17} color="#ffffff" />
                    <Text style={styles.testButtonText}>Send Test Push Notification</Text>
                  </>
                )}
              </TouchableOpacity>

              {testResult && (
                <View
                  style={[
                    styles.resultCard,
                    {
                      backgroundColor: testResult.success ? `${theme.success}18` : `${theme.danger}18`,
                      borderColor: testResult.success ? theme.success : theme.danger
                    }
                  ]}
                >
                  <Icon
                    name={testResult.success ? 'check' : 'x'}
                    size={16}
                    color={testResult.success ? theme.success : theme.danger}
                  />
                  <Text
                    style={[
                      styles.resultText,
                      { color: testResult.success ? theme.success : theme.danger }
                    ]}
                  >
                    {testResult.message}
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.quietCard,
                { backgroundColor: theme.raised, borderColor: theme.border }
              ]}
              onPress={handleToggleQuietHours}
              activeOpacity={0.8}
            >
              <View style={styles.quietLeft}>
                <Icon
                  name={quietHoursEnabled ? 'moon' : 'sun'}
                  size={20}
                  color={quietHoursEnabled ? theme.accent : theme.muted}
                />
                <View style={styles.quietTextCol}>
                  <Text style={[styles.quietTitle, { color: theme.text }]}>Quiet Hours</Text>
                  <Text style={[styles.quietDesc, { color: theme.muted }]}>
                    {quietHoursEnabled ? 'Active (11:00 PM - 7:00 AM)' : 'Disabled (all alerts sound)'}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.togglePill,
                  {
                    backgroundColor: quietHoursEnabled ? theme.accent : theme.surface,
                    borderColor: theme.border
                  }
                ]}
              >
                <Text
                  style={[
                    styles.togglePillText,
                    { color: quietHoursEnabled ? '#ffffff' : theme.muted }
                  ]}
                >
                  {quietHoursEnabled ? 'ON' : 'OFF'}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.infoSection}>
              <Text style={[styles.infoSectionTitle, { color: theme.muted }]}>
                NOTIFICATION TYPES
              </Text>
              <View style={[styles.infoRow, { borderColor: theme.border }]}>
                <Icon name="shield" size={17} color={theme.warning} />
                <View style={styles.infoCol}>
                  <Text style={[styles.infoMain, { color: theme.text }]}>Approval Requests</Text>
                  <Text style={[styles.infoSub, { color: theme.subtle }]}>
                    Commands & file edit requests require your confirmation
                  </Text>
                </View>
              </View>
              <View style={[styles.infoRow, { borderColor: theme.border }]}>
                <Icon name="check" size={17} color={theme.success} />
                <View style={styles.infoCol}>
                  <Text style={[styles.infoMain, { color: theme.text }]}>Run Finished</Text>
                  <Text style={[styles.infoSub, { color: theme.subtle }]}>
                    Alerts when Antigravity finishes a generating task
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

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

const fontRegular = Platform.select({
  ios: 'Poppins-Regular',
  android: 'Poppins_400Regular',
  web: 'Poppins, sans-serif',
  default: 'System'
});

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'flex-end'
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    maxHeight: '85%'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: {
    fontSize: 18,
    fontFamily: fontBold
  },
  subtitle: {
    fontSize: 12,
    fontFamily: fontRegular,
    marginTop: -2
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scrollArea: {
    maxHeight: 460
  },
  statusCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  statusLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  statusText: {
    fontSize: 14,
    fontFamily: fontSemiBold
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8
  },
  badgeText: {
    fontSize: 11,
    fontFamily: fontSemiBold
  },
  hostText: {
    fontSize: 11,
    fontFamily: fontRegular,
    marginBottom: 14
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12
  },
  testButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: fontSemiBold
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12
  },
  resultText: {
    fontSize: 12,
    fontFamily: fontMedium,
    flex: 1
  },
  quietCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 16
  },
  quietLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  quietTextCol: {
    gap: 2
  },
  quietTitle: {
    fontSize: 14,
    fontFamily: fontSemiBold
  },
  quietDesc: {
    fontSize: 11,
    fontFamily: fontRegular
  },
  togglePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1
  },
  togglePillText: {
    fontSize: 11,
    fontFamily: fontBold
  },
  infoSection: {
    gap: 8,
    marginBottom: 10
  },
  infoSectionTitle: {
    fontSize: 10,
    fontFamily: fontBold,
    letterSpacing: 0.8,
    marginBottom: 4
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1
  },
  infoCol: {
    flex: 1,
    gap: 2
  },
  infoMain: {
    fontSize: 13,
    fontFamily: fontSemiBold
  },
  infoSub: {
    fontSize: 11,
    fontFamily: fontRegular
  }
});
