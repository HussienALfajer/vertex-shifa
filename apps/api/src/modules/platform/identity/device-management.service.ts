import { Inject, Injectable } from '@nestjs/common';
import {
  DomainError,
  type ManagedDevice,
  type RevokeDevice,
  type RevokedEnrollment,
} from '@vertex-shifa/contracts';
import {
  accounts,
  type Database,
  deviceEnrollments,
  devices,
  staffSessions,
  type Transaction,
  withTenant,
} from '@vertex-shifa/db';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { holds, type StaffActor } from '../../../core/access/actor.js';
import { DATABASE } from '../../../core/database/database.module.js';
import {
  inScope,
  type MemberDevices,
  type Membership,
  readMembershipRoles,
} from '../access/index.js';
import { recordAudit } from '../audit/index.js';
import { endSessions } from './staff-sessions.js';

type DeviceRow = typeof devices.$inferSelect;
type EnrollmentRow = typeof deviceEnrollments.$inferSelect;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? iso(date) : null);

/**
 * Whether the member may manage a computer of `facilityId` (`devices.manage` in that branch). A
 * computer without a branch (onboarding, rule 28) is the owners'.
 */
function mayManage(actor: StaffActor, facilityId: string | null): boolean {
  if (facilityId === null) return actor.roles.includes('owner') && holds(actor, 'devices.manage');
  return holds(actor, 'devices.manage', facilityId);
}

/**
 * The clinic's computers as `devices.manage` sees them (spec S02 rules 8, 29 and 32): listing,
 * renaming and revoking computers of the branches in the member's scope, and removing a member from
 * a computer. It also ends a member's enrollments when the owner deactivates them or narrows their
 * scope (the `MEMBER_DEVICES` port of access).
 */
