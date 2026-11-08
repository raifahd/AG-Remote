import http from 'http';
import https from 'https';
import {
  AgentState,
  ChatMessage,
  AgentEvent,
  SessionSummary
} from '@ag-remote/shared';
import { AgentAdapter, Disposable } from './AgentAdapter.js';
import { AgentStateMachine } from '../stateMachine.js';

export interface SdkAdapterConfig {
  lsPort?: number | undefined;
  csrfToken?: string | undefined;
  useTls?: boolean | undefined;
  pollIntervalMs?: number | undefined;
  executeCommand?: ((command: string, ...args: unknown[]) => Promise<unknown>) | undefined;
}

interface RawTrajectorySummary {
  summary?: string;
  stepCount?: number;
  lastModifiedTime?: string;
  trajectoryId?: string;
  status?: string;
  createdTime?: string;
}

interface GetAllTrajectoriesResponse {
  trajectorySummaries?: Record<string, RawTrajectorySummary>;
}

export class SdkAdapter implements AgentAdapter {
  private lsPort: number;
  private csrfToken: string;
  private useTls: boolean;
  private readonly pollIntervalMs: number;
  private readonly executeCommand?: ((command: string, ...args: unknown[]) => Promise<unknown>) | undefined;
  private readonly stateMachine: AgentStateMachine;
  private pollTimer: NodeJS.Timeout | null = null;
  private activeSessionId: string | null = null;
  private lastStepCounts = new Map<string, number>();

  constructor(stateMachine: AgentStateMachine, config: SdkAdapterConfig = {}) {
    this.stateMachine = stateMachine;
    this.lsPort = config.lsPort ?? (process.env.ANTIGRAVITY_LS_ADDRESS ? parseInt(process.env.ANTIGRAVITY_LS_ADDRESS.split(':')[1] ?? '44045', 10) : 44045);
    this.csrfToken = config.csrfToken ?? process.env.ANTIGRAVITY_CSRF_TOKEN ?? '';
    this.useTls = config.useTls ?? false;
    this.pollIntervalMs = config.pollIntervalMs ?? 1500;
    this.executeCommand = config.executeCommand;

    if (process.env.ANTIGRAVITY_CONVERSATION_ID) {
      this.activeSessionId = process.env.ANTIGRAVITY_CONVERSATION_ID;
      this.stateMachine.setSessionId(this.activeSessionId);
    }
  }

  setConnection(port: number, csrfToken: string, useTls = false): void {
    this.lsPort = port;
    this.csrfToken = csrfToken;
    this.useTls = useTls;
  }

  startPolling(): void {
    if (this.pollTimer !== null) {
      return;
    }
    this.pollTimer = setInterval(async () => {
      await this.pollOnce();
    }, this.pollIntervalMs);
  }

  stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      const resp = await this.callRpc<GetAllTrajectoriesResponse>('GetAllCascadeTrajectories', {});
      const summaries = resp?.trajectorySummaries ?? {};
      const sessionIds = Object.keys(summaries);

      if (sessionIds.length === 0) {
        return;
      }

      let activeId = this.activeSessionId;
      if (!activeId || !summaries[activeId]) {
        let latestTime = 0;
        for (const id of sessionIds) {
          const item = summaries[id];
          if (item?.lastModifiedTime) {
            const time = new Date(item.lastModifiedTime).getTime();
            if (time > latestTime) {
              latestTime = time;
              activeId = id;
            }
          }
        }
        if (activeId) {
          this.activeSessionId = activeId;
          this.stateMachine.setSessionId(activeId);
        }
      }

      if (!activeId) {
        return;
      }

      const current = summaries[activeId];
      if (!current) {
        return;
      }

      const isRunning = current.status === 'CASCADE_RUN_STATUS_RUNNING';
      const prevStepCount = this.lastStepCounts.get(activeId) ?? 0;
      const currentStepCount = current.stepCount ?? 0;
      this.lastStepCounts.set(activeId, currentStepCount);

