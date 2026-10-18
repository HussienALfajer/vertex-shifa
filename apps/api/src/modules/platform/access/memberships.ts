import {
  effectivePermissions,
  invitationPolicy,
  type MembershipStatus,
  type PermissionKey,
  type Role,
} from '@vertex-shifa/contracts';
import {
  accountTenantLinks,
  type Database,
  staffMembershipFacilities,
  staffMemberships,
  type Transaction,
} from '@vertex-shifa/db';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import { type AuditActor, recordAudit } from '../audit/index.js';
import { publishEvent } from '../events/index.js';

/**
 * Staff memberships as sign-in, devices and sessions read them (spec S02). Functions run in the
 * caller's tenant transaction (`withTenant`), so RLS keeps them to that tenant; the link table is
 * read outside any tenant, only to offer an account's clinics, and every choice is rechecked here.
 */

export type Membership = {
  id: string;
  tenantId: string;
  accountId: string;
  status: MembershipStatus;
  roles: Role[];
  allFacilities: boolean;
  /** The member's branches when `allFacilities` is false. */
  facilityIds: string[];
  granted: PermissionKey[];
  revoked: PermissionKey[];
  invitedName: string;
  invitationExpiresAt: Date | null;
};

/** The member's effective permissions (`effectivePermissions`, spec S02 "Access"). */
export function permissionsOf(member: Membership): PermissionKey[] {
  return effectivePermissions(member.roles, member.granted, member.revoked);
}

/**
 * Whether a computer of `facilityId` is in the member's scope (rule 7). A computer without a branch
 * (onboarding, rule 28) is the owners' only.
 */
export function inScope(member: Membership, facilityId: string | null): boolean {
  if (facilityId === null) return member.roles.includes('owner');
  return member.allFacilities || member.facilityIds.includes(facilityId);
}

/** Whether the membership is an invitation the person may still accept. */
export function isPendingInvitation(member: Membership, now: Date): boolean {
  return (
    member.status === 'invited' &&
    member.invitationExpiresAt !== null &&
    member.invitationExpiresAt > now
  );
}

/** A membership of the transaction's tenant, by id or by account; archived ones are absent. */
export async function readMembership(
  tx: Transaction,
  by: { id: string } | { accountId: string },
): Promise<Membership | undefined> {
  const [row] = await tx
    .select()
    .from(staffMemberships)
    .where(
      and(
        'id' in by ? eq(staffMemberships.id, by.id) : eq(staffMemberships.accountId, by.accountId),
        isNull(staffMemberships.archivedAt),
      ),
    );
  if (!row) return undefined;
  const branches = row.allFacilities
    ? []
    : await tx
        .select({ facilityId: staffMembershipFacilities.facilityId })
        .from(staffMembershipFacilities)
        .where(
          and(
            eq(staffMembershipFacilities.membershipId, row.id),
            isNull(staffMembershipFacilities.archivedAt),
          ),
        );
  return {
    id: row.id,
    tenantId: row.tenantId,
    accountId: row.accountId,
    status: row.status as MembershipStatus,
    roles: row.roles as Role[],
    allFacilities: row.allFacilities,
    facilityIds: branches.map((branch) => branch.facilityId),
    granted: row.grantedPermissions as PermissionKey[],
    revoked: row.revokedPermissions as PermissionKey[],
    invitedName: row.invitedName,
    invitationExpiresAt: row.invitationExpiresAt,
  };
}

/** Roles and accounts of members of the transaction's tenant, by membership id. */
export async function readMembershipRoles(
  tx: Transaction,
  ids: string[],
): Promise<Map<string, { roles: Role[]; accountId: string; invitedName: string }>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({
      id: staffMemberships.id,
      roles: staffMemberships.roles,
      accountId: staffMemberships.accountId,
      invitedName: staffMemberships.invitedName,
    })
    .from(staffMemberships)
    .where(inArray(staffMemberships.id, ids));
  return new Map(
    rows.map((row) => [
      row.id,
      { roles: row.roles as Role[], accountId: row.accountId, invitedName: row.invitedName },
    ]),
  );
}

/** The tenants an account is linked to (not archived), to offer at sign-in (rule 27). */
export async function linkedTenantIds(
  db: Database | Transaction,
  accountId: string,
): Promise<string[]> {
  const rows = await db
    .select({ tenantId: accountTenantLinks.linkedTenantId })
    .from(accountTenantLinks)
    .where(and(eq(accountTenantLinks.accountId, accountId), isNull(accountTenantLinks.archivedAt)));
  return rows.map((row) => row.tenantId);
}

/**
 * Accepts the account's pending invitation in the transaction's tenant, if any (rule 15): the
 * membership becomes active and the acceptance is audited. Answers whether one was accepted.
 */
export async function acceptInvitation(
  tx: Transaction,
  accountId: string,
  now: Date,
): Promise<boolean> {
  const [row] = await tx
    .update(staffMemberships)
    .set({
      status: 'active',
      acceptedAt: now,
      invitationExpiresAt: null,
      invitationMessageStatus: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(staffMemberships.accountId, accountId),
        eq(staffMemberships.status, 'invited'),
        gt(staffMemberships.invitationExpiresAt, now),
        isNull(staffMemberships.archivedAt),
      ),
    )
    .returning({ id: staffMemberships.id, tenantId: staffMemberships.tenantId });
  if (!row) return false;
  await recordAudit(tx, row.tenantId, {
    actor: { kind: 'staff', membershipId: row.id, deviceId: null },
    action: 'staff.invitation_accepted',
    entityType: 'staff_membership',
    entityId: row.id,
  });
  return true;
}

/**
 * Invites the tenant's first owner (rule 3: Vertex creates it with the tenant), in the tenant's
 * transaction: an `invited` membership with every branch, its link for sign-in, the audit entry
 * and the `staff.invitation_created.v1` event for the invitation message (S03).
 */
export async function inviteFirstOwner(
  tx: Transaction,
  input: { tenantId: string; accountId: string; invitedName: string; actor: AuditActor },
): Promise<string> {
  const now = new Date();
  const [row] = await tx
    .insert(staffMemberships)
    .values({
      tenantId: input.tenantId,
      accountId: input.accountId,
      status: 'invited',
      roles: ['owner'],
      allFacilities: true,
      invitedName: input.invitedName,
      invitationExpiresAt: new Date(now.getTime() + invitationPolicy.ttlDays * 86_400_000),
      invitationMessageStatus: 'pending',
    })
    .returning({ id: staffMemberships.id });
  const membershipId = (row as { id: string }).id;
  await tx
    .insert(accountTenantLinks)
    .values({ accountId: input.accountId, linkedTenantId: input.tenantId })
    .onConflictDoUpdate({
      target: [accountTenantLinks.accountId, accountTenantLinks.linkedTenantId],
      set: { archivedAt: null, updatedAt: now },
    });
  await recordAudit(tx, input.tenantId, {
    actor: input.actor,
    action: 'staff.invited',
    entityType: 'staff_membership',
    entityId: membershipId,
  });
  await publishEvent(tx, input.tenantId, 'staff.invitation_created.v1', {
    tenantId: input.tenantId,
    membershipId,
  });
  return membershipId;
}
