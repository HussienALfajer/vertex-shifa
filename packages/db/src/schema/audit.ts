import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, idIsUuidV7, tenantId, timestamptz } from './columns.js';

/**
 * Append-only audit log (ADR 0016): changes to clinical, money, access, configuration and
 * contract data, and every read of a medical record. Rows are written in the same transaction as
 * the change and are never updated or deleted (trigger and grants in the custom migration).
 * Entries hold ids, never medical content.
 */
export const auditEntries = pgTable(
  'audit_entries',
  {
    id: id(),
    tenantId: tenantId(),
    actorKind: text().notNull(),
    actorId: uuid(),
    deviceId: uuid(),
    /** What happened, as `<entity>.<verb>`: `patient_chart.read`, `appointment.booked`. */
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    /** Required by break-glass access; free text written by staff, so never sent to logs. */
    reason: text(),
    /** When it happened: the device's time for actions recorded offline. */
    occurredAt: timestamptz().notNull(),
    /** When the server stored it. */
    createdAt: createdAt(),
  },
  (t) => [
    idIsUuidV7('audit_entries', t.id),
    check(
      'audit_entries_actor_kind',
      sql`${t.actorKind} in ('staff', 'patient', 'platform', 'system')`,
    ),
    index('audit_entries_tenant_occurred_idx').on(t.tenantId, t.occurredAt),
    index('audit_entries_tenant_entity_idx').on(t.tenantId, t.entityType, t.entityId, t.occurredAt),
  ],
);

/**
 * Append-only platform audit log (ADR 0016, spec S02): every console request and every
 * account-level change that has no tenant. Same shape as `audit_entries` without `tenant_id`;
 * console actions on a tenant also write that tenant's `audit_entries`. Holds ids and route ids,
 * never request bodies.
 */
export const platformAuditEntries = pgTable(
  'platform_audit_entries',
  {
    id: id(),
    /** `platform` (console), `staff` (a person's own account change), `system` (CLI). */
    actorKind: text().notNull(),
    actorId: uuid(),
    deviceId: uuid(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    /** Free text written by Vertex staff, so never sent to logs. */
    reason: text(),
    /** The tenant a console action concerns. */
    subjectTenantId: uuid(),
    /** The console route id (`POST /api/console/tenants/:id/status`), never the body. */
    requestRoute: text(),
    occurredAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    idIsUuidV7('platform_audit_entries', t.id),
    check(
      'platform_audit_entries_actor_kind',
      sql`${t.actorKind} in ('platform', 'staff', 'system')`,
    ),
    index('platform_audit_entries_occurred_idx').on(t.occurredAt),
    index('platform_audit_entries_subject_tenant_idx').on(t.subjectTenantId, t.occurredAt),
    index('platform_audit_entries_actor_idx').on(t.actorId, t.occurredAt),
    index('platform_audit_entries_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
  ],
);
