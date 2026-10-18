import type { AuditAction } from '@vertex-shifa/contracts';
import { auditEntries, platformAuditEntries, type Transaction } from '@vertex-shifa/db';
import type { PlatformActor, SystemActor } from '../../../core/access/actor.js';

/**
 * Who a tenant audit entry names: a staff member (and the computer they used), Vertex staff or the
 * system. A signed-in `StaffActor` is one; so is a member acting while signing in.
 */
export type AuditActor =
  | { kind: 'staff'; membershipId: string; deviceId: string | null }
  | Pick<PlatformActor, 'kind' | 'userId'>
  | SystemActor;

export type AuditInput = {
  actor: AuditActor;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** Free text from staff (a status change's reason): stored here, never logged. */
  reason?: string;
};

function actorId(actor: AuditActor): string | null {
  if (actor.kind === 'staff') return actor.membershipId;
  return actor.kind === 'platform' ? actor.userId : null;
}

/**
 * Writes an audit entry in the caller's tenant transaction, so the change and its entry commit
 * together (ADR 0016, ADR 0020). Entries hold ids and codes, never medical content.
 */
export async function recordAudit(tx: Transaction, tenantId: string, input: AuditInput) {
  const { actor } = input;
  await tx.insert(auditEntries).values({
    tenantId,
    actorKind: actor.kind,
    actorId: actorId(actor),
    deviceId: actor.kind === 'staff' ? actor.deviceId : null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    occurredAt: new Date(),
  });
}

/**
 * Who a platform audit entry names: a person changing their own account (by account id), Vertex
 * staff in the console, or the system (CLI).
 */
export type PlatformAuditActor =
  | { kind: 'staff'; accountId: string; deviceId?: string | null }
  | Pick<PlatformActor, 'kind' | 'userId'>
  | SystemActor;

export type PlatformAuditInput = {
  actor: PlatformAuditActor;
  action: AuditAction;
  entityType: string;
  /** Null for a console request that names no single entity (a list). */
  entityId: string | null;
  reason?: string;
  /** The tenant a console action concerns. */
  subjectTenantId?: string | null;
  /** The console route id, never the body. */
  requestRoute?: string;
};

/**
 * Writes a platform audit entry (ADR 0016, spec S02): account-level changes without a tenant and
 * console requests, in the caller's transaction.
 */
export async function recordPlatformAudit(tx: Transaction, input: PlatformAuditInput) {
  const { actor } = input;
  await tx.insert(platformAuditEntries).values({
    actorKind: actor.kind,
    actorId:
      actor.kind === 'staff' ? actor.accountId : actor.kind === 'platform' ? actor.userId : null,
    deviceId: actor.kind === 'staff' ? (actor.deviceId ?? null) : null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    reason: input.reason,
    subjectTenantId: input.subjectTenantId,
    requestRoute: input.requestRoute,
    occurredAt: new Date(),
  });
}
