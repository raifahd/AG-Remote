import {
  RunStatus,
  PendingApproval,
  AgentEvent,
  StatusChangedEvent,
  ApprovalRequestedEvent,
  RunFinishedEvent,
  MessageAppendedEvent,
  SessionCreatedEvent,
  ActiveSessionChangedEvent,
  BridgeErrorEvent
} from '@ag-remote/shared';

export interface StateMachineOptions {
  debounceMs?: number;
}

export class AgentStateMachine {
  private activeSessionId: string | null = null;
  private readonly sessionStatuses = new Map<string, RunStatus>();
  private readonly sessionTitles = new Map<string, string>();
  private readonly sessionApprovals = new Map<string, PendingApproval>();
  private readonly sessionActions = new Map<string, string>();
  private readonly sessionThoughts = new Map<string, string>();
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly debounceMs: number;
  private readonly listeners = new Set<(e: AgentEvent) => void>();

  constructor(options: StateMachineOptions = {}) {
    this.debounceMs = options.debounceMs ?? 2000;
  }

  getStatus(sessionId?: string): RunStatus {
    const sid = sessionId ?? this.activeSessionId ?? 'default-session';
    return this.sessionStatuses.get(sid) ?? 'idle';
  }

  getSessionId(): string | null {
    return this.activeSessionId;
  }

  getSessionTitle(sessionId: string): string | undefined {
    return this.sessionTitles.get(sessionId);
  }

  setSessionTitle(sessionId: string, title: string): void {
    this.sessionTitles.set(sessionId, title);
  }

  getSessionAction(sessionId: string): string | undefined {
    return this.sessionActions.get(sessionId);
  }

  getSessionThinking(sessionId: string): string | undefined {
    return this.sessionThoughts.get(sessionId);
  }

  getPendingApproval(sessionId?: string): PendingApproval | null {
    if (sessionId) {
      return this.sessionApprovals.get(sessionId) ?? null;
    }
    if (this.activeSessionId) {
      return this.sessionApprovals.get(this.activeSessionId) ?? null;
    }
    return null;
  }

  findApprovalByRequestId(requestId: string): PendingApproval | null {
    for (const app of this.sessionApprovals.values()) {
      if (app.requestId === requestId) {
        return app;
      }
    }
    return null;
  }

  setSessionId(sessionId: string): void {
    const previous = this.activeSessionId;
    if (previous !== sessionId) {
      this.activeSessionId = sessionId;
      const title = this.sessionTitles.get(sessionId);
      const event: ActiveSessionChangedEvent = {
        type: 'active_session_changed',
        sessionId,
        previousSessionId: previous ?? undefined,
        title,
        at: Date.now()
      };
      this.emit(event);
    }
  }

  onGenerating(sessionId?: string, title?: string, action?: string, thinking?: string): void {
    const sid = sessionId ?? this.activeSessionId ?? 'default-session';
    if (sessionId) {
      this.activeSessionId = sessionId;
    }
    if (title) {
      this.sessionTitles.set(sid, title);
    }
    this.cancelDebounce(sid);
    this.sessionApprovals.delete(sid);

    const prevAction = this.sessionActions.get(sid);
    const prevThought = this.sessionThoughts.get(sid);
    if (action !== undefined) {
      this.sessionActions.set(sid, action);
    }
    if (thinking !== undefined) {
      this.sessionThoughts.set(sid, thinking);
    }

    const prevStatus = this.sessionStatuses.get(sid);
    const actionChanged = action !== undefined && action !== prevAction;
    const thoughtChanged = thinking !== undefined && thinking !== prevThought;

    if (prevStatus !== 'generating' || actionChanged || thoughtChanged) {
      this.sessionStatuses.set(sid, 'generating');
      this.emitStatusChanged(sid, 'generating', action ?? prevAction, thinking ?? prevThought);
    }
  }

