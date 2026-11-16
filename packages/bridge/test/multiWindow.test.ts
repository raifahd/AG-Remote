import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { WindowRegistry } from '../src/core/window-registry.js';
import { MultiWindowManager } from '../src/core/multiWindowManager.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { BridgeServer } from '../src/server.js';
import { TokenManager, PairingManager, MemorySecretStore } from '../src/auth.js';
import type { AgentEvent } from '@ag-remote/shared';

describe('Multi-Window Hub: WindowRegistry', () => {
  it('registers windows and defaults selected to first registered', () => {
    const registry = new WindowRegistry();
    registry.register({
      windowId: 'win-1',
      workspacePath: '/path/one',
      workspaceName: 'ProjectOne',
      pid: 1001
    });

    expect(registry.getSelectedId()).toBe('win-1');
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('win-1')?.workspaceName).toBe('ProjectOne');

    registry.register({
      windowId: 'win-2',
      workspacePath: '/path/two',
      workspaceName: 'ProjectTwo',
      pid: 1002
    });

    expect(registry.getSelectedId()).toBe('win-1');
    expect(registry.getAll()).toHaveLength(2);
  });

  it('selects active window and updates focused timestamp', () => {
    const registry = new WindowRegistry();
    registry.register({
      windowId: 'win-1',
      workspacePath: '/path/one',
      workspaceName: 'ProjectOne'
    });
    registry.register({
      windowId: 'win-2',
      workspacePath: '/path/two',
      workspaceName: 'ProjectTwo'
    });

    const selected = registry.select('win-2');
    expect(selected?.windowId).toBe('win-2');
    expect(registry.getSelectedId()).toBe('win-2');
  });

  it('updates heartbeats and prunes stale windows after threshold', () => {
    vi.useFakeTimers();
    try {
      const registry = new WindowRegistry();
      registry.register({
        windowId: 'win-active',
        workspacePath: '/path/active',
        workspaceName: 'Active'
      });
      registry.register({
        windowId: 'win-stale',
        workspacePath: '/path/stale',
        workspaceName: 'Stale'
      });

      vi.advanceTimersByTime(5000);
      registry.heartbeat('win-active');

      vi.advanceTimersByTime(4000);
      const pruned = registry.pruneStale(8000);

      expect(pruned).toContain('win-stale');
      expect(pruned).not.toContain('win-active');
      expect(registry.get('win-stale')).toBeNull();
      expect(registry.get('win-active')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-assigns selected window when selected window unregisters', () => {
    const registry = new WindowRegistry();
    registry.register({
      windowId: 'win-1',
      workspacePath: '/path/one',
      workspaceName: 'ProjectOne'
    });
    registry.register({
      windowId: 'win-2',
      workspacePath: '/path/two',
      workspaceName: 'ProjectTwo'
    });

    registry.select('win-1');
    registry.unregister('win-1');

    expect(registry.getSelectedId()).toBe('win-2');
    registry.unregister('win-2');
    expect(registry.getSelectedId()).toBeNull();
  });
});

describe('Multi-Window Hub: MultiWindowManager', () => {
  it('manages channels and multiplexes events tagged with windowId', () => {
    const registry = new WindowRegistry();
    const hostAdapter = new FakeAdapter();
    const workerAdapter = new FakeAdapter();

    const manager = new MultiWindowManager({
      hostWindowId: 'win-host',
      hostAdapter,
      createAdapter: (_path, _pid) => workerAdapter,
      registry
    });

    registry.register({
      windowId: 'win-host',
      workspacePath: '/host',
      workspaceName: 'Host'
    });
    registry.register({
      windowId: 'win-worker',
      workspacePath: '/worker',
      workspaceName: 'Worker'
    });

    expect(manager.getAdapter('win-host')).toBe(hostAdapter);
    expect(manager.getAdapter('win-worker')).toBe(workerAdapter);

    const receivedEvents: AgentEvent[] = [];
    manager.on('event', (ev) => receivedEvents.push(ev));

    hostAdapter.emitEvent({
      type: 'run_finished',
      sessionId: 'sess-host',
      sessionTitle: 'Host Session',
      at: Date.now()
    });

    workerAdapter.emitEvent({
      type: 'run_finished',
      sessionId: 'sess-worker',
      sessionTitle: 'Worker Session',
      at: Date.now()
    });

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0]?.windowId).toBe('win-host');
    expect(receivedEvents[1]?.windowId).toBe('win-worker');

    manager.dispose();
  });
});

describe('Multi-Window Hub: BridgeServer API Endpoints', () => {
  it('exposes window management and loopback hub registration', async () => {
    const secretStore = new MemorySecretStore();
    const tokenManager = new TokenManager(secretStore);
    await tokenManager.storeToken('secret-token');

    const hostAdapter = new FakeAdapter();
    const server = new BridgeServer(
      {
        port: 0,
        host: '127.0.0.1',
        version: '0.1.0',
        adapterMode: 'fake',
        workspacePath: '/test/host-app',
        workspaceName: 'host-app'
      },
      hostAdapter,
      tokenManager,
      undefined,
      undefined,
      new PairingManager()
    );

    const app = server.getApp();

    const listRes = await request(app)
      .get('/v1/windows')
      .set('Authorization', 'Bearer secret-token');

    expect(listRes.status).toBe(200);
    expect(listRes.body.windows).toHaveLength(1);
    expect(listRes.body.windows[0].workspaceName).toBe('host-app');

    const regRes = await request(app)
      .post('/api/hub/register')
      .send({
        windowId: 'worker-win-99',
        workspacePath: '/test/worker-app',
        workspaceName: 'worker-app',
        pid: 9999
      });

    expect(regRes.status).toBe(200);
    expect(regRes.body.ok).toBe(true);

    const beatRes = await request(app)
      .post('/api/hub/heartbeat')
      .send({ windowId: 'worker-win-99' });

    expect(beatRes.status).toBe(200);
    expect(beatRes.body.ok).toBe(true);

    const updatedListRes = await request(app)
      .get('/v1/windows')
      .set('Authorization', 'Bearer secret-token');

    expect(updatedListRes.body.windows).toHaveLength(2);

    const selectRes = await request(app)
      .post('/v1/windows/select')
      .set('Authorization', 'Bearer secret-token')
      .send({ windowId: 'worker-win-99' });

    expect(selectRes.status).toBe(200);
    expect(selectRes.body.selectedId).toBe('worker-win-99');
  });
});
