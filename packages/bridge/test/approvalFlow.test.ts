import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { BridgeServer } from '../src/server.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { TokenManager, FileSecretStore } from '../src/auth.js';

describe('Phase 3 Approvals Flow', () => {
  const tokenFile = path.join(os.tmpdir(), `approval-test-token-${Date.now()}.json`);
  let server: BridgeServer;
  let adapter: FakeAdapter;
  let tokenManager: TokenManager;
  let validToken: string;
  const port = 49155;
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

  it('serves the mobile web approval app at /app without token requirement', async () => {
    const res = await api('GET', '/app');
    expect(res.status).toBe(200);
    expect(typeof res.data).toBe('string');
    expect(res.data).toContain('<title>AG Remote</title>');
    expect(res.data).toContain('id="approvalCard"');
    expect(res.data).toContain('id="approveBtn"');
  });

  it('exercises full terminal command approval loop over API', async () => {
    adapter.simulateApprovalRequest('req-term-123', 'terminal', 'Execute: pnpm install');

    const state = await api('GET', '/v1/state', validToken);
    expect(state.status).toBe(200);
    expect(state.data.status).toBe('awaiting_approval');
    expect(state.data.pendingApproval?.requestId).toBe('req-term-123');
    expect(state.data.pendingApproval?.kind).toBe('terminal');
    expect(state.data.pendingApproval?.summary).toBe('Execute: pnpm install');

    const staleRes = await api('POST', '/v1/approve', validToken, { requestId: 'stale-id' });
    expect(staleRes.status).toBe(409);
    expect(staleRes.data.code).toBe('STALE_REQUEST');

    const approveRes = await api('POST', '/v1/approve', validToken, { requestId: 'req-term-123' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.ok).toBe(true);

    const postState = await api('GET', '/v1/state', validToken);
    expect(postState.data.pendingApproval).toBeNull();
    expect(postState.data.status).toBe('generating');
  });

  it('exercises full rejection loop over API', async () => {
    adapter.simulateApprovalRequest('req-term-456', 'edit', 'Modify package.json');

    const rejectRes = await api('POST', '/v1/reject', validToken, { requestId: 'req-term-456' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.data.ok).toBe(true);

    const postState = await api('GET', '/v1/state', validToken);
    expect(postState.data.pendingApproval).toBeNull();
    expect(postState.data.status).toBe('idle');
  });
});

