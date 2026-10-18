import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import {
  consolePolicy,
  DomainError,
  type PlatformPermissionKey,
  type PlatformRole,
  platformRoleHolds,
} from '@vertex-shifa/contracts';
import { type Database, platformSessions, platformUsers, type Transaction } from '@vertex-shifa/db';
import { and, eq, isNull, ne, type SQL } from 'drizzle-orm';
import { map, type Observable } from 'rxjs';
import { z } from 'zod';
import type { PlatformActor } from '../../../core/access/actor.js';
import {
  CONSOLE_SESSION_COOKIE,
  type ConsoleRequest,
} from '../../../core/access/session-verifier.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { recordPlatformAudit } from '../audit/index.js';
import { KeyedHash, randomToken } from './secrets.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export type ConsoleSessionEndReason =
  | 'signed_out'
  | 'expired'
  | 'idle'
  | 'user_disabled'
  | 'user_reset'
  | 'password_changed'
  | 'reauth_failed';

/** A new console session: the token for the cookie, never stored in clear. */
export type NewConsoleSession = { id: string; token: string; expiresAt: Date };

const ended = () => new DomainError('SESSION_ENDED', 'The console session has ended');

/** Ends the console sessions matching `where` that are still open. */
export async function endConsoleSessions(
  tx: Transaction | Database,
  where: SQL | undefined,
  reason: ConsoleSessionEndReason,
  now: Date,
) {
  await tx
    .update(platformSessions)
    .set({ endedAt: now, endReason: reason, updatedAt: now })
    .where(and(where, isNull(platformSessions.endedAt)));
}

/** The open sessions of a platform user, except `keepSessionId`. */
export function sessionsOfUser(userId: string, keepSessionId?: string) {
  return and(
    eq(platformSessions.platformUserId, userId),
    keepSessionId ? ne(platformSessions.id, keepSessionId) : undefined,
  );
}

/** The resource a console route acts on, by its first path segment after `/api/console/`. */
const consoleEntities: Record<string, string> = {
  tenants: 'tenant',
  accounts: 'account',
  'platform-users': 'platform_user',
  me: 'platform_user',
};

const uuid = z.uuid();

/**
 * Console sessions (spec S02 rules 37–39): opened after a TOTP or a recovery code, 12 hours at most,
 * ended after 30 minutes without a request, the token kept in an `HttpOnly` cookie and stored as a
 * keyed hash. Each request is checked here and written to the platform audit (rule 41).
 */
@Injectable()
export class ConsoleSessions {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KeyedHash) private readonly hashes: KeyedHash,
  ) {}

  /** Opens a session; `reauthenticated` when it starts with a TOTP code (rule 38). */
  async open(
    tx: Transaction,
    userId: string,
    now: Date,
    reauthenticated: boolean,
  ): Promise<NewConsoleSession> {
    const token = randomToken();
    const expiresAt = new Date(now.getTime() + consolePolicy.sessionMaxHours * HOUR_MS);
    const [row] = await tx
      .insert(platformSessions)
      .values({
        platformUserId: userId,
        tokenHash: this.hash(token),
        expiresAt,
        lastSeenAt: now,
        reauthenticatedAt: reauthenticated ? now : null,
      })
      .returning({ id: platformSessions.id });
    if (!row) throw new Error('The console session was not stored');
    return { id: row.id, token, expiresAt };
  }

  /** The user's open session of `token`, without touching it (sign-out). */
  async find(token: string) {
    const [row] = await this.db
      .select()
      .from(platformSessions)
      .where(
        and(eq(platformSessions.tokenHash, this.hash(token)), isNull(platformSessions.endedAt)),
      );
    return row;
  }

  /** The session verifier's console check (`SessionVerifier.console`). */
  async verify(
    token: string,
    check: { permission: PlatformPermissionKey | null; reauth: boolean; fromConsole: boolean },
    request: ConsoleRequest,
  ): Promise<PlatformActor> {
    const now = new Date();
    const [row] = await this.db
      .select({ session: platformSessions, status: platformUsers.status, role: platformUsers.role })
      .from(platformSessions)
      .innerJoin(platformUsers, eq(platformUsers.id, platformSessions.platformUserId))
      .where(eq(platformSessions.tokenHash, this.hash(token)));
    if (!row) throw new DomainError('UNAUTHENTICATED', 'Unknown console session');
    const { session } = row;
    if (session.endedAt) throw ended();
    const end = async (reason: ConsoleSessionEndReason) => {
      await endConsoleSessions(this.db, eq(platformSessions.id, session.id), reason, now);
      return ended();
    };
    if (session.expiresAt <= now) throw await end('expired');
    if (
      now.getTime() - session.lastSeenAt.getTime() >=
      consolePolicy.sessionIdleMinutes * MINUTE_MS
    ) {
      throw await end('idle');
    }
    // Disabling and resetting end the user's sessions; this holds if one is ever missed.
    if (row.status !== 'active') throw await end('user_disabled');
    const actor: PlatformActor = {
      kind: 'platform',
      userId: session.platformUserId,
      sessionId: session.id,
      role: row.role as PlatformRole,
    };
    await this.db.transaction(async (tx) => {
      if (check.fromConsole) {
        await tx
          .update(platformSessions)
          .set({ lastSeenAt: now, updatedAt: now })
          .where(eq(platformSessions.id, session.id));
      }
      await recordPlatformAudit(tx, {
        actor,
        action: 'console.request',
        ...describe(actor, request),
      });
    });
    if (!check.fromConsole) {
      throw new DomainError('FORBIDDEN', 'A console write from another origin');
    }
    if (check.permission && !platformRoleHolds(actor.role, check.permission)) {
      throw new DomainError('FORBIDDEN', 'The platform role lacks the permission');
    }
    if (check.reauth && !isReauthenticated(session.reauthenticatedAt, now)) {
      throw new DomainError('REAUTH_REQUIRED', 'A recent TOTP code is needed');
    }
    return actor;
  }

  private hash(token: string): string {
    return this.hashes.hash('console-session', token);
  }
}

