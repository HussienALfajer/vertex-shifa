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
