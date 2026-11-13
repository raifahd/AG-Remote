import { describe, it, expect } from 'vitest';
import {
  PromptRequestSchema,
  ApproveRequestSchema,
  HealthResponseSchema,
  AgentEventSchema,
  QuietHoursSettingsSchema,
  ChatMessageSchema,
  StatusChangedEventSchema
} from '../src/schemas.js';

describe('Shared Schemas', () => {
  it('validates a valid prompt request and rejects unknown fields', () => {
    const valid = { text: 'Hello world' };
    expect(PromptRequestSchema.parse(valid)).toEqual(valid);

    const withExtra = { text: 'Hello', extra: 123 };
    expect(() => PromptRequestSchema.parse(withExtra)).toThrow();
  });

  it('validates approve request', () => {
    const valid = { requestId: 'req-123' };
    expect(ApproveRequestSchema.parse(valid)).toEqual(valid);

    const empty = { requestId: '' };
    expect(() => ApproveRequestSchema.parse(empty)).toThrow();
  });

  it('validates health response', () => {
    const valid = {
      status: 'ok' as const,
      version: '0.1.0',
      adapterMode: 'fake' as const,
      hostOs: 'linux',
      hostname: 'test-host',
      tailscaleIp: '100.69.62.84'
    };
    expect(HealthResponseSchema.parse(valid)).toEqual(valid);
  });

  it('validates health response with degraded reason', () => {
    const valid = {
      status: 'degraded' as const,
      degradedReason: 'Running without debug port',
      version: '0.1.0',
      adapterMode: 'fake' as const,
      hostOs: 'linux',
      hostname: 'test-host',
      tailscaleIp: '100.69.62.84'
    };
    expect(HealthResponseSchema.parse(valid)).toEqual(valid);
  });

  it('validates quiet hours settings schema', () => {
    const valid = {
      enabled: true,
      startHour: 22,
      endHour: 7
    };
    expect(QuietHoursSettingsSchema.parse(valid)).toEqual(valid);

    const invalidHour = {
      enabled: true,
      startHour: 25,
      endHour: 7
    };
    expect(() => QuietHoursSettingsSchema.parse(invalidHour)).toThrow();
  });

  it('validates agent events via discriminated union', () => {
    const event = {
      type: 'run_finished' as const,
      sessionId: 'sess-1',
      at: 1000
    };
    expect(AgentEventSchema.parse(event)).toEqual(event);

    const invalid = {
      type: 'unknown_event',
      at: 1000
    };
    expect(() => AgentEventSchema.parse(invalid)).toThrow();
  });

  it('validates chat messages with kind, thinking, and tool execution fields', () => {
    const toolMsg = {
      id: 'msg-tool-1',
      role: 'agent' as const,
      text: 'ls -la',
      timestamp: Date.now(),
      kind: 'tool' as const,
      title: 'Run terminal command',
      toolName: 'run_command',
      toolArgs: '{"CommandLine":"ls -la"}',
      toolSummary: 'List directory contents',
      toolStatus: 'done' as const
    };
    expect(ChatMessageSchema.parse(toolMsg)).toEqual(toolMsg);

    const thoughtMsg = {
      id: 'msg-th-1',
      role: 'agent' as const,
      text: 'Checking files...',
      timestamp: Date.now(),
      kind: 'thought' as const,
      thinking: 'Looking into the package.json dependencies.'
    };
    expect(ChatMessageSchema.parse(thoughtMsg)).toEqual(thoughtMsg);
  });

  it('validates status changed event with action and thinking', () => {
    const event = {
      type: 'status_changed' as const,
      status: 'generating' as const,
      sessionId: 'sess-abc',
      action: 'Editing src/index.ts',
      thinking: 'Refactoring the function parameters',
      at: Date.now()
    };
    expect(StatusChangedEventSchema.parse(event)).toEqual(event);
  });
});
