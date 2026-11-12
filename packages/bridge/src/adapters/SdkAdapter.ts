import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  AgentState,
  ChatMessage,
  AgentEvent,
  SessionSummary,
  RunStatus,
  PendingApproval
} from '@ag-remote/shared';
import { AgentAdapter, Disposable } from './AgentAdapter.js';
import { AgentStateMachine } from '../stateMachine.js';

export interface SdkAdapterConfig {
  lsPort?: number | undefined;
  csrfToken?: string | undefined;
  useTls?: boolean | undefined;
  pollIntervalMs?: number | undefined;
  executeCommand?: ((command: string, ...args: unknown[]) => Promise<unknown>) | undefined;
  brainDir?: string | null | undefined;
}

interface RawTrajectorySummary {
  summary?: string;
  stepCount?: number;
  lastModifiedTime?: string;
  trajectoryId?: string;
  status?: string;
  createdTime?: string;
  workspaces?: Array<{
    workspaceFolderAbsoluteUri?: string;
  }>;
}

interface GetAllTrajectoriesResponse {
  trajectorySummaries?: Record<string, RawTrajectorySummary>;
}

interface RawStep {
  type?: string;
  status?: string;
  metadata?: {
    createdAt?: string;
    executionId?: string;
  };
  userInput?: {
    userResponse?: string;
  };
  plannerResponse?: {
    messageId?: string;
    response?: string;
  };
}

interface GetCascadeTrajectoryResponse {
  trajectory?: {
    trajectoryId?: string;
    cascadeId?: string;
    steps?: RawStep[];
  };
}

interface StartCascadeResponse {
  cascadeId?: string;
}

function detectAgyHub(): { port: number; token: string } | null {
  try {
    if (process.platform === 'linux' && fs.existsSync('/proc')) {
      const pids = fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p));
      for (const pid of pids) {
        try {
          const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
          if (cmd.includes('--hub-port')) {
            const portMatch = cmd.match(/--hub-port=(\d+)/);
            const tokenMatch = cmd.match(/--csrf_token=([a-f0-9-]+)/);
            if (portMatch && tokenMatch) {
              return { port: parseInt(portMatch[1] ?? '0', 10), token: tokenMatch[1] ?? '' };
            }
          }
        } catch {}
      }
    }
  } catch {}
  return null;
}

function discoverBrainSessions(brainDir: string | null, existingIds: Set<string>): SessionSummary[] {
  const result: SessionSummary[] = [];
  try {
    if (!brainDir || !fs.existsSync(brainDir)) {
      return result;
    }
    const entries = fs.readdirSync(brainDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === 'tempmediaStorage') {
        continue;
      }
      const id = entry.name;
      if (existingIds.has(id)) {
        continue;
      }

      const transcriptPath = path.join(brainDir, id, '.system_generated', 'logs', 'transcript.jsonl');
      let title = 'Conversation';
      let lastActivityAt = 0;
      let stepCount = 0;

      if (fs.existsSync(transcriptPath)) {
        try {
          const stat = fs.statSync(transcriptPath);
          lastActivityAt = Math.round(stat.mtimeMs);
          const content = fs.readFileSync(transcriptPath, 'utf8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            stepCount++;
            if (title === 'Conversation') {
              try {
                const step = JSON.parse(line);
                if (step.type === 'USER_INPUT' && step.content) {
                  const reqMatch = typeof step.content === 'string'
                    ? step.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/)
                    : null;
                  const raw = reqMatch ? reqMatch[1] : (typeof step.content === 'string' ? step.content : '');
                  const firstLine = raw.trim().split('\n')[0]?.replace(/^[#*`\s-]+/, '').trim();
                  if (firstLine) {
                    title = firstLine.slice(0, 60);
                  }
                }
              } catch {}
            }
          }
        } catch {}
      } else {
        try {
          const dirStat = fs.statSync(path.join(brainDir, id));
          lastActivityAt = Math.round(dirStat.mtimeMs);
        } catch {}
      }

      result.push({
        id,
        title,
        stepCount,
        lastActivityAt: lastActivityAt || undefined,
        status: 'idle',
        lastModified: lastActivityAt || undefined
      });
    }
  } catch {}
  return result;
}

