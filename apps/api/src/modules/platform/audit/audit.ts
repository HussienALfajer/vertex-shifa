import type { AuditAction } from '@vertex-shifa/contracts';
import { auditEntries, type Transaction } from '@vertex-shifa/db';
import type { Actor } from '../../../core/access/actor.js';

export type AuditInput = {
  actor: Actor;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** Free text from staff (a status change's reason): stored here, never logged. */
  reason?: string;
};

/**
 * Writes an audit entry in the caller's tenant transaction, so the change and its entry commit
 * together (ADR 0016, ADR 0020). Entries hold ids and codes, never medical content.
 */
export async function recordAudit(tx: Transaction, tenantId: string, input: AuditInput) {
  const { actor } = input;
  await tx.insert(auditEntries).values({
    tenantId,
    actorKind: actor.kind,
    actorId:
      actor.kind === 'staff' ? actor.staffId : actor.kind === 'platform' ? actor.userId : null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    occurredAt: new Date(),
  });
}
