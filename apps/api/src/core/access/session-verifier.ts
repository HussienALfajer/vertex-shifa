import type { TicketPurpose } from '@vertex-shifa/contracts';
import type { DeviceActor, StaffActor, Ticket } from './actor.js';

/** Headers that carry the tokens (spec S02): staff access token, device token, sign-in ticket. */
export const DEVICE_TOKEN_HEADER = 'x-device-token';
export const TICKET_HEADER = 'x-sign-in-ticket';

/**
 * Checks the tokens of a request and answers who sent them, or refuses with a coded error. The
 * identity module provides it (the core imports no module); the access guard calls it.
 */
export interface SessionVerifier {
  /** An access token of an open staff session, rechecked against the database. */
  staff(accessToken: string): Promise<StaffActor>;
  /** A device token of a registered device; a revoked device only with `allowRevoked`. */
  device(deviceToken: string, options: { allowRevoked: boolean }): Promise<DeviceActor>;
  /**
   * A sign-in ticket for `purpose`, not yet used. The service that acts on it uses it up, once its
   * input is valid, so a refused password does not cost the person their ticket.
   */
  ticket(ticket: string, purpose: TicketPurpose): Ticket;
}

export const SESSION_VERIFIER = Symbol('SessionVerifier');