function readTranscriptMessages(brainDir: string | null, cascadeId: string, limit: number): ChatMessage[] {
  const messages: ChatMessage[] = [];
  try {
    if (!brainDir) {
      return messages;
    }
    const transcriptPath = path.join(brainDir, cascadeId, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(transcriptPath)) {
      return messages;
    }
    const content = fs.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n');
    let idx = 0;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const step = JSON.parse(line);
        const timestamp = step.created_at ? new Date(step.created_at).getTime() : Date.now();
        if (step.type === 'USER_INPUT' && step.content) {
          const reqMatch = typeof step.content === 'string'
            ? step.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/)
            : null;
          const userText = reqMatch ? reqMatch[1].trim() : (typeof step.content === 'string' ? step.content : '');
          if (userText) {
            messages.push({
              id: `user-${cascadeId}-${idx++}`,
              role: 'user',
              text: userText,
              timestamp
            });
          }
        } else if (step.type === 'PLANNER_RESPONSE' && step.content) {
          messages.push({
            id: `agent-${cascadeId}-${idx++}`,
            role: 'agent',
            text: typeof step.content === 'string' ? step.content : JSON.stringify(step.content),
            timestamp
          });
        }
      } catch {}
    }
  } catch {}
  return messages.slice(-limit);
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
  private readonly stoppedSessions = new Set<string>();
  private brainDir: string | null;

  constructor(stateMachine: AgentStateMachine, config: SdkAdapterConfig = {}) {
    this.stateMachine = stateMachine;
    const detected = detectAgyHub();
    this.lsPort = config.lsPort ?? (process.env.ANTIGRAVITY_LS_ADDRESS ? parseInt(process.env.ANTIGRAVITY_LS_ADDRESS.split(':')[1] ?? '44045', 10) : (detected?.port ?? 44045));
    this.csrfToken = config.csrfToken ?? (process.env.ANTIGRAVITY_CSRF_TOKEN ?? (detected?.token ?? ''));
    this.useTls = config.useTls ?? false;
    this.pollIntervalMs = config.pollIntervalMs ?? 1000;
    this.executeCommand = config.executeCommand;

    if (config.brainDir !== undefined) {
      this.brainDir = config.brainDir;
    } else if (process.env.ANTIGRAVITY_BRAIN_DIR) {
      this.brainDir = process.env.ANTIGRAVITY_BRAIN_DIR;
    } else if (process.env.NODE_ENV === 'test') {
      this.brainDir = null;
    } else {
      this.brainDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
    }

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

  async checkCapabilities(): Promise<{ ok: boolean; missing: string[] }> {
    const requiredMethods = [
      'GetAllCascadeTrajectories',
      'GetCascadeTrajectory',
      'StartCascade',
      'SendUserCascadeMessage',
      'CancelCascadeInvocation'
    ];
    const missing: string[] = [];

    for (const method of requiredMethods) {
      try {
        if (method === 'GetAllCascadeTrajectories') {
          await this.callRpc(method, {});
        } else if (method === 'GetCascadeTrajectory') {
          await this.callRpc(method, { cascadeId: 'capability_check_probe' }).catch((err) => {
            if (String(err).includes('404')) missing.push(method);
          });
        }
      } catch (err) {
        const msg = String(err);
        if (msg.includes('404') || msg.includes('not found')) {
          missing.push(method);
        }
      }
    }

    return {
      ok: missing.length === 0,
      missing
    };
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

      for (const id of sessionIds) {
        const item = summaries[id];
        if (!item) continue;

        const title = item.summary ?? 'Untitled';
        this.stateMachine.setSessionTitle(id, title);

        const isRunning = item.status === 'CASCADE_RUN_STATUS_RUNNING';
        const currentStepCount = item.stepCount ?? 0;
        this.lastStepCounts.set(id, currentStepCount);

        if (isRunning) {
          if (this.stoppedSessions.has(id)) {
            continue;
          }
          this.stateMachine.onGenerating(id, title);
        } else {
          this.stoppedSessions.delete(id);
          this.stateMachine.onIdle(id, title);
        }
      }

      if (activeId) {
        try {
          const trajResp = await this.callRpc<GetCascadeTrajectoryResponse>('GetCascadeTrajectory', { cascadeId: activeId });
          const steps = trajResp?.trajectory?.steps ?? [];
          if (steps.length > 0) {
            const lastStep = steps[steps.length - 1];
            if (lastStep?.status === 'CORTEX_STEP_STATUS_WAITING') {
              const stepType = lastStep.type ?? '';
              let kind: 'edit' | 'terminal' | 'tool' = 'tool';
              if (stepType.includes('CODE_ACTION') || stepType.includes('EDIT_FILE')) {
                kind = 'edit';
              } else if (stepType.includes('COMMAND') || stepType.includes('TERMINAL')) {
                kind = 'terminal';
              }
              const currentPending = this.stateMachine.getPendingApproval(activeId);
              if (!currentPending) {
                const approval: PendingApproval = {
                  requestId: `req_${lastStep.metadata?.executionId ?? Date.now()}`,
                  sessionId: activeId,
                  kind,
                  summary: `Action requires confirmation in ${this.stateMachine.getSessionTitle(activeId) ?? 'session'}`,
                  createdAt: Date.now()
                };
                this.stateMachine.onAwaitingApproval(approval, activeId);
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  async getState(): Promise<AgentState> {
    const sessions = await this.listSessions();
    const activeId = this.activeSessionId;

    return {
      sessions,
      activeSessionId: activeId,
      status: this.stateMachine.getStatus(activeId ?? undefined),
      pendingApproval: this.stateMachine.getPendingApproval(activeId ?? undefined)
    };
  }

  async listSessions(): Promise<SessionSummary[]> {
    const sessions: SessionSummary[] = [];
    const seenIds = new Set<string>();

    try {
      const resp = await this.callRpc<GetAllTrajectoriesResponse>('GetAllCascadeTrajectories', {});
      const summaries = resp?.trajectorySummaries ?? {};
      for (const id of Object.keys(summaries)) {
        seenIds.add(id);
        const item = summaries[id];
        const title = item?.summary ?? 'Untitled';
        const lastActivityAt = item?.lastModifiedTime ? new Date(item.lastModifiedTime).getTime() : undefined;
        const status: RunStatus = item?.status === 'CASCADE_RUN_STATUS_RUNNING' ? 'generating' : 'idle';
        const workspace = item?.workspaces?.[0]?.workspaceFolderAbsoluteUri;

        sessions.push({
          id,
          title,
          stepCount: item?.stepCount,
          lastActivityAt,
          status,
          workspace,
          lastModified: lastActivityAt
        });
      }
    } catch {
      if (this.activeSessionId) {
        seenIds.add(this.activeSessionId);
        sessions.push({
          id: this.activeSessionId,
          title: 'Active Session'
        });
      }
    }

    const brainSessions = discoverBrainSessions(this.brainDir, seenIds);
    sessions.push(...brainSessions);

    sessions.sort((a, b) => {
      const timeA = a.lastActivityAt || a.lastModified || 0;
      const timeB = b.lastActivityAt || b.lastModified || 0;
      return timeB - timeA;
    });

    return sessions;
  }

  async focusSession(id: string): Promise<void> {
    if (this.executeCommand) {
      await this.executeCommand('antigravity.setVisibleConversation', id);
    }
    this.activeSessionId = id;
    this.stateMachine.setSessionId(id);
  }

  async createSession(text?: string): Promise<string> {
    const resp = await this.callRpc<StartCascadeResponse>('StartCascade', { source: 1 });
    const cascadeId = resp?.cascadeId;
    if (!cascadeId) {
      throw new Error('StartCascade returned no cascadeId');
    }

    const title = text ? (text.length > 30 ? `${text.slice(0, 30)}...` : text) : 'New Session';
    this.stateMachine.onSessionCreated(cascadeId, title);

    if (text) {
      await this.sendPrompt(text, cascadeId);
    }

    return cascadeId;
  }

  async getMessages(limit: number, sessionId?: string): Promise<ChatMessage[]> {
    const cascadeId = sessionId ?? this.activeSessionId ?? process.env.ANTIGRAVITY_CONVERSATION_ID ?? '';
    if (!cascadeId) {
      return [];
    }

    try {
      const resp = await this.callRpc<GetCascadeTrajectoryResponse>('GetCascadeTrajectory', { cascadeId });
      const steps = resp?.trajectory?.steps ?? [];
      const messages: ChatMessage[] = [];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step) {
          continue;
        }

        if (step.type === 'CORTEX_STEP_TYPE_USER_INPUT' && step.userInput?.userResponse) {
          messages.push({
            id: `user-${step.metadata?.executionId ?? 'u'}-${i}`,
            role: 'user',
            text: step.userInput.userResponse,
            timestamp: step.metadata?.createdAt ? new Date(step.metadata.createdAt).getTime() : Date.now()
          });
        } else if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE' && step.plannerResponse?.response) {
          messages.push({
            id: `agent-${step.plannerResponse.messageId ?? step.metadata?.executionId ?? 'a'}-${i}`,
            role: 'agent',
            text: step.plannerResponse.response,
            timestamp: step.metadata?.createdAt ? new Date(step.metadata.createdAt).getTime() : Date.now()
          });
        }
      }

      if (messages.length === 0) {
        const diskMsgs = readTranscriptMessages(this.brainDir, cascadeId, limit);
        if (diskMsgs.length > 0) return diskMsgs;
      }

      return messages.slice(-limit);
    } catch {
      return readTranscriptMessages(this.brainDir, cascadeId, limit);
    }
  }

  async sendPrompt(text: string, sessionId?: string): Promise<void> {
    if (!this.activeSessionId && !sessionId) {
      await this.pollOnce();
    }
    const cascadeId = sessionId ?? this.activeSessionId ?? process.env.ANTIGRAVITY_CONVERSATION_ID ?? '';
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
      items: [{ text }]
    };

    this.stoppedSessions.delete(cascadeId);
    await this.callRpc('SendUserCascadeMessage', payload);
    this.stateMachine.onGenerating(cascadeId);
    this.stateMachine.onMessageAppended(cascadeId, 'user', text);
  }

  async approve(requestId?: string): Promise<void> {
    const activePending = this.stateMachine.getPendingApproval();
    if (activePending) {
      if (requestId && activePending.requestId !== requestId) {
        throw new Error('STALE_REQUEST');
      }
      const kind = activePending.kind;
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
      this.stateMachine.onGenerating(this.activeSessionId ?? undefined);
      return;
    }

    if (requestId) {
      const bgPending = this.stateMachine.findApprovalByRequestId(requestId);
      if (bgPending && bgPending.sessionId) {
        const targetSessionId = bgPending.sessionId;
        await this.focusSession(targetSessionId);
        await new Promise((r) => setTimeout(r, 150));
        const rechecked = this.stateMachine.getPendingApproval(targetSessionId);
        if (!rechecked || rechecked.requestId !== requestId) {
          throw new Error('STALE_REQUEST');
        }
        const kind = rechecked.kind;
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
        this.stateMachine.onGenerating(targetSessionId);
        return;
      }
    }

    throw new Error('NO_PENDING_APPROVAL');
  }

  async reject(requestId?: string): Promise<void> {
    const activePending = this.stateMachine.getPendingApproval();
    if (activePending) {
      if (requestId && activePending.requestId !== requestId) {
        throw new Error('STALE_REQUEST');
      }
      const kind = activePending.kind;
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
      this.stateMachine.onIdle(this.activeSessionId ?? undefined);
      return;
    }

    if (requestId) {
      const bgPending = this.stateMachine.findApprovalByRequestId(requestId);
      if (bgPending && bgPending.sessionId) {
        const targetSessionId = bgPending.sessionId;
        await this.focusSession(targetSessionId);
        await new Promise((r) => setTimeout(r, 150));
        const rechecked = this.stateMachine.getPendingApproval(targetSessionId);
        if (!rechecked || rechecked.requestId !== requestId) {
          throw new Error('STALE_REQUEST');
        }
        const kind = rechecked.kind;
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
        this.stateMachine.onIdle(targetSessionId);
        return;
      }
    }

    throw new Error('NO_PENDING_APPROVAL');
  }

  async stop(sessionId?: string): Promise<void> {
    const cascadeId = sessionId ?? this.activeSessionId ?? process.env.ANTIGRAVITY_CONVERSATION_ID ?? '';
    if (cascadeId) {
      this.stoppedSessions.add(cascadeId);
      try {
        await this.callRpc('CancelCascadeInvocation', { cascadeId });
      } catch {}
    }
    this.stateMachine.onStopped(cascadeId || undefined);
  }

  onEvent(handler: (e: AgentEvent) => void): Disposable {
    return this.stateMachine.onEvent(handler);
  }

  private async callRpc<T = unknown>(method: string, payload: unknown, isRetry = false): Promise<T> {
    const body = JSON.stringify(payload);
    const mod = this.useTls ? https : http;
    const proto = this.useTls ? 'https' : 'http';
    const url = `${proto}://127.0.0.1:${this.lsPort}/exa.language_server_pb.LanguageServerService/${method}`;

    return new Promise<T>((resolve, reject) => {
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

      req.setTimeout(5000, () => {
        req.destroy(new Error(`RPC ${method} timed out`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.write(body);
      req.end();
    }).catch(async (err) => {
      if (!isRetry) {
        const detected = detectAgyHub();
        if (detected && (detected.port !== this.lsPort || detected.token !== this.csrfToken)) {
          this.lsPort = detected.port;
          this.csrfToken = detected.token;
          return this.callRpc<T>(method, payload, true);
        }
      }
      throw err;
    });
  }
}
