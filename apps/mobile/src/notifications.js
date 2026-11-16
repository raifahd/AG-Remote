import { Platform, Vibration } from 'react-native';

let notificationsModule = null;
let isConfigured = false;

async function getNotifications() {
  if (notificationsModule !== null) return notificationsModule;
  try {
    notificationsModule = await import('expo-notifications');
    return notificationsModule;
  } catch (err) {
    console.warn('Native notifications unavailable in this runtime:', err?.message || err);
    notificationsModule = false;
    return false;
  }
}

export async function setupNativeNotifications() {
  if (isConfigured) return;

  try {
    const Notifications = await getNotifications();
    if (!Notifications) {
      isConfigured = true;
      return;
    }

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
    if (isUrgent) {
      Vibration.vibrate([0, 250, 150, 250]);
    } else {
      Vibration.vibrate(200);
    }

    const Notifications = await getNotifications();
    if (!Notifications) return;

    await setupNativeNotifications();

    const channelId = isUrgent ? 'ag-remote-approvals' : 'ag-remote-updates';

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
        priority: isUrgent
          ? Notifications.AndroidNotificationPriority?.MAX
          : Notifications.AndroidNotificationPriority?.HIGH,
        ...(Platform.OS === 'android' ? { channelId } : {})
      },
      trigger: null
    });
  } catch (err) {
    console.warn('Failed to schedule local notification:', err?.message || err);
  }
}

