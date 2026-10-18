import type { EventPayload, EventType } from '@vertex-shifa/contracts';
import { outboxEvents, type Transaction } from '@vertex-shifa/db';

/**
 * Writes an event to the transactional outbox in the caller's tenant transaction (ADR 0012,
 * ADR 0020): it is published exactly when the change commits. The type and payload come from the
 * event catalog in `packages/contracts`; payloads hold ids and codes only.
 */
export async function publishEvent<T extends EventType>(
  tx: Transaction,
  tenantId: string,
  type: T,
  payload: EventPayload<T>,
) {
  await tx.insert(outboxEvents).values({ tenantId, type, payload });
}