@Injectable()
export class DeviceManagementService implements MemberDevices {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(actor: StaffActor, query: { status?: 'active' | 'revoked' | undefined }) {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(devices)
        .where(query.status ? eq(devices.status, query.status) : undefined)
        .orderBy(asc(devices.createdAt), asc(devices.id));
      return this.toManaged(
        tx,
        rows.filter((row) => mayManage(actor, row.facilityId)),
      );
    });
  }

  get(actor: StaffActor, id: string): Promise<ManagedDevice> {
    return withTenant(this.db, actor.tenantId, async (tx) =>
      this.one(tx, await this.managedRow(tx, actor, id)),
    );
  }

  rename(actor: StaffActor, id: string, name: string): Promise<ManagedDevice> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const row = await this.managedRow(tx, actor, id, { lock: true });
      const [updated] = await tx
        .update(devices)
        .set({ name, updatedAt: new Date() })
        .where(eq(devices.id, row.id))
        .returning();
      await recordAudit(tx, actor.tenantId, {
        actor,
        action: 'device.renamed',
        entityType: 'device',
        entityId: row.id,
      });
      return this.one(tx, updated as DeviceRow);
    });
  }

  /**
   * Rule 29: at once on the server, the computer's tokens, enrollments and sessions stop working;
   * it wipes this clinic's data on its next connection. The category and text go to the audit.
   */
  revoke(actor: StaffActor, id: string, input: RevokeDevice): Promise<ManagedDevice> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const row = await this.managedRow(tx, actor, id, { lock: true });
      if (row.status !== 'active') {
        throw new DomainError('INVALID_STATUS_TRANSITION', 'The device is already revoked');
      }
      const now = new Date();
      const [updated] = await tx
        .update(devices)
        .set({
          status: 'revoked',
          revokedAt: now,
          revokedByMembershipId: actor.membershipId,
          updatedAt: now,
        })
        .where(eq(devices.id, row.id))
        .returning();
      await tx
        .update(deviceEnrollments)
        .set({ revokedAt: now, revokeReason: 'device_revoked', updatedAt: now })
        .where(and(eq(deviceEnrollments.deviceId, row.id), isNull(deviceEnrollments.revokedAt)));
      await endSessions(tx, eq(staffSessions.deviceId, row.id), 'device_revoked', now);
      await recordAudit(tx, actor.tenantId, {
        actor,
        action: 'device.revoked',
        entityType: 'device',
        entityId: row.id,
        reason: `${input.category}: ${input.reason}`,
      });
      return this.one(tx, updated as DeviceRow);
    });
  }

  /** Removes a member from a computer: their enrollment and its sessions end. */
  removeMember(actor: StaffActor, id: string, enrollmentId: string): Promise<RevokedEnrollment> {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const row = await this.managedRow(tx, actor, id, { lock: true });
      const now = new Date();
      const [enrollment] = await tx
        .update(deviceEnrollments)
        .set({ revokedAt: now, revokeReason: 'removed_from_device', updatedAt: now })
        .where(
          and(
            eq(deviceEnrollments.id, enrollmentId),
            eq(deviceEnrollments.deviceId, row.id),
            isNull(deviceEnrollments.revokedAt),
          ),
        )
        .returning();
      if (!enrollment) throw new DomainError('NOT_FOUND', 'Enrollment not found');
      await endSessions(
        tx,
        eq(staffSessions.enrollmentId, enrollment.id),
        'enrollment_revoked',
        now,
      );
      await recordAudit(tx, actor.tenantId, {
        actor,
        action: 'device_enrollment.revoked',
        entityType: 'device_enrollment',
        entityId: enrollment.id,
      });
      return {
        id: enrollment.id,
        deviceId: enrollment.deviceId,
        membershipId: enrollment.membershipId,
        revokedAt: iso(now),
        revokeReason: 'removed_from_device',
      };
    });
  }

  // The `MEMBER_DEVICES` port (rule 8): the owner's change is the audited action.

  async cutOff(tx: Transaction, member: Membership, now: Date): Promise<void> {
    await tx
      .update(deviceEnrollments)
      .set({ revokedAt: now, revokeReason: 'member_deactivated', updatedAt: now })
      .where(
        and(eq(deviceEnrollments.membershipId, member.id), isNull(deviceEnrollments.revokedAt)),
      );
    await endSessions(tx, eq(staffSessions.membershipId, member.id), 'member_deactivated', now);
  }

  async cutOutsideScope(tx: Transaction, member: Membership, now: Date): Promise<void> {
    const enrolled = await tx
      .select({ id: deviceEnrollments.id, facilityId: devices.facilityId })
      .from(deviceEnrollments)
      .innerJoin(devices, eq(devices.id, deviceEnrollments.deviceId))
      .where(
        and(eq(deviceEnrollments.membershipId, member.id), isNull(deviceEnrollments.revokedAt)),
      );
    const outside = enrolled.filter((row) => !inScope(member, row.facilityId)).map((row) => row.id);
    if (outside.length === 0) return;
    await tx
      .update(deviceEnrollments)
      .set({ revokedAt: now, revokeReason: 'branch_left', updatedAt: now })
      .where(inArray(deviceEnrollments.id, outside));
    await endSessions(tx, inArray(staffSessions.enrollmentId, outside), 'enrollment_revoked', now);
  }

  // Shared steps.

  /**
   * A computer of the tenant (another tenant's is `NOT_FOUND` under RLS) that the member may
   * manage (`FORBIDDEN` outside their branches).
   */
  private async managedRow(
    tx: Transaction,
    actor: StaffActor,
    id: string,
    options: { lock?: boolean } = {},
  ): Promise<DeviceRow> {
    const query = tx.select().from(devices).where(eq(devices.id, id));
    const [row] = await (options.lock ? query.for('update') : query);
    if (!row) throw new DomainError('NOT_FOUND', 'Device not found');
    if (!mayManage(actor, row.facilityId)) {
      throw new DomainError('FORBIDDEN', "The device is outside the member's scope");
    }
    return row;
  }

  private async one(tx: Transaction, row: DeviceRow): Promise<ManagedDevice> {
    const [device] = await this.toManaged(tx, [row]);
    return device as ManagedDevice;
  }

  /** Computers with their current members, named as the lock screen names them. */
  private async toManaged(tx: Transaction, rows: DeviceRow[]): Promise<ManagedDevice[]> {
    const enrollments: EnrollmentRow[] =
      rows.length === 0
        ? []
        : await tx
            .select()
            .from(deviceEnrollments)
            .where(
              and(
                inArray(
                  deviceEnrollments.deviceId,
                  rows.map((row) => row.id),
                ),
                isNull(deviceEnrollments.revokedAt),
              ),
            )
            .orderBy(asc(deviceEnrollments.createdAt), asc(deviceEnrollments.id));
    const members = await readMembershipRoles(tx, [
      ...new Set(enrollments.map((enrollment) => enrollment.membershipId)),
    ]);
    const accountIds = [...new Set([...members.values()].map((member) => member.accountId))];
    const names = new Map(
      accountIds.length === 0
        ? []
        : (
            await tx
              .select({ id: accounts.id, nameAr: accounts.nameAr })
              .from(accounts)
              .where(inArray(accounts.id, accountIds))
          ).map((account) => [account.id, account.nameAr]),
    );
    return rows.map((row) => ({
      id: row.id,
      facilityId: row.facilityId,
      name: row.name,
      status: row.status as ManagedDevice['status'],
      os: row.os,
      appVersion: row.appVersion,
      lastSeenAt: iso(row.lastSeenAt),
      registeredAt: iso(row.createdAt),
      revokedAt: isoOrNull(row.revokedAt),
      wipedAt: isoOrNull(row.wipedAt),
      updatedAt: iso(row.updatedAt),
      members: enrollments
        .filter((enrollment) => enrollment.deviceId === row.id)
        .flatMap((enrollment) => {
          const member = members.get(enrollment.membershipId);
          if (!member) return [];
          return [
            {
              enrollmentId: enrollment.id,
              membershipId: enrollment.membershipId,
              name: names.get(member.accountId) ?? member.invitedName,
              roles: member.roles,
              lastConfirmedAt: iso(enrollment.lastConfirmedAt),
            },
          ];
        }),
    }));
  }
}
