import { Inject, Injectable } from '@nestjs/common';
import {
  type CurrentDevice,
  type DeviceRegistration,
  type DeviceToken,
  type DeviceTokenChallenge,
  type DeviceTokenRequest,
  DomainError,
  deviceTokenMessage,
  deviceTokenTtlSeconds,
  type Enroll,
  type Enrolled,
  type Nonce,
  type RegisterDevice,
  type RegisteredDevice,
  type TenantStatus,
} from '@vertex-shifa/contracts';
import { KeyedHash } from '@vertex-shifa/crypto';
import {
  accounts,
  type Database,
  deviceEnrollments,
  devices,
  staffSessions,
  type Transaction,
  withTenant,
} from '@vertex-shifa/db';
import { and, count, eq, inArray, isNull } from 'drizzle-orm';
import type { DeviceActor, Ticket } from '../../../core/access/actor.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { RateLimiter } from '../../../core/rate-limit/rate-limiter.js';
import {
  type Membership,
  permissionsOf,
  readMembership,
  readMembershipRoles,
} from '../access/index.js';
import { type AuditActor, recordAudit } from '../audit/index.js';
import { type FacilityDevices, readFacilitiesInUse, readTenant } from '../tenancy/index.js';
import { verifyEd25519 } from './secrets.js';
import type { Nonces } from './single-use.js';
import { assertMemberMayUse, endSessions, SessionIssuer } from './staff-sessions.js';
import { Tickets } from './tickets.js';
import { TokenSigner } from './tokens.js';
import { isUniqueViolation } from './unique-violation.js';

type DeviceRow = typeof devices.$inferSelect;
type EnrollmentRow = typeof deviceEnrollments.$inferSelect;

const MINUTE_MS = 60_000;

/** The token nonces of devices, apart from session nonces. */
export const DEVICE_NONCES = Symbol('DeviceNonces');

function toDevice(row: DeviceRow): DeviceRegistration {
  return {
    id: row.id,
    tenantId: row.tenantId,
    facilityId: row.facilityId,
    name: row.name,
    status: row.status as DeviceRegistration['status'],
  };
}

function toEnrollment(row: EnrollmentRow) {
  return {
    id: row.id,
    deviceId: row.deviceId,
    membershipId: row.membershipId,
    lastConfirmedAt: row.lastConfirmedAt.toISOString(),
  };
}

const memberActor = (member: Membership, deviceId: string): AuditActor => ({
  kind: 'staff',
  membershipId: member.id,
  deviceId,
});

/**
 * Registered computers and their members (spec S02 rules 18–23, 28, 29, 32; ADR 0024): registering
 * a computer to a clinic, device tokens, enrolling members, the device's own view and its wipe
 * confirmation. Each registration is one tenant's device; the server never links two of them.
 */
