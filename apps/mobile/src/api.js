import {
  HealthResponseSchema,
  AgentStateSchema,
  ChatMessageSchema,
  SessionSummarySchema,
  UploadResponseSchema,
  AppVersionInfoSchema,
  WindowsResponseSchema
} from '@ag-remote/shared';
import { z } from 'zod';

const _inflightCache = new Map();
const DEDUP_WINDOW_MS = 350;

function dedupRequest(key, fn) {
  const cached = _inflightCache.get(key);
  if (cached && Date.now() - cached.ts < DEDUP_WINDOW_MS) {
    return cached.promise;
  }
  const promise = fn().finally(() => {
    const entry = _inflightCache.get(key);
    if (entry && entry.promise === promise) {
      _inflightCache.delete(key);
    }
  });
  _inflightCache.set(key, { promise, ts: Date.now() });
  return promise;
}

export async function checkHealth(baseUrl, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/health`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { reachable: false, latencyMs: 0 };
    }
    const data = await res.json();
    const parsed = HealthResponseSchema.safeParse(data);
    return {
      reachable: parsed.success,
      health: parsed.success ? parsed.data : null,
      latencyMs: Date.now() - start
    };
  } catch {
    clearTimeout(timer);
    return { reachable: false, latencyMs: 0 };
  }
}

export async function probeAllProfiles(profiles) {
  const results = await Promise.all(
    profiles.map(async (profile) => {
      const result = await checkHealth(profile.baseUrl);
      return { profile, ...result };
    })
  );
  return results;
}

export async function fetchWindows(profile) {
  const res = await authenticatedRequest(profile, '/v1/windows', 'GET');
  const parsed = WindowsResponseSchema.safeParse(res);
  if (!parsed.success) {
    return { windows: [], selectedId: null, hostName: '' };
  }
  return parsed.data;
}

export async function selectWindow(profile, windowId) {
  return authenticatedRequest(profile, '/v1/windows/select', 'POST', { windowId });
}

export function fetchState(profile, windowId) {
  if (!profile?.baseUrl) return Promise.reject(new Error('No profile'));
  const key = `state:${profile.baseUrl}:${windowId || ''}`;
  return dedupRequest(key, async () => {
    const path = windowId ? `/v1/state?windowId=${encodeURIComponent(windowId)}` : '/v1/state';
    const res = await authenticatedRequest(profile, path, 'GET');
    const parsed = AgentStateSchema.safeParse(res);
    if (!parsed.success) {
      throw new Error('Invalid state response from bridge');
    }
    return parsed.data;
  });
}

export async function fetchSessions(profile, windowId) {
  const path = windowId ? `/v1/sessions?windowId=${encodeURIComponent(windowId)}` : '/v1/sessions';
  const res = await authenticatedRequest(profile, path, 'GET');
  const schema = z.array(SessionSummarySchema);
  const parsed = schema.safeParse(res);
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
}

export async function createSession(profile, text, modelId, windowId) {
  const body = {};
  if (text !== undefined) body.text = text;
  if (modelId) body.modelId = modelId;
  if (windowId) body.windowId = windowId;
  return authenticatedRequest(profile, '/v1/sessions', 'POST', body);
}

export async function focusSession(profile, sessionId, windowId) {
  const body = windowId ? { windowId } : undefined;
  return authenticatedRequest(profile, `/v1/sessions/${encodeURIComponent(sessionId)}/focus`, 'POST', body);
}

export function fetchMessages(profile, limit = 50, sessionId, windowId) {
  if (!profile?.baseUrl) return Promise.reject(new Error('No profile'));
  const key = `messages:${profile.baseUrl}:${sessionId || ''}:${windowId || ''}:${limit}`;
  return dedupRequest(key, async () => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    if (windowId) params.set('windowId', windowId);

    const path = sessionId
      ? `/v1/sessions/${encodeURIComponent(sessionId)}/messages?${params.toString()}`
      : `/v1/messages?${params.toString()}`;
    const res = await authenticatedRequest(profile, path, 'GET');
    const schema = z.array(ChatMessageSchema);
    const parsed = schema.safeParse(res);
    if (!parsed.success) {
      return [];
    }
    return parsed.data;
  });
}

export async function sendPrompt(profile, text, sessionId, modelId, windowId) {
  const body = { text };
  if (modelId) body.modelId = modelId;
  if (windowId) body.windowId = windowId;
  if (sessionId) {
    return authenticatedRequest(profile, `/v1/sessions/${encodeURIComponent(sessionId)}/prompt`, 'POST', body);
  }
  return authenticatedRequest(profile, '/v1/prompt', 'POST', body);
}

export async function fetchModels(profile, sessionId, windowId) {
  const params = new URLSearchParams();
  if (sessionId) params.set('sessionId', sessionId);
  if (windowId) params.set('windowId', windowId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const path = `/v1/models${qs}`;
  return authenticatedRequest(profile, path, 'GET');
}

export async function selectModel(profile, modelId, sessionId, windowId) {
  return authenticatedRequest(profile, '/v1/models/select', 'POST', { modelId, sessionId, windowId });
}

export async function sendApprove(profile, requestId, scope, option, response, windowId) {
  const body = { requestId };
  if (scope) body.scope = scope;
  if (option) body.option = option;
  if (response !== undefined) body.response = response;
  if (windowId) body.windowId = windowId;
  return authenticatedRequest(profile, '/v1/approve', 'POST', body);
}

export async function sendReject(profile, requestId, reason, windowId) {
  const body = { requestId };
  if (reason) body.reason = reason;
  if (windowId) body.windowId = windowId;
  return authenticatedRequest(profile, '/v1/reject', 'POST', body);
}

export async function sendStop(profile, sessionId, windowId) {
  const params = new URLSearchParams();
  if (sessionId) params.set('sessionId', sessionId);
  if (windowId) params.set('windowId', windowId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const path = `/v1/stop${qs}`;
  return authenticatedRequest(profile, path, 'POST');
}

export async function fetchSettings(profile) {
  return authenticatedRequest(profile, '/v1/settings', 'GET');
}

export async function updateSettings(profile, settings) {
  return authenticatedRequest(profile, '/v1/settings', 'POST', settings);
}

export async function sendTestNotification(profile) {
  return authenticatedRequest(profile, '/v1/push/test', 'POST');
}

export async function uploadFile(profile, asset) {
  if (!profile || !profile.baseUrl || !profile.token) {
    throw new Error('Profile missing or incomplete');
  }

  const fileRes = await fetch(asset.uri);
  const blob = await fileRes.blob();
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        const commaIdx = res.indexOf(',');
        resolve(commaIdx !== -1 ? res.slice(commaIdx + 1) : res);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

  const payload = {
    filename: asset.name || 'upload',
    mimeType: asset.mimeType || 'application/octet-stream',
    dataBase64
  };

  const uploadRes = await authenticatedRequest(profile, '/v1/upload', 'POST', payload);
  const parsed = UploadResponseSchema.safeParse(uploadRes);
  if (!parsed.success) {
    throw new Error('Invalid upload response from bridge');
  }
  return parsed.data;
}

async function authenticatedRequest(profile, pathname, method, body = null, timeoutMs = 15000) {
  if (!profile) {
    throw new Error('Profile missing or incomplete');
  }

  if (profile.transport === 'relay' && profile._relayLink && profile._relayLink.status === 'ready') {
    return profile._relayLink.request(pathname, method, body, timeoutMs);
  }

  if (!profile.baseUrl || !profile.token) {
    if (profile._relayLink && profile._relayLink.status === 'ready') {
      return profile._relayLink.request(pathname, method, body, timeoutMs);
    }
    throw new Error('Profile missing or incomplete');
  }

  const url = `${profile.baseUrl.replace(/\/+$/, '')}${pathname}`;
  const headers = {
    'Authorization': `Bearer ${profile.token}`
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    if (!res.ok) {
      let errMessage = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.message) {
          errMessage = errJson.message;
        }
      } catch {}
      throw new Error(errMessage);
    }

    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please check your network connection.');
    }
    if (profile._relayLink && profile._relayLink.status === 'ready') {
      return profile._relayLink.request(pathname, method, body, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkAppVersion(baseUrl, token, clientVersion, clientBuildId) {
  try {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const query = [];
    if (clientVersion) query.push(`clientVersion=${encodeURIComponent(clientVersion)}`);
    if (clientBuildId) query.push(`clientBuildId=${encodeURIComponent(clientBuildId)}`);
    const qs = query.length > 0 ? `?${query.join('&')}` : '';

    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${cleanBase}/v1/version${qs}`, {
      method: 'GET',
      headers
    });
    if (!res.ok) return null;
    const json = await res.json();
    const parsed = AppVersionInfoSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function fetchTerminalAllowlist(profile) {
  return authenticatedRequest(profile, '/v1/terminal/allowlist', 'GET');
}

export async function execTerminal(profile, payload) {
  return authenticatedRequest(profile, '/v1/terminal/exec', 'POST', payload, 35000);
}

export async function killTerminal(profile, payload = {}) {
  return authenticatedRequest(profile, '/v1/terminal/kill', 'POST', payload);
}

export async function fetchFsRoots(profile) {
  return authenticatedRequest(profile, '/v1/fs/roots', 'GET');
}

export async function fetchFsList(profile, dirPath) {
  const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : '';
  return authenticatedRequest(profile, `/v1/fs/list${query}`, 'GET');
}

export async function fetchFsRead(profile, filePath) {
  const query = `?path=${encodeURIComponent(filePath)}`;
  return authenticatedRequest(profile, `/v1/fs/read${query}`, 'GET');
}

export async function openFsFolder(profile, payload) {
  return authenticatedRequest(profile, '/v1/fs/open', 'POST', payload);
}


