import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { BridgeServer } from '../src/server.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { TokenManager, FileSecretStore } from '../src/auth.js';

describe('Phase 4 Messages and Prompting Flow', () => {
  const tokenFile = path.join(os.tmpdir(), `msg-flow-test-token-${Date.now()}.json`);
  let server: BridgeServer;
  let adapter: FakeAdapter;
  let tokenManager: TokenManager;
  let validToken: string;
  const port = 49156;
  const host = '127.0.0.1';
  const baseUrl = `http://${host}:${port}`;

  beforeAll(async () => {
    adapter = new FakeAdapter();
    tokenManager = new TokenManager(new FileSecretStore(tokenFile));
    validToken = await tokenManager.getOrCreateToken();

    server = new BridgeServer(
      {
        port,
        host,
        version: '0.1.0',
        adapterMode: 'fake'
      },
      adapter,
      tokenManager
    );

    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(tokenFile)) {
      fs.unlinkSync(tokenFile);
    }
  });

  async function api(
    method: string,
    pathname: string,
    token?: string,
    body?: unknown
  ): Promise<{ status: number; data: any }> {
    return new Promise((resolve, reject) => {
      const payload = body ? JSON.stringify(body) : undefined;
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      if (payload) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(Buffer.byteLength(payload));
      }

      const req = http.request(`${baseUrl}${pathname}`, { method, headers }, (res) => {
        let chunks = '';
        res.on('data', (d) => (chunks += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(chunks) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: chunks });
          }
        });
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  it('delivers prompt and returns updated chat messages list', async () => {
    const promptRes = await api('POST', '/v1/prompt', validToken, { text: 'Analyze test coverage' });
    expect(promptRes.status).toBe(200);
    expect(promptRes.data.ok).toBe(true);

    const state = await api('GET', '/v1/state', validToken);
    expect(state.data.status).toBe('generating');

    const msgRes = await api('GET', '/v1/messages?limit=10', validToken);
    expect(msgRes.status).toBe(200);
    expect(Array.isArray(msgRes.data)).toBe(true);
    expect(msgRes.data.length).toBeGreaterThan(0);
    expect(msgRes.data[0]?.text).toBe('Analyze test coverage');
    expect(msgRes.data[0]?.role).toBe('user');
  });

  it('stops running generation immediately', async () => {
    const stopRes = await api('POST', '/v1/stop', validToken);
    expect(stopRes.status).toBe(200);
    expect(stopRes.data.ok).toBe(true);

    const state = await api('GET', '/v1/state', validToken);
    expect(state.data.status).toBe('idle');
  });

  it('executes full loop: prompt -> generating -> approval -> approve -> finished', async () => {
    await api('POST', '/v1/prompt', validToken, { text: 'Build production bundle' });
    let state = await api('GET', '/v1/state', validToken);
    expect(state.data.status).toBe('generating');

    adapter.simulateApprovalRequest('req-step-888', 'terminal', 'Execute pnpm build');
    state = await api('GET', '/v1/state', validToken);
    expect(state.data.status).toBe('awaiting_approval');

    const approveRes = await api('POST', '/v1/approve', validToken, { requestId: 'req-step-888' });
    expect(approveRes.status).toBe(200);

    adapter.simulateRunFinished();
    state = await api('GET', '/v1/state', validToken);
    expect(state.data.status).toBe('idle');
  });
});

