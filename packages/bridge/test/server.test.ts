import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { BridgeServer } from '../src/server.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { TokenManager, FileSecretStore, RateLimiter } from '../src/auth.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

describe('BridgeServer integration', () => {
  const tokenFile = path.join(os.tmpdir(), `server-test-token-${Date.now()}.json`);
  let server: BridgeServer;
  let adapter: FakeAdapter;
  let tokenManager: TokenManager;
  let validToken: string;
  const port = 49151;
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
      tokenManager,
      new RateLimiter(3, 10_000)
    );

    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(tokenFile)) {
      fs.unlinkSync(tokenFile);
    }
  });

  async function request(
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

      const req = http.request(
        `${baseUrl}${pathname}`,
        { method, headers },
        (res) => {
          let chunks = '';
          res.on('data', (d) => (chunks += d));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode ?? 0, data: JSON.parse(chunks) });
            } catch {
              resolve({ status: res.statusCode ?? 0, data: chunks });
            }
          });
        }
      );
      req.on('error', reject);
      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  it('responds to GET /health without auth', async () => {
    const res = await request('GET', '/health');
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
    expect(res.data.adapterMode).toBe('fake');
    expect(res.data.version).toBe('0.1.0');
  });

  it('rejects GET /v1/state without auth', async () => {
    const res = await request('GET', '/v1/state');
    expect(res.status).toBe(401);
    expect(res.data.code).toBe('UNAUTHORIZED');
  });

  it('rejects GET /v1/state with invalid auth', async () => {
    const res = await request('GET', '/v1/state', 'invalid-token-1234');
    expect(res.status).toBe(401);
    expect(res.data.code).toBe('UNAUTHORIZED');
  });

  it('accepts GET /v1/state with valid auth', async () => {
    const res = await request('GET', '/v1/state', validToken);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('idle');
    expect(Array.isArray(res.data.sessions)).toBe(true);
  });

  it('rejects POST /v1/prompt with unknown fields or missing fields', async () => {
    const res = await request('POST', '/v1/prompt', validToken, { invalidKey: 'abc' });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe('INVALID_BODY');
  });

  it('accepts POST /v1/prompt with valid body', async () => {
    const res = await request('POST', '/v1/prompt', validToken, { text: 'Test prompt' });
    expect(res.status).toBe(200);
    expect(res.data.ok).toBe(true);

    const state = await request('GET', '/v1/state', validToken);
    expect(state.data.status).toBe('generating');
  });

  it('handles approvals and stale request detection', async () => {
    const noApprovalRes = await request('POST', '/v1/approve', validToken, { requestId: 'req-xyz' });
    expect(noApprovalRes.status).toBe(409);
    expect(noApprovalRes.data.code).toBe('NO_PENDING_APPROVAL');

    adapter.simulateApprovalRequest('req-100', 'edit', 'Modify server.ts');

    const staleRes = await request('POST', '/v1/approve', validToken, { requestId: 'req-wrong' });
    expect(staleRes.status).toBe(409);
    expect(staleRes.data.code).toBe('STALE_REQUEST');

    const approveRes = await request('POST', '/v1/approve', validToken, { requestId: 'req-100' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.ok).toBe(true);
  });

  it('gets and updates quiet hours settings at /v1/settings', async () => {
    const getRes = await request('GET', '/v1/settings', validToken);
    expect(getRes.status).toBe(200);
    expect(getRes.data.quietHours).toBeDefined();

    const postRes = await request('POST', '/v1/settings', validToken, {
      enabled: true,
      startHour: 22,
      endHour: 8
    });
    expect(postRes.status).toBe(200);
    expect(postRes.data.ok).toBe(true);
    expect(postRes.data.quietHours.enabled).toBe(true);
    expect(postRes.data.quietHours.startHour).toBe(22);
    expect(postRes.data.quietHours.endHour).toBe(8);

    const invalidRes = await request('POST', '/v1/settings', validToken, {
      enabled: true,
      startHour: 99
    });
    expect(invalidRes.status).toBe(400);
    expect(invalidRes.data.code).toBe('INVALID_BODY');
  });
});

