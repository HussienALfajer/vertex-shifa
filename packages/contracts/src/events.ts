import { z } from 'zod';

/**
 * The event catalog (ADR 0012, ADR 0020): every event a module writes to the outbox, by type
 * `<entity>.<past-tense verb>.v<version>`, with its payload schema. Payloads hold ids and codes,
 * never personal or medical data (ADR 0016). A type is never changed once published: a new
 * payload is a new version.
 */
export const eventCatalog = {
  /** An invitation was created or resent (spec S02); S03 sends the invitation message. */
  'staff.invitation_created.v1': z.object({ tenantId: z.uuid(), membershipId: z.uuid() }),
} as const;

export type EventType = keyof typeof eventCatalog;

export type EventPayload<T extends EventType> = z.infer<(typeof eventCatalog)[T]>;
