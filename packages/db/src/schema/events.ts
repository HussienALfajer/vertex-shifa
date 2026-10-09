import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { createdAt, id, idIsUuidV7, tenantId, timestamptz, updatedAt } from './columns.js';

/**
 * Transactional outbox (ADR 0012, 0020): a state change writes its event here in the same
 * transaction; the worker's dispatcher hands pending events to pg-boss and sets `dispatched_at`.
 * A work queue, not append-only. The payload holds ids and codes only, never medical content
 * (ADR 0016).
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: id(),
    tenantId: tenantId(),
    /** `<entity>.<past-tense verb>`: `appointment.booked`. */
    type: text().notNull(),
    payload: jsonb().notNull(),
    dispatchedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [idIsUuidV7('outbox_events', t.id)],
);
