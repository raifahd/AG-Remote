import {
  HealthResponseSchema,
  AgentStateSchema,
  ChatMessageSchema
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

export async function fetchMessages(profile, limit = 50) {
  const res = await authenticatedRequest(profile, `/v1/messages?limit=${limit}`, 'GET');
  const schema = z.array(ChatMessageSchema);
  const parsed = schema.safeParse(res);
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
}

export async function sendPrompt(profile, text) {
  return authenticatedRequest(profile, '/v1/prompt', 'POST', { text });
}

export async function sendApprove(profile, requestId) {
  return authenticatedRequest(profile, '/v1/approve', 'POST', { requestId });
}

export async function sendReject(profile, requestId) {
  return authenticatedRequest(profile, '/v1/reject', 'POST', { requestId });
}

export async function sendStop(profile) {
  return authenticatedRequest(profile, '/v1/stop', 'POST');
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

async function authenticatedRequest(profile, pathname, method, body = null) {
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

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
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

  return res.json();
}

