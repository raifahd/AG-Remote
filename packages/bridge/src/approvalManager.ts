import crypto from 'crypto';
import { PendingApproval, ApprovalKind } from '@ag-remote/shared';

export class ApprovalManager {
  private currentApproval: PendingApproval | null = null;

  createApproval(kind: ApprovalKind, summary: string): PendingApproval {
    const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
    const approval: PendingApproval = {
      requestId,
      kind,
      summary,
      createdAt: Date.now()
    };
    this.currentApproval = approval;
    return approval;
  }

  getCurrentApproval(): PendingApproval | null {
    return this.currentApproval;
  }

  validateRequest(requestId: string): { valid: true } | { valid: false; reason: 'NO_PENDING_APPROVAL' | 'STALE_REQUEST' } {
    if (!this.currentApproval) {
      return { valid: false, reason: 'NO_PENDING_APPROVAL' };
    }
    if (this.currentApproval.requestId !== requestId) {
      return { valid: false, reason: 'STALE_REQUEST' };
    }
    return { valid: true };
  }

  resolve(): PendingApproval | null {
    const resolved = this.currentApproval;
    this.currentApproval = null;
    return resolved;
  }

  clear(): void {
    this.currentApproval = null;
  }
}