/** Whether a TOTP code was entered within the re-authentication window (rule 38). */
export function isReauthenticated(reauthenticatedAt: Date | null, now: Date): boolean {
  return reauthenticatedUntil(reauthenticatedAt, now) !== null;
}

export function reauthenticatedUntil(reauthenticatedAt: Date | null, now: Date): Date | null {
  if (!reauthenticatedAt) return null;
  const until = new Date(reauthenticatedAt.getTime() + consolePolicy.reauthMinutes * MINUTE_MS);
  return until > now ? until : null;
}

/**
 * The platform audit fields of a console request (rule 41): the route id, the id in its path and
 * the subject tenant. A path id that is not a UUID is left out (the route then answers
 * `VALIDATION_FAILED`).
 */
function describe(actor: PlatformActor, request: ConsoleRequest) {
  const path = request.route.split(' ')[1] ?? '';
  const segment = path.split('/')[3] ?? '';
  const pathId = uuid.safeParse(request.params.id).data ?? null;
  const entityType = consoleEntities[segment] ?? 'platform_session';
  const entityId =
    segment === 'me' ? actor.userId : entityType === 'platform_session' ? actor.sessionId : pathId;
  return {
    entityType,
    entityId,
    subjectTenantId: segment === 'tenants' ? pathId : null,
    requestRoute: request.route,
  };
}

// The cookie (rule 39). Handlers cannot take the response (ADR 0020): they return the body with
// the session to set or clear, and this interceptor writes the `Set-Cookie` header.

/** What a console route that opens or ends a session returns. */
export type WithConsoleCookie<T> = {
  body: T;
  /** The new session, or null to clear the cookie. */
  session: NewConsoleSession | null;
};

const COOKIE_ATTRIBUTES = 'Path=/api/console/; HttpOnly; Secure; SameSite=Strict';

export function consoleCookie(session: NewConsoleSession | null, now = new Date()): string {
  if (!session) return `${CONSOLE_SESSION_COOKIE}=; ${COOKIE_ATTRIBUTES}; Max-Age=0`;
  const maxAge = Math.max(0, Math.ceil((session.expiresAt.getTime() - now.getTime()) / 1000));
  return `${CONSOLE_SESSION_COOKIE}=${session.token}; ${COOKIE_ATTRIBUTES}; Max-Age=${maxAge}`;
}

/** Sets or clears the console session cookie from a handler's `WithConsoleCookie` result. */
@Injectable()
export class ConsoleSessionCookie implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader(name: string, value: string): void }>();
    return next.handle().pipe(
      map((result: WithConsoleCookie<unknown>) => {
        response.setHeader('set-cookie', consoleCookie(result.session));
        return result.body;
      }),
    );
  }
}
