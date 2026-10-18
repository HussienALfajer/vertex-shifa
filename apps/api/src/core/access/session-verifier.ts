import type { PlatformPermissionKey, TicketPurpose } from '@vertex-shifa/contracts';
import type { DeviceActor, PlatformActor, StaffActor, Ticket } from './actor.js';

/** Headers that carry the tokens (spec S02): staff access token, device token, sign-in ticket. */
export const DEVICE_TOKEN_HEADER = 'x-device-token';
export const TICKET_HEADER = 'x-sign-in-ticket';

/**
 * The console session cookie (spec S02 rule 39): `HttpOnly`, `Secure`, `SameSite=Strict`, scoped
 * to `/api/console/`. The `__Secure-` prefix makes browsers refuse it without `Secure`.
 */
export const CONSOLE_SESSION_COOKIE = '__Secure-vertex-console';

/** A console request as its platform audit row names it (rule 41): route id and path ids. */
export type ConsoleRequest = {
  /** `POST /api/console/tenants/:id/status`: the route, never the values. */
  route: string;
  params: Record<string, string | undefined>;
};

/**
 * Checks the tokens of a request and answers who sent them, or refuses with a coded error. The
 * identity module provides it (the core imports no module); the access guard calls it.
 */
export interface SessionVerifier {
  /** An access token of an open staff session, rechecked against the database. */
  staff(accessToken: string): Promise<StaffActor>;
  /**
   * A console session token, rechecked against the database (rules 37–39): open, within 12 hours
   * and 30 minutes of the last request, its user active. The request is written to the platform
   * audit (rule 41) before the role's `permission`, the 5-minute `reauth` and `fromConsole` (a read,
   * or a write from the console's origin, rule 39) are checked, so a refused request is recorded
   * too; a refused write from another origin does not count as activity for the idle limit.
   */
  console(
    sessionToken: string,
    check: { permission: PlatformPermissionKey | null; reauth: boolean; fromConsole: boolean },
    request: ConsoleRequest,
  ): Promise<PlatformActor>;
  /** A device token of a registered device; a revoked device only with `allowRevoked`. */
  device(deviceToken: string, options: { allowRevoked: boolean }): Promise<DeviceActor>;
  /**
   * A sign-in ticket for `purpose`, not yet used. The service that acts on it uses it up, once its
   * input is valid, so a refused password does not cost the person their ticket.
   */
  ticket(ticket: string, purpose: TicketPurpose): Ticket;
}

export const SESSION_VERIFIER = Symbol('SessionVerifier');
