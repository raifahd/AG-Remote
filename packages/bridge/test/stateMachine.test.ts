import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentStateMachine } from '../src/stateMachine.js';
import { AgentEvent } from '@ag-remote/shared';

describe('AgentStateMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes to idle with no pending approvals', () => {
    const sm = new AgentStateMachine();
    expect(sm.getStatus()).toBe('idle');
    expect(sm.getPendingApproval()).toBeNull();
  });

  it('debounces transition from generating to idle', () => {
    const sm = new AgentStateMachine({ debounceMs: 1000 });
    const events: AgentEvent[] = [];
    sm.onEvent((e) => events.push(e));

    sm.onGenerating('sess-1');
    expect(sm.getStatus()).toBe('generating');
    expect(events.filter((e) => e.type === 'status_changed')).toHaveLength(1);

    sm.onIdle('sess-1');
    expect(sm.getStatus()).toBe('generating');

    vi.advanceTimersByTime(500);
    expect(sm.getStatus()).toBe('generating');

    sm.onGenerating('sess-1');
    vi.advanceTimersByTime(600);
    expect(sm.getStatus()).toBe('generating');

    sm.onIdle('sess-1');
    vi.advanceTimersByTime(1001);
    expect(sm.getStatus()).toBe('idle');

    const finished = events.find((e) => e.type === 'run_finished');
    expect(finished).toBeDefined();
    if (finished && finished.type === 'run_finished') {
      expect(finished.sessionId).toBe('sess-1');
    }
  });

  it('immediately transitions to awaiting_approval and emits event', () => {
    const sm = new AgentStateMachine();
    const events: AgentEvent[] = [];
    sm.onEvent((e) => events.push(e));

    sm.onGenerating('sess-1');

    const approval = {
      requestId: 'req-42',
      kind: 'terminal' as const,
      summary: 'Run npm install',
      createdAt: Date.now()
    };

    sm.onAwaitingApproval(approval, 'sess-1');
    expect(sm.getStatus()).toBe('awaiting_approval');
    expect(sm.getPendingApproval()).toEqual(approval);

    const reqEvent = events.find((e) => e.type === 'approval_requested');
    expect(reqEvent).toBeDefined();
    if (reqEvent && reqEvent.type === 'approval_requested') {
      expect(reqEvent.requestId).toBe('req-42');
      expect(reqEvent.kind).toBe('terminal');
    }
  });

  it('handles bridge error transitions', () => {
    const sm = new AgentStateMachine();
    const events: AgentEvent[] = [];
    sm.onEvent((e) => events.push(e));

    sm.onError('Connection refused');
    expect(sm.getStatus()).toBe('error');

    const errEvent = events.find((e) => e.type === 'bridge_error');
    expect(errEvent).toBeDefined();
  });

  it('tracks action and thinking per session during generating state', () => {
    const sm = new AgentStateMachine();
    const events: AgentEvent[] = [];
    sm.onEvent((e) => events.push(e));

    sm.onGenerating('sess-1', 'Main Task', 'Running tests', 'Analyzing output files');
    expect(sm.getStatus()).toBe('generating');
    expect(sm.getSessionAction('sess-1')).toBe('Running tests');
    expect(sm.getSessionThinking('sess-1')).toBe('Analyzing output files');

    const statusEvent = events.find((e) => e.type === 'status_changed' && e.sessionId === 'sess-1');
    expect(statusEvent).toBeDefined();
    if (statusEvent && statusEvent.type === 'status_changed') {
      expect(statusEvent.action).toBe('Running tests');
      expect(statusEvent.thinking).toBe('Analyzing output files');
    }

    sm.onIdle('sess-1');
    vi.advanceTimersByTime(2500);
    expect(sm.getSessionAction('sess-1')).toBeUndefined();
    expect(sm.getSessionThinking('sess-1')).toBeUndefined();
  });
});

