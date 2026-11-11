import {
  AgentState,
  ChatMessage,
  AgentEvent,
  PendingApproval,
  SessionSummary,
  ApprovalKind
} from '@ag-remote/shared';
import { AgentAdapter, Disposable } from './AgentAdapter.js';

export class FakeAdapter implements AgentAdapter {
  private activeSessionId: string | null = 'fake-session-1';
  private sessions: SessionSummary[] = [
    {
      id: 'fake-session-1',
      title: 'Main Chat',
      stepCount: 12,
      lastActivityAt: Date.now() - 60000,
      status: 'idle',
      lastModified: Date.now() - 60000
    },
    {
      id: 'fake-session-2',
      title: 'Background Task',
      stepCount: 45,
      lastActivityAt: Date.now() - 30000,
      status: 'generating',
      lastModified: Date.now() - 30000
    },
    {
      id: 'fake-session-3',
      title: 'Security Audit',
      stepCount: 8,
      lastActivityAt: Date.now() - 10000,
      status: 'awaiting_approval',
      lastModified: Date.now() - 10000
    }
  ];

  private readonly sessionMessages = new Map<string, ChatMessage[]>();
  private readonly sessionApprovals = new Map<string, PendingApproval>([
    [
      'fake-session-3',
      {
        requestId: 'req_fake_audit_1',
        sessionId: 'fake-session-3',
        kind: 'terminal',
        summary: 'Run npm audit fix',
        createdAt: Date.now() - 10000
      }
    ]
  ]);
  private readonly listeners = new Set<(e: AgentEvent) => void>();

  constructor() {
    this.sessionMessages.set('fake-session-1', []);
  }

  async getState(): Promise<AgentState> {
    const active = this.sessions.find((s) => s.id === this.activeSessionId);
    return {
      sessions: this.sessions,
      activeSessionId: this.activeSessionId,
      status: active?.status ?? 'idle',
      pendingApproval: this.getPendingApproval()
    };
  }

  async listSessions(): Promise<SessionSummary[]> {
    return [...this.sessions];
  }

  async focusSession(id: string): Promise<void> {
    const target = this.sessions.find((s) => s.id === id);
    if (!target) {
      throw new Error(`Session ${id} not found`);
    }
    const prev = this.activeSessionId;
    this.activeSessionId = id;
    this.emit({
      type: 'active_session_changed',
      sessionId: id,
      previousSessionId: prev ?? undefined,
      title: target.title,
      at: Date.now()
    });
  }

  async createSession(text?: string): Promise<string> {
    const id = `fake-session-${Date.now()}`;
    const title = text ? (text.length > 25 ? `${text.slice(0, 25)}...` : text) : 'New Conversation';
    const newSession: SessionSummary = {
      id,
      title,
      stepCount: text ? 1 : 0,
      lastActivityAt: Date.now(),
      status: text ? 'generating' : 'idle',
      lastModified: Date.now()
    };
    this.sessions.push(newSession);
    this.sessionMessages.set(id, []);

    this.emit({
      type: 'session_created',
      sessionId: id,
      title,
      at: Date.now()
    });

    if (text) {
      await this.sendPrompt(text, id);
    }

    return id;
  }

  async getMessages(limit: number, sessionId?: string): Promise<ChatMessage[]> {
    const sid = sessionId ?? this.activeSessionId ?? 'fake-session-1';
    const list = this.sessionMessages.get(sid) ?? [];
    return list.slice(-limit);
  }

  async sendPrompt(text: string, sessionId?: string): Promise<void> {
    const sid = sessionId ?? this.activeSessionId ?? 'fake-session-1';
    const target = this.sessions.find((s) => s.id === sid);
    if (!target) {
      throw new Error(`Session ${sid} not found`);
    }

    const at = Date.now();
    const msg: ChatMessage = {
      id: `msg-${at}`,
      role: 'user',
      text,
      timestamp: at
    };

    const currentList = this.sessionMessages.get(sid) ?? [];
    currentList.push(msg);
    this.sessionMessages.set(sid, currentList);

    target.status = 'generating';
    target.lastActivityAt = at;
    target.lastModified = at;
    if (target.stepCount !== undefined) {
      target.stepCount += 1;
    }

    this.emit({
      type: 'message_appended',
      sessionId: sid,
      sessionTitle: target.title,
      role: 'user',
      text,
      at
    });

    this.emit({
      type: 'status_changed',
      sessionId: sid,
      status: 'generating',
      at
    });
  }

