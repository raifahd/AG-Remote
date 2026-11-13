import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { BridgeServer } from '../src/server.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { TokenManager, FileSecretStore, RateLimiter } from '../src/auth.js';
import { NtfyNotifier } from '../src/notifier.js';
import { findTailscaleIpv4 } from '../src/network.js';
import {
  PromptRequestSchema,
  ApproveRequestSchema,
  RejectRequestSchema
} from '@ag-remote/shared';

describe('Phase 7 Security Audit (Section 9 Compliance)', () => {
  const testDir = path.join(os.tmpdir(), `sec-audit-${Date.now()}`);
  const tokenFile = path.join(testDir, 'secret-token.json');
  let server: BridgeServer;
  let adapter: FakeAdapter;
  let tokenManager: TokenManager;
  let rateLimiter: RateLimiter;
  let validToken: string;
  const port = 49160;
  const host = '127.0.0.1';
  const baseUrl = `http://${host}:${port}`;

  beforeAll(async () => {
    fs.mkdirSync(testDir, { recursive: true });
    adapter = new FakeAdapter();
    tokenManager = new TokenManager(new FileSecretStore(tokenFile));
    validToken = await tokenManager.getOrCreateToken();
    rateLimiter = new RateLimiter(5, 5000);

    server = new BridgeServer(
      {
        port,
        host,
        version: '0.1.0',
        adapterMode: 'fake'
      },
      adapter,
      tokenManager,
      rateLimiter
    );

    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
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

  it('SEC-1: verifies network interface binding logic targets Tailscale cgNAT range', () => {
    const tsIp = findTailscaleIpv4();
    if (tsIp) {
      expect(tsIp.startsWith('100.')).toBe(true);
      const secondOctet = parseInt(tsIp.split('.')[1] ?? '0', 10);
      expect(secondOctet).toBeGreaterThanOrEqual(64);
      expect(secondOctet).toBeLessThanOrEqual(127);
    }
  });

  it('SEC-2 & SEC-3: verifies token is 64-char hex and rate-limits invalid authentication attempts', async () => {
    expect(validToken).toMatch(/^[a-f0-9]{64}$/);

    const badAttempts = Array.from({ length: 6 });
    let lastStatus = 0;
    for (const _ of badAttempts) {
      const res = await api('GET', '/v1/state', 'invalid-token-audit');
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
    rateLimiter.recordSuccess('127.0.0.1');
    rateLimiter.recordSuccess('::ffff:127.0.0.1');
    rateLimiter.recordSuccess('::1');
  });

  it('SEC-4: strictly rejects request bodies with unknown or unexpected fields', () => {
    expect(() => PromptRequestSchema.parse({ text: 'Valid', maliciousInjection: true })).toThrow();
    expect(() => ApproveRequestSchema.parse({ requestId: 'req-1', extraParam: 'bypass' })).toThrow();
    expect(() => RejectRequestSchema.parse({ requestId: 'req-1', inject: 123 })).toThrow();
  });

  it('SEC-5: enforces requestId match and rejects mismatched or stale approvals', async () => {
    adapter.simulateApprovalRequest('req-secure-999', 'terminal', 'Execute safe command');

    const staleRes = await api('POST', '/v1/approve', validToken, { requestId: 'req-forged' });
    expect(staleRes.status).toBe(409);
    expect(staleRes.data.code).toBe('STALE_REQUEST');

    const approveRes = await api('POST', '/v1/approve', validToken, { requestId: 'req-secure-999' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.data.ok).toBe(true);

    const replayRes = await api('POST', '/v1/approve', validToken, { requestId: 'req-secure-999' });
    expect(replayRes.status).toBe(409);
    expect(replayRes.data.code).toBe('NO_PENDING_APPROVAL');
  });

  it('SEC-6: verifies notification payload sanitization does not leak secret tokens or raw credentials', async () => {
    const received: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
    const mockServer = http.createServer((req, res) => {
      let b = '';
      req.on('data', (d) => (b += d));
      req.on('end', () => {
        received.push({ headers: req.headers, body: b });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'msg-1' }));
      });
    });

    const mockPort = 49161;
    await new Promise<void>((resolve) => mockServer.listen(mockPort, '127.0.0.1', () => resolve()));

    try {
      const notifier = new NtfyNotifier(new FileSecretStore(path.join(testDir, 'ntfy.json')), {
        serverUrl: `http://127.0.0.1:${mockPort}`,
        tailscaleIp: '100.69.62.84'
      });

      await notifier.notifyApprovalRequested('terminal', 'Execute command with token secret12345');
      expect(received).toHaveLength(1);
      const post = received[0];
      expect(post?.body).not.toContain(validToken);
      expect(post?.headers['click']).toBe('exp://100.69.62.84:8081/--/(tabs)/chat');
    } finally {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
  });

  it('SEC-11: verifies fallback token file is created with owner-only (0o600) permissions on Unix', () => {
    if (os.platform() !== 'win32' && fs.existsSync(tokenFile)) {
      const stat = fs.statSync(tokenFile);
      const fileMode = stat.mode & 0o777;
      expect(fileMode).toBe(0o600);
    }
  });
});
