import { Platform } from 'react-native';

const PROFILES_KEY = 'ag_remote_profiles_v1';
const ACTIVE_PROFILE_KEY = 'ag_remote_active_profile_v1';

let secureStoreModule = null;

async function getSecureStore() {
  if (!secureStoreModule) {
    secureStoreModule = await import('expo-secure-store');
  }
  return secureStoreModule;
}

async function setItem(key, value) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
    return;
  }
  const store = await getSecureStore();
  await store.setItemAsync(key, value);
}

async function getItem(key) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return null;
  }
  const store = await getSecureStore();
  return store.getItemAsync(key);
}

export async function getProfiles() {
  try {
    const raw = await getItem(PROFILES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveProfile(profile) {
  const list = await getProfiles();
  const existingIdx = list.findIndex((p) => p.id === profile.id);
  if (existingIdx >= 0) {
    list[existingIdx] = profile;
  } else {
    list.push(profile);
  }
  await setItem(PROFILES_KEY, JSON.stringify(list));
}

export async function deleteProfile(id) {
  const list = await getProfiles();
  const filtered = list.filter((p) => p.id !== id);
  await setItem(PROFILES_KEY, JSON.stringify(filtered));
  const activeId = await getItem(ACTIVE_PROFILE_KEY);
  if (activeId === id) {
    await setItem(ACTIVE_PROFILE_KEY, '');
  }
}

export async function getActiveProfileId() {
  return getItem(ACTIVE_PROFILE_KEY);
}

export async function setActiveProfileId(id) {
  await setItem(ACTIVE_PROFILE_KEY, id);
}

export async function getActiveProfile() {
  const list = await getProfiles();
  if (list.length === 0) {
    return null;
  }
  const activeId = await getActiveProfileId();
  if (activeId) {
    const found = list.find((p) => p.id === activeId);
    if (found) {
      return found;
    }
  }
  return list[0];
}

const QUIET_HOURS_KEY = 'ag_remote_quiet_hours_v1';

export async function getQuietHoursSettings() {
  try {
    const raw = await getItem(QUIET_HOURS_KEY);
    if (!raw) {
      return { enabled: false, startHour: 23, endHour: 7 };
    }
    return JSON.parse(raw);
  } catch {
    return { enabled: false, startHour: 23, endHour: 7 };
  }
}

export async function saveQuietHoursSettings(settings) {
  await setItem(QUIET_HOURS_KEY, JSON.stringify(settings));
}

const CHAT_FONT_SIZE_KEY = 'ag_remote_chat_font_size_v1';

export async function getChatFontSize() {
  try {
    const raw = await getItem(CHAT_FONT_SIZE_KEY);
    return raw || 'medium';
  } catch {
    return 'medium';
  }
}

export async function saveChatFontSize(size) {
  await setItem(CHAT_FONT_SIZE_KEY, size);
}

const SESSIONS_CACHE_PREFIX = 'ag_remote_cached_sessions_';
const MESSAGES_CACHE_PREFIX = 'ag_remote_cached_msgs_';

export async function getCachedSessions(profileId) {
  try {
    const key = `${SESSIONS_CACHE_PREFIX}${profileId || 'default'}`;
    const raw = await getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCachedSessions(sessions, profileId) {
  try {
    if (!Array.isArray(sessions)) return;
    const key = `${SESSIONS_CACHE_PREFIX}${profileId || 'default'}`;
    await setItem(key, JSON.stringify(sessions));
  } catch {}
}

export async function getCachedMessages(sessionId) {
  try {
    if (!sessionId) return [];
    const key = `${MESSAGES_CACHE_PREFIX}${sessionId}`;
    const raw = await getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCachedMessages(sessionId, messages) {
  try {
    if (!sessionId || !Array.isArray(messages)) return;
    const key = `${MESSAGES_CACHE_PREFIX}${sessionId}`;
    const slice = messages.slice(-100);
    await setItem(key, JSON.stringify(slice));
  } catch {}
}

const E2E_IDENTITY_KEY = 'ag_remote_e2e_identity_v1';
const RELAY_PROFILES_PREFIX = 'ag_remote_relay_profile_';

export async function getStoredE2EIdentity() {
  try {
    const raw = await getItem(E2E_IDENTITY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveStoredE2EIdentity(exportedIdentity) {
  try {
    await setItem(E2E_IDENTITY_KEY, JSON.stringify(exportedIdentity));
  } catch {}
}

export async function getRelayProfile(profileId) {
  try {
    const raw = await getItem(`${RELAY_PROFILES_PREFIX}${profileId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveRelayProfile(profileId, relayData) {
  try {
    await setItem(`${RELAY_PROFILES_PREFIX}${profileId}`, JSON.stringify(relayData));
  } catch {}
}

const TERMINAL_HISTORY_KEY = 'ag_remote_terminal_history_v1';

export async function getTerminalHistory() {
  try {
    const raw = await getItem(TERMINAL_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTerminalHistory(history) {
  try {
    const slice = Array.isArray(history) ? history.slice(-25) : [];
    await setItem(TERMINAL_HISTORY_KEY, JSON.stringify(slice));
  } catch {}
}



