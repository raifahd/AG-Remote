import { describe, it, expect } from 'vitest';
import { FakeAdapter } from '../src/adapters/FakeAdapter.js';
import { AgentEvent } from '@ag-remote/shared';

describe('FakeAdapter', () => {
  it('manages state transitions, messages, and events', async () => {
    const adapter = new FakeAdapter();
    const events: AgentEvent[] = [];

    const sub = adapter.onEvent((e) => events.push(e));

    const initial = await adapter.getState();
    expect(initial.status).toBe('idle');
    expect(initial.pendingApproval).toBeNull();

    await adapter.sendPrompt('Analyze code');
    const generating = await adapter.getState();
    expect(generating.status).toBe('generating');

    const msgs = await adapter.getMessages(10);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.text).toBe('Analyze code');

    adapter.simulateApprovalRequest('req-1', 'terminal', 'Execute rm -rf /tmp/test');
    const waiting = await adapter.getState();
    expect(waiting.status).toBe('awaiting_approval');
    expect(waiting.pendingApproval?.requestId).toBe('req-1');

    await adapter.approve();
    const approved = await adapter.getState();
    expect(approved.status).toBe('generating');
    expect(approved.pendingApproval).toBeNull();

    adapter.simulateRunFinished();
    const finished = await adapter.getState();
    expect(finished.status).toBe('idle');

    expect(events.some((e) => e.type === 'run_finished')).toBe(true);
    expect(events.some((e) => e.type === 'approval_requested')).toBe(true);

    sub.dispose();
  });
});

