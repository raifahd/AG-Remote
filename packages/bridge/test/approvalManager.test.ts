import { describe, it, expect } from 'vitest';
import { ApprovalManager } from '../src/approvalManager.js';

describe('ApprovalManager', () => {
  it('creates an approval with unique requestId and stores it', () => {
    const mgr = new ApprovalManager();
    expect(mgr.getCurrentApproval()).toBeNull();

    const app = mgr.createApproval('terminal', 'Execute bash command');
    expect(app.requestId.startsWith('req_')).toBe(true);
    expect(app.kind).toBe('terminal');
    expect(app.summary).toBe('Execute bash command');
    expect(mgr.getCurrentApproval()).toEqual(app);
  });

  it('validates requestId accurately and rejects stale/missing IDs', () => {
    const mgr = new ApprovalManager();
    const noAppResult = mgr.validateRequest('req_any');
    expect(noAppResult.valid).toBe(false);
    if (!noAppResult.valid) {
      expect(noAppResult.reason).toBe('NO_PENDING_APPROVAL');
    }

    const app = mgr.createApproval('edit', 'Edit file');
    const staleResult = mgr.validateRequest('req_wrong');
    expect(staleResult.valid).toBe(false);
    if (!staleResult.valid) {
      expect(staleResult.reason).toBe('STALE_REQUEST');
    }

    const validResult = mgr.validateRequest(app.requestId);
    expect(validResult.valid).toBe(true);
  });

  it('resolves and clears approval', () => {
    const mgr = new ApprovalManager();
    const app = mgr.createApproval('tool', 'Run MCP tool');
    const resolved = mgr.resolve();
    expect(resolved).toEqual(app);
    expect(mgr.getCurrentApproval()).toBeNull();
  });
});

