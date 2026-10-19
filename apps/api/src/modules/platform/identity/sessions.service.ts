import { Inject, Injectable } from '@nestjs/common';
import {
  DomainError,
  type ErrorCode,
  type Nonce,
  type OpenSession,
  type PlatformPermissionKey,
  type SessionTokens,
  staffSessionMessage,
  type TicketPurpose,
} from '@vertex-shifa/contracts';
import {
  type Database,
  deviceEnrollments,
  devices,
  staffSessions,
  withTenant,
} from '@vertex-shifa/db';
import { and, eq } from 'drizzle-orm';
import type { DeviceActor, PlatformActor, StaffActor, Ticket } from '../../../core/access/actor.js';
import type { ConsoleRequest, SessionVerifier } from '../../../core/access/session-verifier.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { RateLimiter } from '../../../core/rate-limit/rate-limiter.js';
import { permissionsOf, readMembership } from '../access/index.js';
import { recordAudit } from '../audit/index.js';
import { readTenant } from '../tenancy/index.js';
import { ConsoleSessions } from './console-sessions.js';
import { verifyEd25519 } from './secrets.js';
import type { Nonces } from './single-use.js';
import {
  assertMemberMayUse,
  endSessions,
  memberRefusal,
  type SessionEndReason,
  SessionIssuer,
} from './staff-sessions.js';
import { Tickets } from './tickets.js';
import { TokenSigner } from './tokens.js';

const MINUTE_MS = 60_000;

/** The session nonces members sign, apart from device token nonces. */
export const SESSION_NONCES = Symbol('SessionNonces');

/** A refusal decided inside a transaction whose writes (ending a session) must still commit. */
class Refusal {
  constructor(readonly code: ErrorCode) {}
}

/** A refusal's session end: why the session can never be refreshed again. */
const endReasonOf: Partial<Record<ErrorCode, SessionEndReason>> = {
  SESSION_ENDED: 'expired',
  ENROLLMENT_REVOKED: 'enrollment_revoked',
  MEMBERSHIP_INACTIVE: 'member_deactivated',
  DEVICE_REVOKED: 'device_revoked',
};

/**
 * Staff sessions (spec S02 rules 23 and 25): opening one with the member's user key on an active
 * device, refreshing it, ending it; and the session verifier of the access guard, which rechecks
 * the session, device, enrollment, membership, branch scope and tenant status on every request.
 */
