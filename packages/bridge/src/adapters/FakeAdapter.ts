import {
  AgentState,
  ChatMessage,
  AgentEvent,
  RunStatus,
  PendingApproval
} from '@ag-remote/shared';
import { AgentAdapter, Disposable } from './AgentAdapter.js';

export class FakeAdapter implements AgentAdapter {
  private status: RunStatus = 'idle';
  private activeSessionId: string | null = 'fake-session-1';
  private pendingApproval: PendingApproval | null = null;
  private messages: ChatMessage[] = [];
  private readonly listeners = new Set<(e: AgentEvent) => void>();

  async getState(): Promise<AgentState> {
    return {
      sessions: [
        {
          id: 'fake-session-1',
          title: 'Fake Conversation',
          lastModified: Date.now()
        }
      ],
      activeSessionId: this.activeSessionId,
      status: this.status,
      pendingApproval: this.pendingApproval
    };
  }

  async getMessages(limit: number): Promise<ChatMessage[]> {
    return this.messages.slice(-limit);
  }

  async sendPrompt(text: string): Promise<void> {
    const at = Date.now();
    this.messages.push({
      id: `msg-${at}`,
      role: 'user',
      text,
      timestamp: at
    });

    this.emit({
      type: 'message_appended',
      sessionId: this.activeSessionId ?? 'fake-session-1',
      role: 'user',
      text,
      at
    });

    this.setStatus('generating');
  }

  async approve(): Promise<void> {
    this.pendingApproval = null;
    this.setStatus('generating');
  }

  async reject(): Promise<void> {
    this.pendingApproval = null;
    this.setStatus('idle');
  }

  async stop(): Promise<void> {
    this.pendingApproval = null;
    this.setStatus('idle');
  }

  onEvent(handler: (e: AgentEvent) => void): Disposable {
    this.listeners.add(handler);
    return {
      dispose: () => {
        this.listeners.delete(handler);
      }
    };
  }

  simulateApprovalRequest(requestId: string, kind: 'edit' | 'terminal' | 'tool', summary: string): void {
    const at = Date.now();
    this.pendingApproval = {
      requestId,
      kind,
      summary,
      createdAt: at
    };
    this.setStatus('awaiting_approval');
    this.emit({
      type: 'approval_requested',
      requestId,
      kind,
      summary,
      at
    });
  }

  simulateRunFinished(): void {
    const at = Date.now();
    this.setStatus('idle');
    this.emit({
      type: 'run_finished',
      sessionId: this.activeSessionId ?? 'fake-session-1',
      at
    });
  }

  private setStatus(next: RunStatus): void {
    this.status = next;
    this.emit({
      type: 'status_changed',
      sessionId: this.activeSessionId ?? 'fake-session-1',
      status: next,
      at: Date.now()
    });
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

