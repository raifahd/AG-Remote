import { Platform, Vibration } from 'react-native';
import * as Notifications from 'expo-notifications';

let isConfigured = false;

export async function setupNativeNotifications() {
  if (isConfigured) return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        priority: Notifications.AndroidNotificationPriority?.MAX
      })
    });

    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync('ag-remote-approvals', {
        name: 'Agent Approvals',
        importance: Notifications.AndroidImportance?.MAX ?? 5,
        vibrationPattern: [0, 250, 150, 250],
        sound: 'default',
        lightColor: '#6366f1',
        enableLights: true
      });

      await Notifications.setNotificationChannelAsync('ag-remote-updates', {
        name: 'Task Updates',
        importance: Notifications.AndroidImportance?.HIGH ?? 4,
        vibrationPattern: [0, 200],
        sound: 'default'
      });
    }
  } catch (err) {
    console.warn('Native notification setup skipped:', err?.message || err);
  } finally {
    isConfigured = true;
  }
}

export async function showNativeNotification({ title, body, data = {}, isUrgent = false }) {
  try {
    await setupNativeNotifications();

    if (isUrgent) {
      Vibration.vibrate([0, 250, 150, 250]);
    } else {
      Vibration.vibrate(200);
    }

    const channelId = isUrgent ? 'ag-remote-approvals' : 'ag-remote-updates';

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
        priority: isUrgent
          ? Notifications.AndroidNotificationPriority.MAX
          : Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === 'android' ? { channelId } : {})
      },
      trigger: null
    });
  } catch (err) {
    console.warn('Failed to schedule local notification:', err);
  }
}

