import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import {
  DomainError,
  type PermissionKey,
  permissionCatalog,
  type Role,
  type TicketPurpose,
} from '@vertex-shifa/contracts';

/**
 * Who makes a request or a change, as services and the audit log see it (ADR 0005, ADR 0016).
 * The tenant of a staff or device actor comes from a verified token, never from the request
 * (ADR 0004).
 */
export type StaffActor = {
  kind: 'staff';
  tenantId: string;
  membershipId: string;
  accountId: string;
  /** The staff session of the access token. */
  sessionId: string;
  /** The registered computer the session was opened on, and its branch (null while onboarding). */
  deviceId: string;
  facilityId: string | null;
  roles: Role[];
  /** Effective permissions (`effectivePermissions`); branch-scoped ones apply in the scope only. */
  permissions: PermissionKey[];
  allFacilities: boolean;
  /** The member's branches when `allFacilities` is false. */
  facilityIds: string[];
};

/** Vertex staff in the console. */
export type PlatformActor = { kind: 'platform'; userId: string };

/** The API CLI and jobs, run by Vertex staff with server access. */
export type SystemActor = { kind: 'system' };

export type Actor = StaffActor | PlatformActor | SystemActor;

/** A registered clinic computer, from its device token (spec S02 rule 23). */
export type DeviceActor = {
  kind: 'device';
  tenantId: string;
  deviceId: string;
  facilityId: string | null;
  status: 'active' | 'revoked';
};

/** A verified sign-in ticket: the account that proved its password or OTP. */
export type Ticket = {
  id: string;
  purpose: TicketPurpose;
  accountId: string;
  /** Set when the ticket came from a sign-in on a registered device: it is valid there only. */
  deviceId: string | null;
  tenantId: string | null;
};

/**
 * Whether the member holds `permission`, and, for a branch-scoped one with `facilityId`, holds it
 * in that branch (spec S02 rule 7).
 */
export function holds(actor: StaffActor, permission: PermissionKey, facilityId?: string): boolean {
  if (!actor.permissions.includes(permission)) return false;
  if (!permissionCatalog[permission].branchScoped || facilityId === undefined) return true;
  return actor.allFacilities || actor.facilityIds.includes(facilityId);
}

/** The request properties the access guard sets once it has checked the tokens. */
export type AuthenticatedRequest = {
  actor?: StaffActor | PlatformActor;
  device?: DeviceActor;
  ticket?: Ticket;
};

function actorOf<K extends 'staff' | 'platform'>(kind: K, context: ExecutionContext) {
  const { actor } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (actor?.kind !== kind) throw new DomainError('UNAUTHENTICATED', 'No session');
  return actor as Extract<Actor, { kind: K }>;
}

/** The signed-in clinic staff member of a `@StaffRoute`. */
export const CurrentStaff = createParamDecorator((_: unknown, context: ExecutionContext) =>
  actorOf('staff', context),
);

/** The signed-in Vertex staff member of a `@ConsoleRoute`. */
export const CurrentPlatformUser = createParamDecorator((_: unknown, context: ExecutionContext) =>
  actorOf('platform', context),
);

/** The registered computer of a `@DeviceRoute`. */
export const CurrentDevice = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const { device } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!device) throw new DomainError('UNAUTHENTICATED', 'No device token');
  return device;
});

/** The sign-in ticket of a `@TicketRoute` or a `@DeviceRoute({ ticket })`. */
export const CurrentTicket = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const { ticket } = context.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!ticket) throw new DomainError('TICKET_INVALID', 'No ticket');
  return ticket;
});
