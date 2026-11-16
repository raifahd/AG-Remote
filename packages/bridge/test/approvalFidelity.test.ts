import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildInteraction } from '../src/adapters/interactionBuilder.js';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { BridgeServer } from '../src/server.js';
import { TokenManager, PairingManager, MemorySecretStore } from '../src/auth.js';

describe('Approval Fidelity: Proto Interaction Builder', () => {
  it('builds runCommand interaction with submittedCommandLine', () => {
    const payload = buildInteraction(
      {
        kind: 'runCommand',
        command: 'npm run test',
        proposedCommandLine: 'npm run test'
      },
      {
        confirmed: true,
        response: 'npm run test:ci'
      }
    );

    expect(payload.confirmed).toBe(true);
    expect(payload.runCommand?.proposedCommandLine).toBe('npm run test');
    expect(payload.runCommand?.submittedCommandLine).toBe('npm run test:ci');
  });

  it('builds filePermission interaction with path and scope', () => {
    const payload = buildInteraction(
      {
        kind: 'filePermission',
        path: '/workspace/src/index.ts',
        absolutePathUri: 'file:///workspace/src/index.ts'
      },
      {
        confirmed: true,
        scope: 'conversation'
      }
    );

    expect(payload.confirmed).toBe(true);
    expect(payload.filePermission?.absolutePathUri).toBe('file:///workspace/src/index.ts');
    expect(payload.filePermission?.scope).toBe(2);
  });

  it('builds ask_question interaction with selected option', () => {
    const payload = buildInteraction(
      {
        kind: 'ask_question',
        options: ['Yes, proceed', 'No, cancel']
      },
      {
        confirmed: true,
        option: {
          index: 0,
          text: 'Yes, proceed'
        }
      }
    );

    expect(payload.confirmed).toBe(true);
    expect(payload.askQuestion?.selectedOptionIndex).toBe(0);
    expect(payload.askQuestion?.selectedOptionText).toBe('Yes, proceed');
  });

  it('builds rejection payload with reason', () => {
    const payload = buildInteraction(
      {
        kind: 'permission',
        summary: 'Run dangerous migration'
      },
      {
        confirmed: false,
        reason: 'Not ready for production migration'
      }
    );

    expect(payload.confirmed).toBe(false);
    expect(payload.permission?.allow).toBe(false);
    expect(payload.permission?.userDenyInstruction).toBe('Not ready for production migration');
  });
});

describe('Approval Fidelity: BridgeServer HTTP Endpoints', () => {
  it('passes rich approval options and reasons to the adapter', async () => {
    const secretStore = new MemorySecretStore();
    const tokenManager = new TokenManager(secretStore);
    await tokenManager.storeToken('secret-token');

    const adapter = new FakeAdapter();
    const server = new BridgeServer(
      {
        port: 0,
        host: '127.0.0.1',
        version: '0.1.0',
        adapterMode: 'fake'
      },
      adapter,
      tokenManager,
      undefined,
      undefined,
      new PairingManager()
    );

    adapter.setPendingApproval({
      requestId: 'req-123',
      kind: 'runCommand',
      summary: 'Execute build command',
      command: 'npm run build'
    });

    const app = server.getApp();

    const approveRes = await request(app)
      .post('/v1/approve')
      .set('Authorization', 'Bearer secret-token')
      .send({
        requestId: 'req-123',
        scope: 'once',
        response: 'npm run build --prod'
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.ok).toBe(true);
    expect(adapter.getLastApproved()).toEqual({
      requestId: 'req-123',
      scope: 'once',
      response: 'npm run build --prod'
    });
  });
});

