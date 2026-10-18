import {
  DomainError,
  type ErrorCode,
  type SessionTokens,
  staffSessionPolicy,
} from '@vertex-shifa/contracts';
import { deviceEnrollments, staffSessions, type Transaction } from '@vertex-shifa/db';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { inScope, type Membership } from '../access/index.js';
import type { readTenant } from '../tenancy/index.js';
import { type KeyedHash, randomToken, safeEqual } from './secrets.js';
import type { TokenSigner } from './tokens.js';

type TenantRow = Awaited<ReturnType<typeof readTenant>>;

export type SessionEndReason =
  | 'signed_out'
  | 'locked'
  | 'expired'
  | 'member_deactivated'
  | 'device_revoked'
  | 'enrollment_revoked'
  | 'password_reset';

/**
 * Why a member may not use a computer now, or undefined (spec S02 rules 7, 23 and 33): checked on
 * every enrollment, session, refresh and request.
 */
export function memberRefusal(
  member: Membership | undefined,
  tenant: TenantRow,
  facilityId: string | null,
): ErrorCode | undefined {
  if (member?.status !== 'active') return 'MEMBERSHIP_INACTIVE';
  if (tenant.status === 'closed' && !member.roles.includes('owner')) return 'TENANT_CLOSED';
  if (!inScope(member, facilityId)) return 'BRANCH_NOT_IN_SCOPE';
  return undefined;
}

export function assertMemberMayUse(
  member: Membership | undefined,
  tenant: TenantRow,
  facilityId: string | null,
): asserts member is Membership {
  const refusal = memberRefusal(member, tenant, facilityId);
  if (refusal) throw new DomainError(refusal, 'The member may not use this device');
}

const HOUR_MS = 3_600_000;

/**
 * Opens and refreshes staff sessions (spec S02 rule 23): a 15-minute access token and an opaque
 * refresh token for at most 12 hours. The refresh token carries its tenant and session id, signed
 * by a keyed hash, and is stored only as a keyed hash; each refresh replaces it.
 */
export class SessionIssuer {
  constructor(
    private readonly tokens: TokenSigner,
    private readonly hashes: KeyedHash,
  ) {}

  async open(
    tx: Transaction,
    session: { tenantId: string; membershipId: string; deviceId: string; enrollmentId: string },
    now: Date,
  ): Promise<SessionTokens> {
    const id = uuidv7();
    const refreshToken = this.refreshToken(session.tenantId, id);
    const expiresAt = new Date(now.getTime() + staffSessionPolicy.maxHours * HOUR_MS);
    await tx.insert(staffSessions).values({
      id,
      ...session,
      refreshTokenHash: this.hashes.hash('refresh-token', refreshToken),
      expiresAt,
      lastRefreshedAt: now,
    });
    await tx
      .update(deviceEnrollments)
      .set({ lastConfirmedAt: now, updatedAt: now })
      .where(eq(deviceEnrollments.id, session.enrollmentId));
    return this.tokensOf({ ...session, sessionId: id, refreshToken, expiresAt }, now);
  }

  /** New tokens for an open session, its refresh token replaced. */
  async refresh(
    tx: Transaction,
    session: {
      tenantId: string;
      membershipId: string;
      deviceId: string;
      sessionId: string;
      expiresAt: Date;
    },
    now: Date,
  ): Promise<SessionTokens> {
    const refreshToken = this.refreshToken(session.tenantId, session.sessionId);
    await tx
      .update(staffSessions)
      .set({
        refreshTokenHash: this.hashes.hash('refresh-token', refreshToken),
        lastRefreshedAt: now,
        updatedAt: now,
      })
      .where(eq(staffSessions.id, session.sessionId));
    return this.tokensOf({ ...session, refreshToken }, now);
  }

  /** The tenant and session a refresh token names, if its signature holds. */
  parseRefreshToken(token: string): { tenantId: string; sessionId: string } | undefined {
    const [version, tenantId, sessionId, secret, mac, ...rest] = token.split('.');
    if (version !== 'v1' || !tenantId || !sessionId || !secret || !mac || rest.length > 0) {
      return undefined;
    }
    const body = `${tenantId}.${sessionId}.${secret}`;
    return safeEqual(this.hashes.hash('refresh-token-mac', body), mac)
      ? { tenantId, sessionId }
      : undefined;
  }

  matchesStored(token: string, storedHash: string): boolean {
    return this.hashes.matches('refresh-token', token, storedHash);
  }

  private refreshToken(tenantId: string, sessionId: string): string {
    const body = `${tenantId}.${sessionId}.${randomToken()}`;
    return `v1.${body}.${this.hashes.hash('refresh-token-mac', body)}`;
  }

  private tokensOf(
    session: {
      tenantId: string;
      membershipId: string;
      deviceId: string;
      sessionId: string;
      refreshToken: string;
      expiresAt: Date;
    },
    now: Date,
  ): SessionTokens {
    // The access token never outlives its session.
    const ttl = Math.min(
      staffSessionPolicy.accessTokenMinutes * 60,
      Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000),
    );
    const access = this.tokens.sign(
      'access',
      {
        tid: session.tenantId,
        sid: session.sessionId,
        mid: session.membershipId,
        did: session.deviceId,
      },
      ttl,
      now,
    );
    return {
      sessionId: session.sessionId,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt.toISOString(),
    };
  }
}

/** Ends the open sessions of the transaction's tenant that `where` selects. */
export async function endSessions(
  tx: Transaction,
  where: SQL | undefined,
  reason: SessionEndReason,
  now: Date,
): Promise<void> {
  await tx
    .update(staffSessions)
    .set({ endedAt: now, endReason: reason, updatedAt: now })
    .where(and(isNull(staffSessions.endedAt), where));
}