@Injectable()
export class SessionsService implements SessionVerifier {
  private readonly challengesPerDevice = new RateLimiter(60, 10 * MINUTE_MS);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(TokenSigner) private readonly tokens: TokenSigner,
    @Inject(Tickets) private readonly tickets: Tickets,
    @Inject(SessionIssuer) private readonly issuer: SessionIssuer,
    @Inject(SESSION_NONCES) private readonly nonces: Nonces,
    @Inject(ConsoleSessions) private readonly consoleSessions: ConsoleSessions,
  ) {}

  challenge(device: DeviceActor): Nonce {
    this.challengesPerDevice.take(device.deviceId);
    const { nonce, expiresAt } = this.nonces.issue(`session:${device.tenantId}:${device.deviceId}`);
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  /** Rule 23: the member signs the nonce with their user key; the server rechecks everything. */
  async open(device: DeviceActor, input: OpenSession): Promise<SessionTokens> {
    this.nonces.take(input.nonce, `session:${device.tenantId}:${device.deviceId}`);
    const now = new Date();
    return withTenant(this.db, device.tenantId, async (tx) => {
      // Locked in the writers' order, the tenant then the device, so a deactivation, a scope
      // change, a device revocation or a member's removal meanwhile either waits for this session
      // and ends it, or commits first and is seen here (rules 8, 29).
      const tenant = await readTenant(tx, device.tenantId, { lock: 'share' });
      const [current] = await tx
        .select({ status: devices.status })
        .from(devices)
        .where(eq(devices.id, device.deviceId))
        .for('share');
      if (current?.status !== 'active') {
        throw new DomainError('DEVICE_REVOKED', 'The device was revoked');
      }
      const [enrollment] = await tx
        .select()
        .from(deviceEnrollments)
        .where(
          and(
            eq(deviceEnrollments.id, input.enrollmentId),
            eq(deviceEnrollments.deviceId, device.deviceId),
          ),
        );
      if (!enrollment) throw new DomainError('ENROLLMENT_REVOKED', 'Not enrolled on this device');
      const message = staffSessionMessage(input.nonce, device.deviceId, enrollment.id);
      if (!verifyEd25519(enrollment.publicKey, message, input.signature)) {
        throw new DomainError('SIGNATURE_INVALID', 'The user signature does not verify');
      }
      if (enrollment.revokedAt) throw new DomainError('ENROLLMENT_REVOKED', 'Enrollment revoked');
      const member = await readMembership(tx, { id: enrollment.membershipId });
      assertMemberMayUse(member, tenant, device.facilityId);
      const session = await this.issuer.open(
        tx,
        {
          tenantId: device.tenantId,
          membershipId: member.id,
          deviceId: device.deviceId,
          enrollmentId: enrollment.id,
        },
        now,
      );
      await recordAudit(tx, device.tenantId, {
        actor: { kind: 'staff', membershipId: member.id, deviceId: device.deviceId },
        action: 'staff_session.started',
        entityType: 'staff_session',
        entityId: session.sessionId,
      });
      return session;
    });
  }

  /**
   * New tokens for an open session of this device, rechecked like an opening (edge case 9: a
   * closed clinic refuses non-owners here). The session ends when it can never be refreshed again.
   */
  async refresh(device: DeviceActor, refreshToken: string): Promise<SessionTokens> {
    const ended = () => new DomainError('SESSION_ENDED', 'The session has ended');
    const parsed = this.issuer.parseRefreshToken(refreshToken);
    if (parsed?.tenantId !== device.tenantId) throw ended();
    const now = new Date();
    const outcome = await withTenant(this.db, device.tenantId, async (tx) => {
      const [session] = await tx
        .select()
        .from(staffSessions)
        .where(
          and(eq(staffSessions.id, parsed.sessionId), eq(staffSessions.deviceId, device.deviceId)),
        )
        .for('update');
      if (!session || session.endedAt) return new Refusal('SESSION_ENDED');
      if (!this.issuer.matchesStored(refreshToken, session.refreshTokenHash)) {
        return new Refusal('SESSION_ENDED');
      }
      const [enrollment] = await tx
        .select({ revokedAt: deviceEnrollments.revokedAt })
        .from(deviceEnrollments)
        .where(eq(deviceEnrollments.id, session.enrollmentId));
      const tenant = await readTenant(tx, device.tenantId);
      const member = await readMembership(tx, { id: session.membershipId });
      const refusal: ErrorCode | undefined =
        session.expiresAt <= now
          ? 'SESSION_ENDED'
          : enrollment?.revokedAt
            ? 'ENROLLMENT_REVOKED'
            : memberRefusal(member, tenant, device.facilityId);
      if (refusal) {
        const reason = endReasonOf[refusal];
        if (reason) await endSessions(tx, eq(staffSessions.id, session.id), reason, now);
        return new Refusal(refusal);
      }
      return this.issuer.refresh(
        tx,
        {
          tenantId: device.tenantId,
          membershipId: session.membershipId,
          deviceId: device.deviceId,
          sessionId: session.id,
          expiresAt: session.expiresAt,
        },
        now,
      );
    });
    if (outcome instanceof Refusal) {
      throw new DomainError(outcome.code, 'The session cannot be refreshed');
    }
    return outcome;
  }

  /** Signing out, or the idle lock (rule 25), ends the session. Ending twice changes nothing. */
  end(actor: StaffActor, reason: 'signed_out' | 'locked'): Promise<{ endedAt: string }> {
    const now = new Date();
    return withTenant(this.db, actor.tenantId, async (tx) => {
      await endSessions(tx, eq(staffSessions.id, actor.sessionId), reason, now);
      return { endedAt: now.toISOString() };
    });
  }

  // The session verifier of the access guard.

  async staff(accessToken: string): Promise<StaffActor> {
    const claims = this.tokens.verify(accessToken, 'access');
    if (!claims) throw new DomainError('UNAUTHENTICATED', 'Invalid or expired access token');
    const now = new Date();
    return withTenant(this.db, claims.tid, async (tx) => {
      const [row] = await tx
        .select({
          session: staffSessions,
          deviceStatus: devices.status,
          facilityId: devices.facilityId,
          enrollmentRevokedAt: deviceEnrollments.revokedAt,
        })
        .from(staffSessions)
        .innerJoin(devices, eq(devices.id, staffSessions.deviceId))
        .innerJoin(deviceEnrollments, eq(deviceEnrollments.id, staffSessions.enrollmentId))
        .where(eq(staffSessions.id, claims.sid));
      const session = row?.session;
      if (
        !row ||
        !session ||
        session.endedAt ||
        session.expiresAt <= now ||
        session.membershipId !== claims.mid ||
        session.deviceId !== claims.did
      ) {
        throw new DomainError('SESSION_ENDED', 'The session has ended');
      }
      if (row.deviceStatus !== 'active') throw new DomainError('DEVICE_REVOKED', 'Revoked device');
      if (row.enrollmentRevokedAt)
        throw new DomainError('ENROLLMENT_REVOKED', 'Enrollment revoked');
      const tenant = await readTenant(tx, claims.tid);
      const member = await readMembership(tx, { id: claims.mid });
      assertMemberMayUse(member, tenant, row.facilityId);
      return {
        kind: 'staff',
        tenantId: claims.tid,
        membershipId: member.id,
        accountId: member.accountId,
        sessionId: session.id,
        deviceId: claims.did,
        facilityId: row.facilityId,
        roles: member.roles,
        permissions: permissionsOf(member),
        allFacilities: member.allFacilities,
        facilityIds: member.facilityIds,
      };
    });
  }

  console(
    sessionToken: string,
    check: { permission: PlatformPermissionKey | null; reauth: boolean; fromConsole: boolean },
    request: ConsoleRequest,
  ): Promise<PlatformActor> {
    return this.consoleSessions.verify(sessionToken, check, request);
  }

  async device(deviceToken: string, options: { allowRevoked: boolean }): Promise<DeviceActor> {
    const claims = this.tokens.verify(deviceToken, 'device');
    if (!claims) throw new DomainError('UNAUTHENTICATED', 'Invalid or expired device token');
    const [row] = await withTenant(this.db, claims.tid, (tx) =>
      tx
        .select({ status: devices.status, facilityId: devices.facilityId })
        .from(devices)
        .where(eq(devices.id, claims.did)),
    );
    if (!row) throw new DomainError('DEVICE_UNKNOWN', 'Unknown device');
    if (row.status !== 'active' && !options.allowRevoked) {
      throw new DomainError('DEVICE_REVOKED', 'The device was revoked');
    }
    return {
      kind: 'device',
      tenantId: claims.tid,
      deviceId: claims.did,
      facilityId: row.facilityId,
      status: row.status as DeviceActor['status'],
    };
  }

  ticket(ticket: string, purpose: TicketPurpose): Promise<Ticket> {
    return this.tickets.verify(ticket, purpose);
  }
}
