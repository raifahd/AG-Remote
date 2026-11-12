import {
  HealthResponseSchema,
  AgentStateSchema,
  ChatMessageSchema,
  SessionSummarySchema,
  UploadResponseSchema
} from '@ag-remote/shared';
import { z } from 'zod';

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

export async function fetchState(profile) {
  const res = await authenticatedRequest(profile, '/v1/state', 'GET');
  const parsed = AgentStateSchema.safeParse(res);
  if (!parsed.success) {
    throw new Error('Invalid state response from bridge');
  }
  return parsed.data;
}

export async function fetchSessions(profile) {
  const res = await authenticatedRequest(profile, '/v1/sessions', 'GET');
  const schema = z.array(SessionSummarySchema);
  const parsed = schema.safeParse(res);
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
}

export async function createSession(profile, text, modelId) {
  const body = {};
  if (text !== undefined) body.text = text;
  if (modelId) body.modelId = modelId;
  return authenticatedRequest(profile, '/v1/sessions', 'POST', body);
}

export async function focusSession(profile, sessionId) {
  return authenticatedRequest(profile, `/v1/sessions/${encodeURIComponent(sessionId)}/focus`, 'POST');
}

export async function fetchMessages(profile, limit = 50, sessionId) {
  const path = sessionId
    ? `/v1/sessions/${encodeURIComponent(sessionId)}/messages?limit=${limit}`
    : `/v1/messages?limit=${limit}`;
  const res = await authenticatedRequest(profile, path, 'GET');
  const schema = z.array(ChatMessageSchema);
  const parsed = schema.safeParse(res);
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
}

export async function sendPrompt(profile, text, sessionId, modelId) {
  const body = { text };
  if (modelId) body.modelId = modelId;
  if (sessionId) {
    return authenticatedRequest(profile, `/v1/sessions/${encodeURIComponent(sessionId)}/prompt`, 'POST', body);
  }
  return authenticatedRequest(profile, '/v1/prompt', 'POST', body);
}

export async function fetchModels(profile, sessionId) {
  const path = sessionId ? `/v1/models?sessionId=${encodeURIComponent(sessionId)}` : '/v1/models';
  return authenticatedRequest(profile, path, 'GET');
}

export async function selectModel(profile, modelId, sessionId) {
  return authenticatedRequest(profile, '/v1/models/select', 'POST', { modelId, sessionId });
}

export async function sendApprove(profile, requestId) {
  return authenticatedRequest(profile, '/v1/approve', 'POST', { requestId });
}

export async function sendReject(profile, requestId) {
  return authenticatedRequest(profile, '/v1/reject', 'POST', { requestId });
}

export async function sendStop(profile, sessionId) {
  const path = sessionId ? `/v1/stop?sessionId=${encodeURIComponent(sessionId)}` : '/v1/stop';
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
  if (!profile || !profile.baseUrl || !profile.token) {
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
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

