import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { DomainError } from '@vertex-shifa/contracts';

/**
 * Who makes a request or a change, as services and the audit log see it (ADR 0005, ADR 0016).
 * The tenant of a staff actor comes from the session, never from the request (ADR 0004).
 */
export type StaffActor = { kind: 'staff'; tenantId: string; staffId: string };

/** Vertex staff in the console. */
export type PlatformActor = { kind: 'platform'; userId: string };

/** The API CLI and jobs, run by Vertex staff with server access. */
export type SystemActor = { kind: 'system' };

export type Actor = StaffActor | PlatformActor | SystemActor;

/** The request property the session guard (S02) sets once it has checked the session. */
type AuthenticatedRequest = { actor?: StaffActor | PlatformActor };

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
