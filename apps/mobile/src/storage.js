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

