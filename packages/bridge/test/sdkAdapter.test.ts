import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { SdkAdapter } from '../src/adapters/SdkAdapter.js';
import { AgentStateMachine } from '../src/stateMachine.js';

describe('SdkAdapter', () => {
  let mockLsServer: http.Server;
  let receivedRpc: Array<{ method: string; payload: any }> = [];
  let trajectoryStatus = 'CASCADE_RUN_STATUS_RUNNING';
  const mockLsPort = 49153;
  let adapter: SdkAdapter;
  let stateMachine: AgentStateMachine;

  beforeAll(async () => {
    mockLsServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', () => {
        const url = req.url ?? '';
        const method = url.split('/').pop() ?? '';
        const payload = body ? JSON.parse(body) : {};
        receivedRpc.push({ method, payload });

        if (method === 'CancelCascadeInvocation') {
          trajectoryStatus = 'CASCADE_RUN_STATUS_IDLE';
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (method === 'GetAllCascadeTrajectories') {
          res.end(
            JSON.stringify({
              trajectorySummaries: {
                'traj-1': {
                  summary: 'Trajectory One',
                  stepCount: 15,
                  status: trajectoryStatus,
                  lastModifiedTime: new Date().toISOString()
                }
              }
            })
          );
        } else {
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });

    await new Promise<void>((resolve) => mockLsServer.listen(mockLsPort, '127.0.0.1', () => resolve()));

    stateMachine = new AgentStateMachine();
    adapter = new SdkAdapter(stateMachine, {
      lsPort: mockLsPort,
      csrfToken: 'test-token',
      pollIntervalMs: 100
    });
  });

  afterAll(async () => {
    adapter.stopPolling();
    await new Promise<void>((resolve) => mockLsServer.close(() => resolve()));
  });

  it('reads state from Language Server ConnectRPC', async () => {
    const state = await adapter.getState();
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0]?.title).toBe('Trajectory One');
  });

  it('sends prompt through SendUserCascadeMessage', async () => {
    receivedRpc = [];
    await adapter.sendPrompt('Analyze this bug');
    expect(receivedRpc.some((r) => r.method === 'SendUserCascadeMessage')).toBe(true);
    expect(stateMachine.getStatus()).toBe('generating');
  });

  it('stops running generation through CancelCascadeInvocation', async () => {
    receivedRpc = [];
    await adapter.stop();
    expect(receivedRpc.some((r) => r.method === 'CancelCascadeInvocation')).toBe(true);
    expect(stateMachine.getStatus()).toBe('idle');
  });
});