  onAwaitingApproval(approval: PendingApproval, sessionId?: string, title?: string): void {
    const sid = sessionId ?? approval.sessionId ?? this.activeSessionId ?? 'default-session';
    if (sessionId) {
      this.activeSessionId = sessionId;
    }
    if (title) {
      this.sessionTitles.set(sid, title);
    }
    this.cancelDebounce(sid);

    this.sessionApprovals.set(sid, approval);
    this.sessionStatuses.set(sid, 'awaiting_approval');
    this.emitStatusChanged(sid, 'awaiting_approval');

    const resolvedTitle = title ?? this.sessionTitles.get(sid);
    const event: ApprovalRequestedEvent = {
      type: 'approval_requested',
      requestId: approval.requestId,
      sessionId: approval.sessionId ?? sid,
      sessionTitle: resolvedTitle,
      kind: approval.kind,
      summary: approval.summary,
      at: Date.now()
    };
    this.emit(event);
  }

  onIdle(sessionId?: string, title?: string): void {
    const sid = sessionId ?? this.activeSessionId ?? 'default-session';
    if (title) {
      this.sessionTitles.set(sid, title);
    }

    const current = this.sessionStatuses.get(sid) ?? 'idle';
    if (current === 'idle' || current === 'awaiting_approval') {
      return;
    }

    if (this.debounceTimers.has(sid)) {
      return;
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(sid);
      const st = this.sessionStatuses.get(sid);
      if (st === 'generating') {
        this.sessionStatuses.set(sid, 'idle');
        this.sessionActions.delete(sid);
        this.sessionThoughts.delete(sid);
        this.emitStatusChanged(sid, 'idle');

        const resolvedTitle = this.sessionTitles.get(sid);
        const finishedEvent: RunFinishedEvent = {
          type: 'run_finished',
          sessionId: sid,
          sessionTitle: resolvedTitle,
          at: Date.now()
        };
        this.emit(finishedEvent);
      }
    }, this.debounceMs);

    this.debounceTimers.set(sid, timer);
  }

  onStopped(sessionId?: string): void {
    const sid = sessionId ?? this.activeSessionId ?? 'default-session';
    this.cancelDebounce(sid);
    this.sessionApprovals.delete(sid);
    this.sessionActions.delete(sid);
    this.sessionThoughts.delete(sid);
    this.sessionStatuses.set(sid, 'idle');
    this.emitStatusChanged(sid, 'idle');
  }

  onSessionCreated(sessionId: string, title: string): void {
    this.sessionTitles.set(sessionId, title);
    this.sessionStatuses.set(sessionId, 'idle');
    this.sessionActions.delete(sessionId);
    this.sessionThoughts.delete(sessionId);
    const event: SessionCreatedEvent = {
      type: 'session_created',
      sessionId,
      title,
      at: Date.now()
    };
    this.emit(event);
  }

  onMessageAppended(sessionId: string, role: 'user' | 'agent', text: string, title?: string): void {
    if (title) {
      this.sessionTitles.set(sessionId, title);
    }
    const resolvedTitle = title ?? this.sessionTitles.get(sessionId);
    const event: MessageAppendedEvent = {
      type: 'message_appended',
      sessionId,
      sessionTitle: resolvedTitle,
      role,
      text,
      at: Date.now()
    };
    this.emit(event);
  }

  onError(message: string, sessionId?: string): void {
    const sid = sessionId ?? this.activeSessionId ?? 'default-session';
    this.cancelDebounce(sid);
    this.sessionStatuses.set(sid, 'error');
    this.sessionActions.delete(sid);
    this.sessionThoughts.delete(sid);
    this.emitStatusChanged(sid, 'error');

    const errorEvent: BridgeErrorEvent = {
      type: 'bridge_error',
      message,
      at: Date.now()
    };
    this.emit(errorEvent);
  }

  reset(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.sessionStatuses.clear();
    this.sessionTitles.clear();
    this.sessionApprovals.clear();
    this.sessionActions.clear();
    this.sessionThoughts.clear();
    this.activeSessionId = null;
  }

  onEvent(handler: (e: AgentEvent) => void): { dispose(): void } {
    this.listeners.add(handler);
    return {
      dispose: () => {
        this.listeners.delete(handler);
      }
    };
  }

  private cancelDebounce(sessionId: string): void {
    const timer = this.debounceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(sessionId);
    }
  }

  private emitStatusChanged(sessionId: string, status: RunStatus, action?: string, thinking?: string): void {
    const event: StatusChangedEvent = {
      type: 'status_changed',
      sessionId,
      status,
      action: action ?? this.sessionActions.get(sessionId),
      thinking: thinking ?? this.sessionThoughts.get(sessionId),
      at: Date.now()
    };
    this.emit(event);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
