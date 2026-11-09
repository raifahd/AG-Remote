import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { NtfyNotifier } from '../src/notifier.js';
import { FileSecretStore } from '../src/auth.js';

describe('NtfyNotifier', () => {
  const tokenFile = path.join(os.tmpdir(), `notifier-test-token-${Date.now()}.json`);
  let mockServer: http.Server;
  let receivedRequests: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  const mockPort = 49152;

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        receivedRequests.push({ headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'test-id', event: 'message' }));
      });
    });

    await new Promise<void>((resolve) => mockServer.listen(mockPort, '127.0.0.1', () => resolve()));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    if (fs.existsSync(tokenFile)) {
      fs.unlinkSync(tokenFile);
    }
  });

  it('generates, persists, and reuses random ntfy topic', async () => {
    const store = new FileSecretStore(tokenFile);
    const notifier = new NtfyNotifier(store, { serverUrl: `http://127.0.0.1:${mockPort}` });

    const topic1 = await notifier.getOrCreateTopic();
    expect(topic1.startsWith('agremote_')).toBe(true);
    expect(topic1.length).toBeGreaterThan(20);

    const topic2 = await notifier.getOrCreateTopic();
    expect(topic2).toBe(topic1);
  });

  it('delivers run_finished notification with correct headers and payload', async () => {
    receivedRequests = [];
    const store = new FileSecretStore(tokenFile);
    const notifier = new NtfyNotifier(store, {
      serverUrl: `http://127.0.0.1:${mockPort}`,
      tailscaleIp: '100.69.62.84',
      hostLabel: 'laptop-deb'
    });

    const success = await notifier.notifyRunFinished('sess-1234567890');
    expect(success).toBe(true);
    expect(receivedRequests).toHaveLength(1);

    const req = receivedRequests[0];
    expect(req?.headers['title']).toBe('[laptop-deb] Run Finished');
    expect(req?.headers['click']).toBe('http://100.69.62.84:48123/app');
    expect(req?.headers['priority']).toBe('3');
    expect(req?.body).toContain('sess-1234');
  });

  it('delivers high-priority approval notification without sensitive full commands', async () => {
    receivedRequests = [];
    const store = new FileSecretStore(tokenFile);
    const notifier = new NtfyNotifier(store, {
      serverUrl: `http://127.0.0.1:${mockPort}`,
      tailscaleIp: '100.69.62.84',
      hostLabel: 'laptop-deb'
    });

    const success = await notifier.notifyApprovalRequested('terminal', 'Execute rm -rf /tmp/test');
    expect(success).toBe(true);
    expect(receivedRequests).toHaveLength(1);

    const req = receivedRequests[0];
    expect(req?.headers['title']).toBe('[laptop-deb] Approval Required (terminal)');
    expect(req?.headers['priority']).toBe('4');
  });

  it('suppresses run_finished during quiet hours while allowing approval notifications', async () => {
    receivedRequests = [];
    const store = new FileSecretStore(tokenFile);
    const notifier = new NtfyNotifier(store, {
      serverUrl: `http://127.0.0.1:${mockPort}`,
      quietHoursEnabled: true,
      quietHoursStart: 0,
      quietHoursEnd: 24
    });

    const runResult = await notifier.notifyRunFinished('sess-abc');
    expect(runResult).toBe(false);
    expect(receivedRequests).toHaveLength(0);

    const appResult = await notifier.notifyApprovalRequested('edit', 'Edit file');
    expect(appResult).toBe(true);
    expect(receivedRequests).toHaveLength(1);
  });

  it('gets and updates quiet hours configuration', () => {
    const store = new FileSecretStore(tokenFile);
    const notifier = new NtfyNotifier(store, {
      quietHoursEnabled: false,
      quietHoursStart: 23,
      quietHoursEnd: 7
    });

    expect(notifier.getQuietHours()).toEqual({
      enabled: false,
      startHour: 23,
      endHour: 7
    });

    notifier.setQuietHours(true, 21, 6);
    expect(notifier.getQuietHours()).toEqual({
      enabled: true,
      startHour: 21,
      endHour: 6
    });
  });
});

