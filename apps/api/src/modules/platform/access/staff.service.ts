import { Inject, Injectable } from '@nestjs/common';
import {
  assertAdjustmentsAllowed,
  assertMembershipAction,
  assertOwnerRemains,
  type BranchScope,
  type ChangeStaffAccess,
  type CreateInvitation,
  canResendInvitation,
  DomainError,
  effectivePermissions,
  invitationPolicy,
  invitationSentAt,
  type MembershipAction,
  type MembershipStatus,
  type PermissionKey,
  passwordResetWindowHours,
  type Role,
  type StaffMember,
  type StaffPage,
  type TenantStatus,
} from '@vertex-shifa/contracts';
import {
  type Database,
  staffMembershipFacilities,
  staffMemberships,
  type Transaction,
  withTenant,
} from '@vertex-shifa/db';
import { and, arrayContains, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import type { StaffActor } from '../../../core/access/actor.js';
import { assertCurrent, nextUpdatedAt } from '../../../core/concurrency/updated-at.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { recordAudit } from '../audit/index.js';
import { publishEvent } from '../events/index.js';
import { readFacilitiesInUse, readTenant } from '../tenancy/index.js';
import {
  linkAccount,
  permissionsOf,
  readMembership,
  toMembership,
  unlinkAccount,
} from './memberships.js';
import {
  MEMBER_DEVICES,
  type MemberDevices,
  PRACTITIONER_PROFILES,
  type PractitionerProfiles,
  STAFF_ACCOUNTS,
  type StaffAccounts,
} from './ports.js';

type MembershipRow = typeof staffMemberships.$inferSelect;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

const iso = (date: Date) => date.toISOString();
const isoOrNull = (date: Date | null) => (date ? iso(date) : null);

const notFound = () => new DomainError('NOT_FOUND', 'Member not found');

/** A cancelled invitation is archived: no action applies to it. */
function assertAction(row: MembershipRow, action: MembershipAction) {
  if (row.archivedAt) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `An archived membership cannot ${action}`);
  }
  assertMembershipAction(row.status as MembershipStatus, action);
}

/**
 * Rule 3 (and rule 33): invitations are sent only while the clinic is active. A resend reopens an
 * invitation for 7 days, so it follows the same rule.
 */
function assertMayInvite(status: TenantStatus) {
  if (status === 'suspended') throw new DomainError('TENANT_SUSPENDED', 'The tenant is suspended');
  if (status === 'closed') throw new DomainError('TENANT_CLOSED', 'The tenant is closed');
  if (status === 'onboarding') {
    throw new DomainError('ONBOARDING_INCOMPLETE', 'Invitations wait for the end of onboarding');
  }
}

