import {
  RunStatus,
  PendingApproval,
  AgentEvent,
  StatusChangedEvent,
  ApprovalRequestedEvent,
  RunFinishedEvent,
  BridgeErrorEvent
} from '@ag-remote/shared';

export interface StateMachineOptions {
  debounceMs?: number;
}

export class AgentStateMachine {
  private currentStatus: RunStatus = 'idle';
  private currentSessionId: string | null = null;
  private currentApproval: PendingApproval | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly debounceMs: number;
  private readonly listeners = new Set<(e: AgentEvent) => void>();

  constructor(options: StateMachineOptions = {}) {
    this.debounceMs = options.debounceMs ?? 2000;
  }

  getStatus(): RunStatus {
    return this.currentStatus;
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  getPendingApproval(): PendingApproval | null {
    return this.currentApproval;
  }

  setSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  onGenerating(sessionId?: string): void {
    if (sessionId) {
      this.currentSessionId = sessionId;
    }
    this.cancelDebounce();

    if (this.currentStatus === 'awaiting_approval') {
      this.currentApproval = null;
    }

    if (this.currentStatus !== 'generating') {
      this.currentStatus = 'generating';
      this.emitStatusChanged('generating');
    }
  }

  onAwaitingApproval(approval: PendingApproval, sessionId?: string): void {
    if (sessionId) {
      this.currentSessionId = sessionId;
    }
    this.cancelDebounce();

    this.currentApproval = approval;
    this.currentStatus = 'awaiting_approval';
    this.emitStatusChanged('awaiting_approval');

    const event: ApprovalRequestedEvent = {
      type: 'approval_requested',
      requestId: approval.requestId,
      kind: approval.kind,
      summary: approval.summary,
      at: Date.now()
    };
    this.emit(event);
  }

  onIdle(sessionId?: string): void {
    if (sessionId) {
      this.currentSessionId = sessionId;
    }

    if (this.currentStatus === 'idle') {
      return;
    }

    if (this.currentStatus === 'awaiting_approval') {
      return;
    }

    if (this.debounceTimer !== null) {
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.currentStatus === 'generating') {
        const sid = this.currentSessionId ?? 'default-session';
        this.currentStatus = 'idle';
        this.emitStatusChanged('idle');

        const finishedEvent: RunFinishedEvent = {
          type: 'run_finished',
          sessionId: sid,
          at: Date.now()
        };
        this.emit(finishedEvent);
      }
    }, this.debounceMs);
  }

  onStopped(sessionId?: string): void {
    if (sessionId) {
      this.currentSessionId = sessionId;
    }
    this.cancelDebounce();
    this.currentApproval = null;
    this.currentStatus = 'idle';
    this.emitStatusChanged('idle');
  }

  onError(message: string, sessionId?: string): void {
    if (sessionId) {
      this.currentSessionId = sessionId;
    }
    this.cancelDebounce();
    this.currentStatus = 'error';
    this.emitStatusChanged('error');

    const errorEvent: BridgeErrorEvent = {
      type: 'bridge_error',
      message,
      at: Date.now()
    };
    this.emit(errorEvent);
  }

  reset(): void {
    this.cancelDebounce();
    this.currentStatus = 'idle';
    this.currentApproval = null;
  }

  onEvent(handler: (e: AgentEvent) => void): { dispose(): void } {
    this.listeners.add(handler);
    return {
      dispose: () => {
        this.listeners.delete(handler);
      }
    };
  }

  private cancelDebounce(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private emitStatusChanged(status: RunStatus): void {
    const event: StatusChangedEvent = {
      type: 'status_changed',
      sessionId: this.currentSessionId ?? 'default-session',
      status,
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
