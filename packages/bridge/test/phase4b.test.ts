import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AgentStateMachine } from '../src/stateMachine.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { SdkAdapter } from '../src/adapters/SdkAdapter.js';
import { BridgeServer } from '../src/server.js';
import { TokenManager, InMemorySecretStore } from '../src/auth.js';
import { NtfyNotifier } from '../src/notifier.js';

describe('Phase 4b: Conversation Browsing & Switching', () => {
  describe('Per-Conversation State Machine', () => {
    it('tracks per-conversation status and emits events with sessionId and title', async () => {
      vi.useFakeTimers();
      const sm = new AgentStateMachine({ debounceMs: 1000 });
      const events: any[] = [];
      sm.onEvent((e) => events.push(e));

      sm.onGenerating('sess-1', 'Session One');
      sm.onGenerating('sess-2', 'Session Two');

      expect(sm.getStatus('sess-1')).toBe('generating');
      expect(sm.getStatus('sess-2')).toBe('generating');
      expect(sm.getSessionTitle('sess-1')).toBe('Session One');

      sm.onIdle('sess-1');
      expect(sm.getStatus('sess-1')).toBe('generating');

      vi.advanceTimersByTime(1100);

      expect(sm.getStatus('sess-1')).toBe('idle');
      expect(sm.getStatus('sess-2')).toBe('generating');

      const finishedEvent = events.find((e) => e.type === 'run_finished' && e.sessionId === 'sess-1');
      expect(finishedEvent).toBeDefined();
      expect(finishedEvent.sessionTitle).toBe('Session One');

      vi.useRealTimers();
    });

    it('emits session_created and active_session_changed', () => {
      const sm = new AgentStateMachine();
      const events: any[] = [];
      sm.onEvent((e) => events.push(e));

      sm.onSessionCreated('new-123', 'My New Chat');
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'session_created',
          sessionId: 'new-123',
          title: 'My New Chat'
        })
      );

      sm.setSessionId('new-123');
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'active_session_changed',
          sessionId: 'new-123',
          title: 'My New Chat'
        })
      );
    });
  });

  describe('FakeAdapter Multi-Session Operations', () => {
    it('initializes with 3 conversations including background activity and approval', async () => {
      const adapter = new FakeAdapter();
      const sessions = await adapter.listSessions();
      expect(sessions).toHaveLength(3);
      expect(sessions[0].id).toBe('fake-session-1');
      expect(sessions[1].status).toBe('generating');
      expect(sessions[2].status).toBe('awaiting_approval');

      const state = await adapter.getState();
      expect(state.sessions).toHaveLength(3);
      expect(state.pendingApproval).toBeNull();

      await adapter.focusSession('fake-session-3');
      const focusedState = await adapter.getState();
      expect(focusedState.pendingApproval?.sessionId).toBe('fake-session-3');
    });

    it('switches conversations and handles unknown session id', async () => {
      const adapter = new FakeAdapter();
      await adapter.focusSession('fake-session-2');
      const state = await adapter.getState();
      expect(state.activeSessionId).toBe('fake-session-2');

      await expect(adapter.focusSession('non-existent')).rejects.toThrow('Session non-existent not found');
    });

    it('creates new session with text and delivers to specific session', async () => {
      const adapter = new FakeAdapter();
      const newId = await adapter.createSession('Hello new world');
      expect(newId).toMatch(/^fake-session-/);

      const msgs = await adapter.getMessages(10, newId);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].text).toBe('Hello new world');

      const sessions = await adapter.listSessions();
      expect(sessions.find((s) => s.id === newId)).toBeDefined();
    });

    it('handles focus-then-approve for background approval', async () => {
      const adapter = new FakeAdapter();
      const stateBefore = await adapter.getState();
      expect(stateBefore.activeSessionId).toBe('fake-session-1');
      expect(stateBefore.pendingApproval).toBeNull();

      await adapter.approve('req_fake_audit_1');

      const stateAfter = await adapter.getState();
      expect(stateAfter.activeSessionId).toBe('fake-session-3');
      expect(stateAfter.pendingApproval).toBeNull();
    });

    it('rejects stale approval', async () => {
      const adapter = new FakeAdapter();
      await adapter.focusSession('fake-session-3');
      await expect(adapter.approve('req_wrong_id')).rejects.toThrow('STALE_REQUEST');
      await expect(adapter.reject('req_wrong_id')).rejects.toThrow('STALE_REQUEST');
    });
  });

  describe('Notification Content with Session Titles', async () => {
    it('includes session title in run_finished and approval_requested notifications', async () => {
      const store = new InMemorySecretStore();
      const notifier = new NtfyNotifier(store, { topic: 'test-topic', hostLabel: 'Lumen' });

      let sentPayload: any = null;
      vi.spyOn(notifier, 'sendNotification').mockImplementation(async (opts) => {
        sentPayload = opts;
        return true;
      });

      await notifier.notifyRunFinished('sess-abc-12345', 'Optimization Run');
      expect(sentPayload.message).toContain('Optimization Run');
      expect(sentPayload.message).toContain('sess-abc-123');

      await notifier.notifyApprovalRequested('terminal', 'rm -rf dist', 'sess-abc-12345', 'Build Pipeline');
      expect(sentPayload.title).toContain('Build Pipeline');
      expect(sentPayload.message).toBe('rm -rf dist');
    });
  });

  describe('SdkAdapter createSession with Source 1', () => {
    it('calls StartCascade with source: 1', async () => {
      const sm = new AgentStateMachine();
      const adapter = new SdkAdapter(sm, {
        lsPort: 54321,
        csrfToken: 'test-csrf'
      });

      let capturedPayload: any = null;
      vi.spyOn(adapter as any, 'callRpc').mockImplementation(async (method: string, payload: any) => {
        if (method === 'StartCascade') {
          capturedPayload = payload;
          return { cascadeId: 'cascade-source1-verified' };
        }
        if (method === 'SendUserCascadeMessage') {
          return {};
        }
        return {};
      });

      const newId = await adapter.createSession('Run integration test');
      expect(newId).toBe('cascade-source1-verified');
      expect(capturedPayload).toEqual({ source: 1 });
    });
  });

  describe('REST Endpoints for Sessions', () => {
    let server: BridgeServer;
    let adapter: FakeAdapter;
    let tokenManager: TokenManager;
    let token: string;
    const port = 49199;

    beforeAll(async () => {
      const store = new InMemorySecretStore();
      tokenManager = new TokenManager(store);
      token = await tokenManager.getOrCreateToken();
      adapter = new FakeAdapter();
      server = new BridgeServer(
        {
          port,
          host: '127.0.0.1',
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
    });

    const request = async (path: string, options: http.RequestOptions = {}, body?: any) => {
      return new Promise<{ status: number; body: any }>((resolve, reject) => {
        const payload = body !== undefined ? JSON.stringify(body) : undefined;
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          ...options.headers
        };
        if (payload !== undefined) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = String(Buffer.byteLength(payload));
        }

        const req = http.request(
          `http://127.0.0.1:${port}${path}`,
          {
            ...options,
            headers
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => {
              try {
                resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
              } catch {
                resolve({ status: res.statusCode ?? 0, body: data });
              }
            });
          }
        );
        req.on('error', reject);
        if (payload !== undefined) req.write(payload);
        req.end();
      });
    };

    it('GET /v1/sessions lists all sessions with details', async () => {
      const res = await request('/v1/sessions', { method: 'GET' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body[0].title).toBe('Main Chat');
      expect(res.body[1].status).toBe('generating');
    });

    it('POST /v1/sessions creates a new conversation', async () => {
      const res = await request('/v1/sessions', { method: 'POST' }, { text: 'New test conversation' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.sessionId).toBeDefined();

      const listRes = await request('/v1/sessions', { method: 'GET' });
      expect(listRes.body).toHaveLength(4);
    });

    it('POST /v1/sessions/:id/focus switches active conversation', async () => {
      const res = await request('/v1/sessions/fake-session-2/focus', { method: 'POST' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const stateRes = await request('/v1/state', { method: 'GET' });
      expect(stateRes.body.activeSessionId).toBe('fake-session-2');
    });

    it('POST /v1/sessions/:id/prompt and GET /v1/sessions/:id/messages', async () => {
      const postRes = await request('/v1/sessions/fake-session-2/prompt', { method: 'POST' }, { text: 'Scoped prompt' });
      expect(postRes.status).toBe(200);
      expect(postRes.body.ok).toBe(true);

      const getRes = await request('/v1/sessions/fake-session-2/messages?limit=10', { method: 'GET' });
      expect(getRes.status).toBe(200);
      expect(getRes.body).toHaveLength(1);
      expect(getRes.body[0].text).toBe('Scoped prompt');
    });
  });
});