      if (isRunning) {
        this.stateMachine.onGenerating(activeId);
      } else {
        if (currentStepCount > prevStepCount && this.stateMachine.getStatus() === 'idle') {
          this.stateMachine.onGenerating(activeId);
        }
        this.stateMachine.onIdle(activeId);
      }
    } catch {
      // transient polling error
    }
  }

  async getState(): Promise<AgentState> {
    const sessions: SessionSummary[] = [];
    let activeId = this.activeSessionId;

    try {
      const resp = await this.callRpc<GetAllTrajectoriesResponse>('GetAllCascadeTrajectories', {});
      const summaries = resp?.trajectorySummaries ?? {};
      for (const id of Object.keys(summaries)) {
        const item = summaries[id];
        sessions.push({
          id,
          title: item?.summary ?? 'Untitled',
          lastModified: item?.lastModifiedTime ? new Date(item.lastModifiedTime).getTime() : undefined
        });
      }
    } catch {
      if (activeId) {
        sessions.push({
          id: activeId,
          title: 'Active Session'
        });
      }
    }

    return {
      sessions,
      activeSessionId: activeId,
      status: this.stateMachine.getStatus(),
      pendingApproval: this.stateMachine.getPendingApproval()
    };
  }

  async getMessages(_limit: number): Promise<ChatMessage[]> {
    return [];
  }

  async sendPrompt(text: string): Promise<void> {
    const cascadeId = this.activeSessionId ?? process.env.ANTIGRAVITY_CONVERSATION_ID ?? '';
    if (!cascadeId) {
      if (this.executeCommand) {
        await this.executeCommand('antigravity.sendTextToChat', text);
        this.stateMachine.onGenerating();
        return;
      }
      throw new Error('No active conversation to send prompt to');
    }

    const payload = {
      cascadeId,
      items: [{ chunk: { case: 'text', value: text } }],
      cascadeConfig: {
        plannerConfig: {
          plannerTypeConfig: {
            case: 'conversational',
            value: {}
          },
          requestedModel: {
            choice: { case: 'model', value: 1018 }
          }
        }
      }
    };

    await this.callRpc('SendUserCascadeMessage', payload);
    this.stateMachine.onGenerating(cascadeId);
  }

  async approve(): Promise<void> {
    const kind = this.stateMachine.getPendingApproval()?.kind;
    if (this.executeCommand) {
      if (kind === 'terminal') {
        try {
          await this.executeCommand('antigravity.terminalCommand.accept');
        } catch {
          await this.executeCommand('antigravity.command.accept');
        }
      } else if (kind === 'edit') {
        try {
          await this.executeCommand('antigravity.agent.acceptAgentStep');
        } catch {
          await this.executeCommand('antigravity.command.accept');
        }
      } else {
        try {
          await this.executeCommand('antigravity.command.accept');
        } catch {
          await this.executeCommand('antigravity.agent.acceptAgentStep');
        }
      }
    }
    this.stateMachine.onGenerating();
  }

  async reject(): Promise<void> {
    const kind = this.stateMachine.getPendingApproval()?.kind;
    if (this.executeCommand) {
      if (kind === 'terminal') {
        try {
          await this.executeCommand('antigravity.terminalCommand.reject');
        } catch {
          await this.executeCommand('antigravity.command.reject');
        }
      } else if (kind === 'edit') {
        try {
          await this.executeCommand('antigravity.agent.rejectAgentStep');
        } catch {
          await this.executeCommand('antigravity.command.reject');
        }
      } else {
        try {
          await this.executeCommand('antigravity.command.reject');
        } catch {
          await this.executeCommand('antigravity.agent.rejectAgentStep');
        }
      }
    }
    this.stateMachine.onIdle();
  }

  async stop(): Promise<void> {
    const cascadeId = this.activeSessionId ?? process.env.ANTIGRAVITY_CONVERSATION_ID ?? '';
    if (cascadeId) {
      try {
        await this.callRpc('CancelCascadeInvocation', { cascadeId });
      } catch {
        // ignore error
      }
    }
    this.stateMachine.onStopped(cascadeId);
  }

  onEvent(handler: (e: AgentEvent) => void): Disposable {
    return this.stateMachine.onEvent(handler);
  }

  private async callRpc<T = unknown>(method: string, payload: unknown): Promise<T> {
    const body = JSON.stringify(payload);
    const mod = this.useTls ? https : http;
    const proto = this.useTls ? 'https' : 'http';
    const url = `${proto}://127.0.0.1:${this.lsPort}/exa.language_server_pb.LanguageServerService/${method}`;

    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body))
      };
      if (this.csrfToken) {
        headers['x-codeium-csrf-token'] = this.csrfToken;
      }

      const req = mod.request(
        url,
        {
          method: 'POST',
          headers,
          rejectUnauthorized: false
        },
        (res) => {
          let chunks = '';
          res.on('data', (d) => (chunks += d));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(chunks) as T);
              } catch {
                resolve(chunks as unknown as T);
              }
            } else {
              reject(new Error(`RPC ${method} returned status ${res.statusCode}: ${chunks}`));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });

      req.write(body);
      req.end();
    });
  }
}