  async approve(requestId?: string): Promise<void> {
    const activePending = this.getPendingApproval(this.activeSessionId ?? undefined);

    if (activePending) {
      if (requestId && activePending.requestId !== requestId) {
        throw new Error('STALE_REQUEST');
      }
      this.sessionApprovals.delete(this.activeSessionId!);
      const target = this.sessions.find((s) => s.id === this.activeSessionId);
      if (target) {
        target.status = 'generating';
      }
      this.emit({
        type: 'status_changed',
        sessionId: this.activeSessionId!,
        status: 'generating',
        at: Date.now()
      });
      return;
    }

    if (requestId) {
      let targetSessionId: string | null = null;
      let matchedApproval: PendingApproval | null = null;
      for (const [sid, app] of this.sessionApprovals.entries()) {
        if (app.requestId === requestId) {
          targetSessionId = sid;
          matchedApproval = app;
          break;
        }
      }

      if (targetSessionId && matchedApproval) {
        await this.focusSession(targetSessionId);
        const rechecked = this.getPendingApproval(targetSessionId);
        if (!rechecked || rechecked.requestId !== requestId) {
          throw new Error('STALE_REQUEST');
        }
        this.sessionApprovals.delete(targetSessionId);
        const target = this.sessions.find((s) => s.id === targetSessionId);
        if (target) {
          target.status = 'generating';
        }
        this.emit({
          type: 'status_changed',
          sessionId: targetSessionId,
          status: 'generating',
          at: Date.now()
        });
        return;
      }
    }

    throw new Error('NO_PENDING_APPROVAL');
  }

  async reject(requestId?: string): Promise<void> {
    const activePending = this.getPendingApproval(this.activeSessionId ?? undefined);

    if (activePending) {
      if (requestId && activePending.requestId !== requestId) {
        throw new Error('STALE_REQUEST');
      }
      this.sessionApprovals.delete(this.activeSessionId!);
      const target = this.sessions.find((s) => s.id === this.activeSessionId);
      if (target) {
        target.status = 'idle';
      }
      this.emit({
        type: 'status_changed',
        sessionId: this.activeSessionId!,
        status: 'idle',
        at: Date.now()
      });
      return;
    }

    if (requestId) {
      let targetSessionId: string | null = null;
      let matchedApproval: PendingApproval | null = null;
      for (const [sid, app] of this.sessionApprovals.entries()) {
        if (app.requestId === requestId) {
          targetSessionId = sid;
          matchedApproval = app;
          break;
        }
      }

      if (targetSessionId && matchedApproval) {
        await this.focusSession(targetSessionId);
        const rechecked = this.getPendingApproval(targetSessionId);
        if (!rechecked || rechecked.requestId !== requestId) {
          throw new Error('STALE_REQUEST');
        }
        this.sessionApprovals.delete(targetSessionId);
        const target = this.sessions.find((s) => s.id === targetSessionId);
        if (target) {
          target.status = 'idle';
        }
        this.emit({
          type: 'status_changed',
          sessionId: targetSessionId,
          status: 'idle',
          at: Date.now()
        });
        return;
      }
    }

    throw new Error('NO_PENDING_APPROVAL');
  }

  async stop(sessionId?: string): Promise<void> {
    const sid = sessionId ?? this.activeSessionId ?? 'fake-session-1';
    this.sessionApprovals.delete(sid);
    const target = this.sessions.find((s) => s.id === sid);
    if (target) {
      target.status = 'idle';
    }
    this.emit({
      type: 'status_changed',
      sessionId: sid,
      status: 'idle',
      at: Date.now()
    });
  }

  onEvent(handler: (e: AgentEvent) => void): Disposable {
    this.listeners.add(handler);
    return {
      dispose: () => {
        this.listeners.delete(handler);
      }
    };
  }

  simulateApprovalRequest(requestId: string, kind: ApprovalKind, summary: string, sessionId?: string): void {
    const at = Date.now();
    const sid = sessionId ?? this.activeSessionId ?? 'fake-session-1';
    const target = this.sessions.find((s) => s.id === sid);
    const approval: PendingApproval = {
      requestId,
      sessionId: sid,
      kind,
      summary,
      createdAt: at
    };
    this.sessionApprovals.set(sid, approval);
    if (target) {
      target.status = 'awaiting_approval';
    }
    this.emit({
      type: 'status_changed',
      sessionId: sid,
      status: 'awaiting_approval',
      at
    });
    this.emit({
      type: 'approval_requested',
      requestId,
      sessionId: sid,
      sessionTitle: target?.title,
      kind,
      summary,
      at
    });
  }

  simulateRunFinished(sessionId?: string): void {
    const at = Date.now();
    const sid = sessionId ?? this.activeSessionId ?? 'fake-session-1';
    const target = this.sessions.find((s) => s.id === sid);
    if (target) {
      target.status = 'idle';
    }
    this.emit({
      type: 'status_changed',
      sessionId: sid,
      status: 'idle',
      at
    });
    this.emit({
      type: 'run_finished',
      sessionId: sid,
      sessionTitle: target?.title,
      at
    });
  }

  private getPendingApproval(sessionId?: string): PendingApproval | null {
    if (sessionId) {
      return this.sessionApprovals.get(sessionId) ?? null;
    }
    if (this.activeSessionId) {
      return this.sessionApprovals.get(this.activeSessionId) ?? null;
    }
    return null;
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

