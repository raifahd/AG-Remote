import { describe, it, expect } from 'vitest';
import {
  PromptRequestSchema,
  ApproveRequestSchema,
  HealthResponseSchema,
  AgentEventSchema
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
});