/**
 * Staff management by the owner (spec S02 rules 1–10, 16): invitations, access changes,
 * deactivation and reactivation, password reset authorization, and the staff list. Every write
 * runs in the tenant's transaction with the tenant row locked for update, so staff writes of one
 * tenant are serialized (the last owner stays true), and writes its audit entry and outbox event
 * in the same transaction.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(STAFF_ACCOUNTS) private readonly accounts: StaffAccounts,
    @Inject(MEMBER_DEVICES) private readonly devices: MemberDevices,
    @Inject(PRACTITIONER_PROFILES) private readonly practitioners: PractitionerProfiles,
  ) {}

  list(
    actor: StaffActor,
    query: { status?: MembershipStatus | undefined; page: number; pageSize: number },
  ): Promise<StaffPage> {
    const filter = and(
      isNull(staffMemberships.archivedAt),
      query.status ? eq(staffMemberships.status, query.status) : undefined,
    );
    return withTenant(this.db, actor.tenantId, async (tx) => {
      const [rows, [total]] = await Promise.all([
        tx
          .select()
          .from(staffMemberships)
          .where(filter)
          .orderBy(asc(staffMemberships.createdAt), asc(staffMemberships.id))
          .limit(query.pageSize)
          .offset((query.page - 1) * query.pageSize),
        tx.select({ value: count() }).from(staffMemberships).where(filter),
      ]);
      return {
        items: await this.toMembers(tx, rows),
        total: total?.value ?? 0,
        page: query.page,
        pageSize: query.pageSize,
      };
    });
  }

  /** A member, or a cancelled invitation (archived). */
  get(actor: StaffActor, id: string): Promise<StaffMember> {
    return withTenant(this.db, actor.tenantId, async (tx) =>
      this.toMember(tx, await this.memberRow(tx, id)),
    );
  }

  /**
   * Rules 1–4: an invitation by phone. The account is found or created without saying which; a
   * phone with a membership here is `ALREADY_MEMBER`, except a cancelled invitation, which is
   * restored with the new access.
   */
  invite(actor: StaffActor, input: CreateInvitation): Promise<StaffMember> {
    return this.write(actor, async (tx, now) => {
      const tenant = await readTenant(tx, actor.tenantId);
      assertMayInvite(tenant.status as TenantStatus);
      const { granted, revoked } = input.adjustments;
      assertAdjustmentsAllowed(input.roles, granted, revoked);
      await this.assertBranches(tx, input.branchScope, []);
      const accountId = await this.accounts.findOrCreate(tx, input.phone, actor);
      const [existing] = await tx
        .select()
        .from(staffMemberships)
        .where(eq(staffMemberships.accountId, accountId))
        .for('update');
      if (existing && !existing.archivedAt) {
        throw new DomainError('ALREADY_MEMBER', 'The account already has a membership here');
      }
      const values = {
        status: 'invited',
        roles: input.roles,
        allFacilities: input.branchScope.allFacilities,
        grantedPermissions: granted,
        revokedPermissions: revoked,
        invitedName: input.name,
        invitedByMembershipId: actor.membershipId,
        invitationExpiresAt: new Date(now.getTime() + invitationPolicy.ttlDays * DAY_MS),
        invitationMessageStatus: 'pending',
        acceptedAt: null,
        deactivatedAt: null,
        archivedAt: null,
      };
      const [row] = existing
        ? await tx
            .update(staffMemberships)
            .set({ ...values, updatedAt: nextUpdatedAt(existing, now) })
            .where(eq(staffMemberships.id, existing.id))
            .returning()
        : await tx
            .insert(staffMemberships)
            .values({ tenantId: actor.tenantId, accountId, ...values })
            .returning();
      const member = row as MembershipRow;
      await this.setBranches(tx, member, input.branchScope, now);
      await linkAccount(tx, accountId, actor.tenantId, now);
      if (input.roles.includes('doctor')) {
        await this.practitioners.assign(tx, member.id, input.practitioner, actor);
      }
      await this.audit(tx, actor, 'staff.invited', member.id);
      await publishEvent(tx, actor.tenantId, 'staff.invitation_created.v1', {
        tenantId: actor.tenantId,
        membershipId: member.id,
      });
      return this.toMember(tx, member);
    });
  }

  /** Rule 4: a new 7-day expiry and a new message, at most every 10 minutes. */
  resend(actor: StaffActor, id: string): Promise<StaffMember> {
    return this.write(actor, async (tx, now) => {
      const row = await this.memberRow(tx, id, { lock: true });
      assertAction(row, 'resend');
      const sentAt = invitationSentAt(row.invitationExpiresAt ?? now);
      if (!canResendInvitation(sentAt, now)) {
        throw new DomainError('RATE_LIMITED', 'The invitation was sent less than 10 minutes ago');
      }
      assertMayInvite((await readTenant(tx, actor.tenantId)).status as TenantStatus);
      const updated = await this.update(tx, row, now, {
        invitationExpiresAt: new Date(now.getTime() + invitationPolicy.ttlDays * DAY_MS),
        invitationMessageStatus: 'pending',
      });
      await this.audit(tx, actor, 'staff.invitation_resent', id);
      await publishEvent(tx, actor.tenantId, 'staff.invitation_created.v1', {
        tenantId: actor.tenantId,
        membershipId: id,
      });
      return this.toMember(tx, updated);
    });
  }

  /** The invitation is archived with its link and doctor profile; inviting again restores it. */
  cancel(actor: StaffActor, id: string): Promise<StaffMember> {
    return this.write(actor, async (tx, now) => {
      const row = await this.memberRow(tx, id, { lock: true });
      assertAction(row, 'cancel');
      const updated = await this.update(tx, row, now, { archivedAt: now });
      await unlinkAccount(tx, row.accountId, actor.tenantId, now);
      await this.practitioners.archive(tx, id, actor);
      await this.audit(tx, actor, 'staff.invitation_cancelled', id);
      return this.toMember(tx, updated);
    });
  }

  /**
   * Rules 5–10: roles, branch scope and adjustments, with the `updatedAt` the client read. The
   * last active owner keeps the owner role; the doctor role brings its profile and its removal
   * archives it; computers now outside the scope lose the member's enrollments at once.
   */
  changeAccess(actor: StaffActor, id: string, input: ChangeStaffAccess): Promise<StaffMember> {
    return this.write(actor, async (tx, now) => {
      const row = await this.memberRow(tx, id, { lock: true });
      if (row.archivedAt) throw notFound();
      assertCurrent(row, input.expectedUpdatedAt);
      const { granted, revoked } = input.adjustments;
      assertAdjustmentsAllowed(input.roles, granted, revoked);
      const kept = await this.branchIds(tx, [row.id]);
      await this.assertBranches(tx, input.branchScope, kept.get(row.id) ?? []);
      const roles = row.roles as Role[];
      if (roles.includes('owner') && !input.roles.includes('owner') && row.status === 'active') {
        assertOwnerRemains(await this.otherActiveOwners(tx, row.id));
      }
      if (input.roles.includes('doctor') && !roles.includes('doctor')) {
        await this.practitioners.assign(tx, row.id, input.practitioner, actor);
      }
      if (!input.roles.includes('doctor') && roles.includes('doctor')) {
        await this.practitioners.archive(tx, row.id, actor);
      }
      const updated = await this.update(tx, row, now, {
        roles: input.roles,
        allFacilities: input.branchScope.allFacilities,
        grantedPermissions: granted,
        revokedPermissions: revoked,
      });
      const facilityIds = await this.setBranches(tx, updated, input.branchScope, now);
      if (updated.status === 'active') {
        await this.devices.cutOutsideScope(tx, toMembership(updated, facilityIds), now);
      }
      await this.audit(tx, actor, 'staff.access_changed', id);
      return this.toMember(tx, updated);
    });
  }

  /** Rules 5 and 8: never the last active owner; sessions and enrollments end at once. */
  deactivate(actor: StaffActor, id: string, reason: string): Promise<StaffMember> {
    return this.write(actor, async (tx, now) => {
      const row = await this.memberRow(tx, id, { lock: true });
      assertAction(row, 'deactivate');
      if ((row.roles as Role[]).includes('owner')) {
        assertOwnerRemains(await this.otherActiveOwners(tx, row.id));
      }
      const updated = await this.update(tx, row, now, {
        status: 'deactivated',
        deactivatedAt: now,
      });
      await this.devices.cutOff(tx, toMembership(updated, []), now);
      await this.audit(tx, actor, 'staff.deactivated', id, reason);
      return this.toMember(tx, updated);
    });
  }

  /**
   * The member is active again and signs in anew on each computer (their enrollments ended).
   * S05 checks the staff-user and doctor limits here.
   */
  reactivate(actor: StaffActor, id: string): Promise<StaffMember> {
    return this.write(actor, async (tx, now) => {
      const row = await this.memberRow(tx, id, { lock: true });
      assertAction(row, 'reactivate');
      const updated = await this.update(tx, row, now, { status: 'active', deactivatedAt: null });
      await this.audit(tx, actor, 'staff.reactivated', id);
      return this.toMember(tx, updated);
    });
  }

  /**
   * Rule 16: the member's account may set a new password through an OTP within 72 hours; the old
   * one keeps working until then.
   */
  authorizePasswordReset(
    actor: StaffActor,
    id: string,
  ): Promise<{ passwordResetAuthorizedUntil: string }> {
    return this.write(actor, async (tx, now) => {
      const row = await this.memberRow(tx, id, { lock: true });
      assertAction(row, 'authorizePasswordReset');
      const until = new Date(now.getTime() + passwordResetWindowHours * HOUR_MS);
      await this.accounts.authorizePasswordReset(tx, row.accountId, actor, until);
      await this.audit(tx, actor, 'staff.password_reset_authorized', id);
      return { passwordResetAuthorizedUntil: iso(until) };
    });
  }

  // Shared steps.

  /**
   * A staff write: in the tenant's transaction, with the tenant row locked, so staff writes and
   * enrollments of the tenant run one at a time. The guard read the actor before the lock; an owner
   * deactivated or demoted meanwhile is refused here.
   */
  private write<T>(actor: StaffActor, work: (tx: Transaction, now: Date) => Promise<T>) {
    return withTenant(this.db, actor.tenantId, async (tx) => {
      await readTenant(tx, actor.tenantId, { lock: 'no key update' });
      const self = await readMembership(tx, { id: actor.membershipId });
      if (self?.status !== 'active' || !permissionsOf(self).includes('staff.manage')) {
        throw new DomainError('FORBIDDEN', 'The member may no longer manage staff');
      }
      return work(tx, new Date());
    });
  }

  /** RLS hides another tenant's member, so its id is `NOT_FOUND` like an unknown one. */
  private async memberRow(tx: Transaction, id: string, options: { lock?: boolean } = {}) {
    const query = tx.select().from(staffMemberships).where(eq(staffMemberships.id, id));
    const [row] = await (options.lock ? query.for('update') : query);
    if (!row) throw notFound();
    return row;
  }

  private async update(
    tx: Transaction,
    row: MembershipRow,
    now: Date,
    set: Partial<typeof staffMemberships.$inferInsert>,
  ): Promise<MembershipRow> {
    const [updated] = await tx
      .update(staffMemberships)
      .set({ ...set, updatedAt: nextUpdatedAt(row, now) })
      .where(eq(staffMemberships.id, row.id))
      .returning();
    return updated as MembershipRow;
  }

  private async otherActiveOwners(tx: Transaction, id: string): Promise<number> {
    const [row] = await tx
      .select({ value: count() })
      .from(staffMemberships)
      .where(
        and(
          ne(staffMemberships.id, id),
          eq(staffMemberships.status, 'active'),
          isNull(staffMemberships.archivedAt),
          arrayContains(staffMemberships.roles, ['owner']),
        ),
      );
    return row?.value ?? 0;
  }

  /**
   * Edge cases 4 and 5: every listed branch is in use, or already in the member's scope (a branch
   * archived since stays until the owner changes it).
   */
  private async assertBranches(tx: Transaction, scope: BranchScope, kept: string[]) {
    if (scope.allFacilities) return;
    const inUse = new Set((await readFacilitiesInUse(tx)).map((branch) => branch.id));
    if (!scope.facilityIds.every((id) => inUse.has(id) || kept.includes(id))) {
      throw new DomainError('VALIDATION_FAILED', 'Invalid fields: branchScope.facilityIds');
    }
  }

  /** Makes the member's branch rows match the scope; answers the scope's branches. */
  private async setBranches(
    tx: Transaction,
    member: MembershipRow,
    scope: BranchScope,
    now: Date,
  ): Promise<string[]> {
    const target = scope.allFacilities ? [] : scope.facilityIds;
    const current = (await this.branchIds(tx, [member.id])).get(member.id) ?? [];
    const removed = current.filter((id) => !target.includes(id));
    if (removed.length > 0) {
      await tx
        .update(staffMembershipFacilities)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(staffMembershipFacilities.membershipId, member.id),
            inArray(staffMembershipFacilities.facilityId, removed),
            isNull(staffMembershipFacilities.archivedAt),
          ),
        );
    }
    const added = target.filter((id) => !current.includes(id));
    if (added.length > 0) {
      await tx.insert(staffMembershipFacilities).values(
        added.map((facilityId) => ({
          tenantId: member.tenantId,
          membershipId: member.id,
          facilityId,
        })),
      );
    }
    return target;
  }

  /** The current branch rows of members, by membership id. */
  private async branchIds(tx: Transaction, ids: string[]): Promise<Map<string, string[]>> {
    const byMember = new Map<string, string[]>();
    if (ids.length === 0) return byMember;
    const rows = await tx
      .select({
        membershipId: staffMembershipFacilities.membershipId,
        facilityId: staffMembershipFacilities.facilityId,
      })
      .from(staffMembershipFacilities)
      .where(
        and(
          inArray(staffMembershipFacilities.membershipId, ids),
          isNull(staffMembershipFacilities.archivedAt),
        ),
      )
      .orderBy(asc(staffMembershipFacilities.createdAt), asc(staffMembershipFacilities.id));
    for (const row of rows) {
      byMember.set(row.membershipId, [...(byMember.get(row.membershipId) ?? []), row.facilityId]);
    }
    return byMember;
  }

  private audit(
    tx: Transaction,
    actor: StaffActor,
    action:
      | 'staff.invited'
      | 'staff.invitation_resent'
      | 'staff.invitation_cancelled'
      | 'staff.access_changed'
      | 'staff.deactivated'
      | 'staff.reactivated'
      | 'staff.password_reset_authorized',
    id: string,
    reason?: string,
  ) {
    return recordAudit(tx, actor.tenantId, {
      actor,
      action,
      entityType: 'staff_membership',
      entityId: id,
      ...(reason === undefined ? {} : { reason }),
    });
  }

  private async toMember(tx: Transaction, row: MembershipRow): Promise<StaffMember> {
    const [member] = await this.toMembers(tx, [row]);
    return member as StaffMember;
  }

  private async toMembers(tx: Transaction, rows: MembershipRow[]): Promise<StaffMember[]> {
    const ids = rows.map((row) => row.id);
    const [branches, profiles, practitioners] = await Promise.all([
      this.branchIds(tx, ids),
      this.accounts.profiles(
        tx,
        rows.map((row) => row.accountId),
      ),
      this.practitioners.currentIds(tx, ids),
    ]);
    return rows.map((row) => {
      const roles = row.roles as Role[];
      const granted = row.grantedPermissions as PermissionKey[];
      const revoked = row.revokedPermissions as PermissionKey[];
      const profile = profiles.get(row.accountId);
      // Until the person accepts, the list shows the name the owner typed, never the account's.
      const accepted = row.status !== 'invited' && !row.archivedAt;
      return {
        id: row.id,
        name: (accepted ? profile?.nameAr : undefined) ?? row.invitedName,
        phone: profile?.phone ?? '',
        status: row.status as MembershipStatus,
        roles,
        branchScope: row.allFacilities
          ? { allFacilities: true }
          : { allFacilities: false, facilityIds: branches.get(row.id) ?? [] },
        adjustments: { granted, revoked },
        permissions: effectivePermissions(roles, granted, revoked),
        practitionerId: practitioners.get(row.id) ?? null,
        invitationExpiresAt: isoOrNull(row.invitationExpiresAt),
        invitationMessageStatus:
          row.invitationMessageStatus as StaffMember['invitationMessageStatus'],
        acceptedAt: isoOrNull(row.acceptedAt),
        deactivatedAt: isoOrNull(row.deactivatedAt),
        createdAt: iso(row.createdAt),
        updatedAt: iso(row.updatedAt),
        archivedAt: isoOrNull(row.archivedAt),
      };
    });
  }
}
