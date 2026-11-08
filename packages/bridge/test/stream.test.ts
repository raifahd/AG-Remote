import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocket } from 'ws';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { BridgeServer } from '../src/server.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { TokenManager, FileSecretStore } from '../src/auth.js';
import { AgentEvent } from '@ag-remote/shared';

describe('WebSocket /v1/stream live events', () => {
  const tokenFile = path.join(os.tmpdir(), `stream-test-token-${Date.now()}.json`);
  let server: BridgeServer;
  let adapter: FakeAdapter;
  let tokenManager: TokenManager;
  let validToken: string;
  const port = 49154;
  const host = '127.0.0.1';

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

  it('rejects connection without valid token', async () => {
    const ws = new WebSocket(`ws://${host}:${port}/v1/stream`);
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    expect(closeCode).toBe(1008);
  });

  it('streams live events to authenticated client', async () => {
    const ws = new WebSocket(`ws://${host}:${port}/v1/stream?token=${validToken}`);
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    const receivedEvents: AgentEvent[] = [];
    ws.on('message', (data) => {
      receivedEvents.push(JSON.parse(data.toString()));
    });

    adapter.simulateApprovalRequest('req-999', 'tool', 'Approve browser navigation');

    await new Promise((r) => setTimeout(r, 100));

    expect(receivedEvents.some((e) => e.type === 'approval_requested')).toBe(true);

    adapter.simulateRunFinished();
    await new Promise((r) => setTimeout(r, 100));

    expect(receivedEvents.some((e) => e.type === 'run_finished')).toBe(true);

    ws.close();
  });
});