@Injectable()
export class DevicesService implements FacilityDevices {
  /**
   * Device token challenges: 600 per 10 minutes per address (a clinic's computers share one). Not
   * per device: anyone may name a device id, and must never lock the real computer out.
   */
  private readonly challengesPerAddress = new RateLimiter(600, 10 * MINUTE_MS);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KeyedHash) private readonly hashes: KeyedHash,
    @Inject(TokenSigner) private readonly tokens: TokenSigner,
    @Inject(Tickets) private readonly tickets: Tickets,
    @Inject(SessionIssuer) private readonly sessions: SessionIssuer,
    @Inject(DEVICE_NONCES) private readonly nonces: Nonces,
  ) {}

  /**
   * Rule 18: a member holding `devices.manage` for the chosen branch registers the computer and is
   * enrolled on it in the same step. Every choice from the registration options is rechecked here,
   * under the tenant's isolation.
   */
  register(ticket: Ticket, input: RegisterDevice): Promise<RegisteredDevice> {
    const now = new Date();
    return this.uniqueOrConflict(
      withTenant(this.db, input.tenantId, async (tx) => {
        // Locked so a branch archived or created meanwhile (rules 28, 32) waits for this one.
        const tenant = await readTenant(tx, input.tenantId, { lock: 'share' }).catch(
          () => undefined,
        );
        const member = await readMembership(tx, { accountId: ticket.accountId });
        if (!tenant || member?.status !== 'active') {
          throw new DomainError('FORBIDDEN', 'Not a member of this clinic');
        }
        const owner = member.roles.includes('owner');
        if (tenant.status === 'closed' && !owner) {
          throw new DomainError('TENANT_CLOSED', 'The clinic is closed');
        }
        await this.assertBranchChoice(tx, member, tenant.status as TenantStatus, input.facilityId);
        await this.tickets.consume(tx, ticket);
        const [device] = await tx
          .insert(devices)
          .values({
            tenantId: input.tenantId,
            facilityId: input.facilityId,
            name: input.name,
            publicKey: input.publicKey,
            os: input.os,
            appVersion: input.appVersion,
            registeredByMembershipId: member.id,
            lastSeenAt: now,
          })
          .returning();
        const row = device as DeviceRow;
        const actor = memberActor(member, row.id);
        await recordAudit(tx, row.tenantId, {
          actor,
          action: 'device.registered',
          entityType: 'device',
          entityId: row.id,
        });
        const enrolled = await this.enrollMember(tx, row, member, input.userPublicKey, now);
        return { device: toDevice(row), ...enrolled };
      }),
    );
  }

  /** A nonce for the device key to sign; the device is looked up only when the signature comes. */
  challenge(input: DeviceTokenChallenge, address: string): Nonce {
    this.challengesPerAddress.take(this.hashes.hash('address', address));
    const { nonce, expiresAt } = this.nonces.issue(`device:${input.tenantId}:${input.deviceId}`);
    return { nonce, expiresAt: expiresAt.toISOString() };
  }

  /**
   * A device token (5 minutes) for a valid signature of the nonce. A revoked device still gets
   * one until it confirms its wipe (rule 29), so it can; after that it is `DEVICE_REVOKED`.
   */
  async token(input: DeviceTokenRequest): Promise<DeviceToken> {
    this.nonces.take(input.nonce, `device:${input.tenantId}:${input.deviceId}`);
    const row = await withTenant(this.db, input.tenantId, async (tx) => {
      const [device] = await tx.select().from(devices).where(eq(devices.id, input.deviceId));
      if (!device) throw new DomainError('DEVICE_UNKNOWN', 'Unknown device');
      const message = deviceTokenMessage(input.nonce, device.id);
      if (!verifyEd25519(device.publicKey, message, input.signature)) {
        throw new DomainError('SIGNATURE_INVALID', 'The device signature does not verify');
      }
      if (device.wipedAt) throw new DomainError('DEVICE_REVOKED', 'The device was revoked');
      await tx
        .update(devices)
        .set({ lastSeenAt: new Date(), appVersion: input.appVersion, updatedAt: new Date() })
        .where(eq(devices.id, device.id));
      return device;
    });
    const token = this.tokens.sign(
      'device',
      { tid: row.tenantId, did: row.id },
      deviceTokenTtlSeconds,
    );
    return { deviceToken: token.token, expiresAt: token.expiresAt.toISOString() };
  }

  /** The registration as its lock screen shows it: clinic, branch and enrolled members. */
  current(device: DeviceActor): Promise<CurrentDevice> {
    return withTenant(this.db, device.tenantId, async (tx) => {
      const row = await this.deviceRow(tx, device.deviceId);
      const tenant = await readTenant(tx, device.tenantId);
      const facility = row.facilityId
        ? ((await readFacilitiesInUse(tx)).find((branch) => branch.id === row.facilityId) ?? null)
        : null;
      const enrollments = await tx
        .select()
        .from(deviceEnrollments)
        .where(and(eq(deviceEnrollments.deviceId, row.id), isNull(deviceEnrollments.revokedAt)));
      const members = await readMembershipRoles(
        tx,
        enrollments.map((enrollment) => enrollment.membershipId),
      );
      const accountIds = [...members.values()].map((member) => member.accountId);
      const accountsById = new Map(
        accountIds.length === 0
          ? []
          : (
              await tx
                .select({ id: accounts.id, nameAr: accounts.nameAr, phone: accounts.phone })
                .from(accounts)
                .where(inArray(accounts.id, accountIds))
            ).map((account) => [account.id, account]),
      );
      return {
        device: toDevice(row),
        tenant: {
          id: tenant.id,
          nameAr: tenant.nameAr,
          nameLatin: tenant.nameLatin,
          status: tenant.status as TenantStatus,
          idleLockMinutes: tenant.idleLockMinutes,
        },
        facility,
        members: enrollments.flatMap((enrollment) => {
          const member = members.get(enrollment.membershipId);
          const account = member && accountsById.get(member.accountId);
          if (!member || !account) return [];
          return [
            {
              enrollmentId: enrollment.id,
              membershipId: enrollment.membershipId,
              name: account.nameAr ?? member.invitedName,
              phone: account.phone,
              roles: member.roles,
              lastConfirmedAt: enrollment.lastConfirmedAt.toISOString(),
            },
          ];
        }),
      };
    });
  }

  /** Rule 29: a revoked installation confirms it deleted this registration's keys and data. */
  wiped(device: DeviceActor): Promise<{ wipedAt: string | null }> {
    return withTenant(this.db, device.tenantId, async (tx) => {
      const row = await this.deviceRow(tx, device.deviceId, { lock: true });
      if (row.status !== 'revoked') return { wipedAt: null };
      if (row.wipedAt) return { wipedAt: row.wipedAt.toISOString() };
      const now = new Date();
      await tx.update(devices).set({ wipedAt: now, updatedAt: now }).where(eq(devices.id, row.id));
      await recordAudit(tx, row.tenantId, {
        actor: { kind: 'system' },
        action: 'device.wiped',
        entityType: 'device',
        entityId: row.id,
      });
      return { wipedAt: now.toISOString() };
    });
  }

  /**
   * Rules 20 and 22: the signed-in member enrolls on this computer with a new user key; an
   * enrollment they already had here is replaced (a forgotten PIN), its sessions ended.
   */
  enroll(device: DeviceActor, ticket: Ticket, input: Enroll): Promise<Enrolled> {
    const now = new Date();
    return this.uniqueOrConflict(
      withTenant(this.db, device.tenantId, async (tx) => {
        // Locked so a deactivation or a scope change meanwhile (rule 8) waits for this one, or
        // this one reads the membership after it. The tenant first, as every writer locks it.
        const tenant = await readTenant(tx, device.tenantId, { lock: 'share' });
        const row = await this.deviceRow(tx, device.deviceId, { lock: true });
        const member = await readMembership(tx, { accountId: ticket.accountId });
        assertMemberMayUse(member, tenant, row.facilityId);
        if (input.userPublicKey === row.publicKey) {
          throw new DomainError('VALIDATION_FAILED', 'Invalid fields: userPublicKey');
        }
        await this.tickets.consume(tx, ticket);
        const [previous] = await tx
          .update(deviceEnrollments)
          .set({ revokedAt: now, revokeReason: 'pin_forgotten', updatedAt: now })
          .where(
            and(
              eq(deviceEnrollments.deviceId, row.id),
              eq(deviceEnrollments.membershipId, member.id),
              isNull(deviceEnrollments.revokedAt),
            ),
          )
          .returning({ id: deviceEnrollments.id });
        if (previous) {
          await endSessions(
            tx,
            eq(staffSessions.enrollmentId, previous.id),
            'enrollment_revoked',
            now,
          );
          await recordAudit(tx, row.tenantId, {
            actor: memberActor(member, row.id),
            action: 'device_enrollment.revoked',
            entityType: 'device_enrollment',
            entityId: previous.id,
          });
        }
        return this.enrollMember(tx, row, member, input.userPublicKey, now);
      }),
    );
  }

  // Branch rules of tenancy (S01 rules 7 and 28 of S02).

  async countActive(tx: Transaction, facilityId: string): Promise<number> {
    const [row] = await tx
      .select({ value: count() })
      .from(devices)
      .where(and(eq(devices.facilityId, facilityId), eq(devices.status, 'active')));
    return row?.value ?? 0;
  }

  async placeUnplaced(tx: Transaction, facilityId: string): Promise<void> {
    await tx
      .update(devices)
      .set({ facilityId, updatedAt: new Date() })
      .where(isNull(devices.facilityId));
  }

  // Shared steps.

  /** The enrollment and the first staff session of a member on a device, audited. */
  private async enrollMember(
    tx: Transaction,
    device: DeviceRow,
    member: Membership,
    userPublicKey: string,
    now: Date,
  ): Promise<Enrolled> {
    const [enrollment] = await tx
      .insert(deviceEnrollments)
      .values({
        tenantId: device.tenantId,
        deviceId: device.id,
        membershipId: member.id,
        publicKey: userPublicKey,
        lastConfirmedAt: now,
      })
      .returning();
    const row = enrollment as EnrollmentRow;
    const session = await this.sessions.open(
      tx,
      {
        tenantId: device.tenantId,
        membershipId: member.id,
        deviceId: device.id,
        enrollmentId: row.id,
      },
      now,
    );
    const actor = memberActor(member, device.id);
    await recordAudit(tx, device.tenantId, {
      actor,
      action: 'device_enrollment.created',
      entityType: 'device_enrollment',
      entityId: row.id,
    });
    await recordAudit(tx, device.tenantId, {
      actor,
      action: 'staff_session.started',
      entityType: 'staff_session',
      entityId: session.sessionId,
    });
    return { enrollment: toEnrollment(row), session };
  }

  /**
   * Rules 18 and 28: a branch in use within the member's `devices.manage` scope, or no branch for
   * an owner while the clinic is onboarding without one.
   */
  private async assertBranchChoice(
    tx: Transaction,
    member: Membership,
    status: TenantStatus,
    facilityId: string | null,
  ) {
    if (!permissionsOf(member).includes('devices.manage')) {
      throw new DomainError('FORBIDDEN', 'The member may not register computers');
    }
    const inUse = await readFacilitiesInUse(tx);
    const allowed =
      facilityId === null
        ? member.roles.includes('owner') && status === 'onboarding' && inUse.length === 0
        : inUse.some((branch) => branch.id === facilityId) &&
          (member.allFacilities || member.facilityIds.includes(facilityId));
    if (!allowed) throw new DomainError('FORBIDDEN', "The branch is outside the member's scope");
  }

  private async deviceRow(tx: Transaction, id: string, options: { lock?: boolean } = {}) {
    const query = tx.select().from(devices).where(eq(devices.id, id));
    const [row] = await (options.lock ? query.for('update') : query);
    if (!row) throw new DomainError('DEVICE_UNKNOWN', 'Unknown device');
    return row;
  }

  /** A double submit of a registration or an enrollment breaks a unique key: `CONFLICT`. */
  private async uniqueOrConflict<T>(work: Promise<T>): Promise<T> {
    try {
      return await work;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainError('CONFLICT', 'The device or enrollment already exists');
      }
      throw error;
    }
  }
}
