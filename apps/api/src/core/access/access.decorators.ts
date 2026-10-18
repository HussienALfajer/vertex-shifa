import type { PermissionKey, PlatformPermissionKey, TicketPurpose } from '@vertex-shifa/contracts';

/**
 * What each route declares, read by `AccessGuard` and checked by the architecture test (ADR 0005,
 * ADR 0013, ADR 0020): exactly one access decorator and exactly one entitlement decorator, on the
 * handler or on its controller (the handler's wins).
 */

/**
 * Who may call the route. A staff route listing several permissions admits a member holding any of
 * them; one listing none admits every signed-in member. A branch-scoped permission admits the
 * member here if they hold it in any branch: the service checks the branch of the resource.
 */
export type Access =
  | { kind: 'public' }
  | { kind: 'patient' }
  | { kind: 'staff'; permissions: PermissionKey[] }
  | { kind: 'console'; permission: PlatformPermissionKey | null; reauth: boolean }
  | { kind: 'console-sign-in' }
  | { kind: 'device'; allowRevoked: boolean; ticket: TicketPurpose | null }
  | { kind: 'ticket'; purpose: TicketPurpose };

/** The commercial feature the tenant needs (S05), or none for routes outside any package. */
export type Entitlement = { kind: 'feature'; feature: string } | { kind: 'none' };

export const ACCESS = Symbol('Access');
export const ENTITLEMENT = Symbol('Entitlement');

function declare(key: symbol, value: Access | Entitlement): ClassDecorator & MethodDecorator {
  return ((target: object, property?: string | symbol, descriptor?: PropertyDescriptor) => {
    const holder: object = descriptor?.value ?? target;
    if (Reflect.hasOwnMetadata(key, holder)) {
      const name = property === undefined ? (target as { name: string }).name : String(property);
      throw new Error(`${name} declares its ${key.description?.toLowerCase()} twice`);
    }
    Reflect.defineMetadata(key, value, holder);
  }) as ClassDecorator & MethodDecorator;
}

/** Anyone, signed in or not. */
export const Public = () => declare(ACCESS, { kind: 'public' });

/** A signed-in patient, through the patient app. */
export const PatientRoute = () => declare(ACCESS, { kind: 'patient' });

/**
 * A clinic staff member signed in on a device (access token), whose effective permissions in the
 * session's tenant include one of `permissions`, or any member when none is listed.
 */
export const StaffRoute = (...permissions: PermissionKey[]) =>
  declare(ACCESS, { kind: 'staff', permissions });

/**
 * A platform user signed in to the console (session cookie) whose role holds `permission`, or any
 * platform user when none is given; with `reauth`, a sensitive action that needs a TOTP code
 * entered in the last 5 minutes (spec S02 rule 38). The route lives under `/api/console/`, and a
 * write must come from the console's origin (rule 39).
 */
export const ConsoleRoute = (
  permission?: PlatformPermissionKey,
  options: { reauth?: boolean } = {},
) =>
  declare(ACCESS, {
    kind: 'console',
    permission: permission ?? null,
    reauth: options.reauth ?? false,
  });

/**
 * A step of signing in to the console, before any session: public, under `/api/console/`, and a
 * write from the console's origin only (rule 39).
 */
export const ConsoleSignInRoute = () => declare(ACCESS, { kind: 'console-sign-in' });

/**
 * A registered clinic computer (device token), without a member. `allowRevoked` admits a revoked
 * device (to confirm its wipe); `ticket` also needs a sign-in ticket for that purpose.
 */
export const DeviceRoute = (options: { allowRevoked?: boolean; ticket?: TicketPurpose } = {}) =>
  declare(ACCESS, {
    kind: 'device',
    allowRevoked: options.allowRevoked ?? false,
    ticket: options.ticket ?? null,
  });

/** A person in the middle of signing in, holding a valid ticket for `purpose`. */
export const TicketRoute = (purpose: TicketPurpose) => declare(ACCESS, { kind: 'ticket', purpose });

/** The tenant's contract must include `feature`. */
export const RequiresFeature = (feature: string) =>
  declare(ENTITLEMENT, { kind: 'feature', feature });

/** The route belongs to no commercial feature (health check, sign-in, console). */
export const NoFeature = () => declare(ENTITLEMENT, { kind: 'none' });
