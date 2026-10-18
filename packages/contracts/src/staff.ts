import { z } from 'zod';
import { permissionAdjustmentsSchema, type Role, rolesSchema } from './access.js';
import { DomainError } from './errors.js';
import { mobilePhoneNumberSchema } from './phone.js';
import { practitionerProfileInputSchema } from './practitioners.js';

/**
 * Staff memberships (ADR 0005, spec S02): a person's place in a tenant, with roles, a branch scope
 * and the owner's permission adjustments.
 */

export const membershipStatusSchema = z
  .enum(['invited', 'active', 'deactivated'])
  .meta({ id: 'MembershipStatus' });

export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

/**
 * What may happen to a membership in each status, and the status it leaves (`archived` for a
 * cancelled invitation). Resending keeps it invited with a new expiry.
 */
export const membershipActions = {
  accept: { from: ['invited'], to: 'active' },
  resend: { from: ['invited'], to: 'invited' },
  cancel: { from: ['invited'], to: 'archived' },
  deactivate: { from: ['active'], to: 'deactivated' },
  reactivate: { from: ['deactivated'], to: 'active' },
  authorizePasswordReset: { from: ['active'], to: 'active' },
} as const satisfies Record<
  string,
  { from: readonly MembershipStatus[]; to: MembershipStatus | 'archived' }
>;

export type MembershipAction = keyof typeof membershipActions;

export function canApplyMembershipAction(
  status: MembershipStatus,
  action: MembershipAction,
): boolean {
  return (membershipActions[action].from as readonly MembershipStatus[]).includes(status);
}

export function assertMembershipAction(status: MembershipStatus, action: MembershipAction): void {
  if (!canApplyMembershipAction(status, action)) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `A ${status} membership cannot ${action}`);
  }
}

/** Invitations last 7 days after creation or the last resend; resend waits 10 minutes (rule 4). */
export const invitationPolicy = { ttlDays: 7, resendCooldownMinutes: 10 } as const;

export const invitationMessageStatusSchema = z
  .enum(['pending', 'sent', 'failed'])
  .meta({ id: 'InvitationMessageStatus' });

/** The name the owner typed for the person, until the person sets their own. */
export const invitedNameSchema = z.string().trim().min(2).max(100);

/** Every branch, or the listed ones (at least one). Owners have every branch (rule 5). */
export const branchScopeSchema = z
  .discriminatedUnion('allFacilities', [
    z.object({ allFacilities: z.literal(true) }),
    z.object({
      allFacilities: z.literal(false),
      facilityIds: z
        .array(z.uuid())
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, 'A branch appears twice'),
    }),
  ])
  .meta({ id: 'BranchScope' });

export type BranchScope = z.infer<typeof branchScopeSchema>;

const accessFields = {
  roles: rolesSchema,
  branchScope: branchScopeSchema,
  adjustments: permissionAdjustmentsSchema.default({ granted: [], revoked: [] }),
  /** Required with the doctor role when the member has no practitioner profile (rule 1, edge 11). */
  practitioner: practitionerProfileInputSchema.optional(),
};

type AccessInput = { roles: Role[]; branchScope: BranchScope };

function ownersHaveEveryBranch(input: AccessInput): boolean {
  return !input.roles.includes('owner') || input.branchScope.allFacilities;
}

const ownerScopeIssue = {
  message: 'Owners have every branch',
  path: ['branchScope'],
};

export const createInvitationSchema = z
  .object({
    phone: mobilePhoneNumberSchema,
    name: invitedNameSchema,
    ...accessFields,
  })
  .refine(ownersHaveEveryBranch, ownerScopeIssue)
  .refine((input) => !input.roles.includes('doctor') || input.practitioner !== undefined, {
    message: 'The doctor role needs a practitioner profile',
    path: ['practitioner'],
  })
  .meta({ id: 'CreateInvitation' });

export type CreateInvitation = z.infer<typeof createInvitationSchema>;

export const changeStaffAccessSchema = z
  .object({ ...accessFields, expectedUpdatedAt: z.iso.datetime() })
  .refine(ownersHaveEveryBranch, ownerScopeIssue)
  .meta({ id: 'ChangeStaffAccess' });

export type ChangeStaffAccess = z.infer<typeof changeStaffAccessSchema>;

/**
 * Refuses a change that would leave the tenant without an active owner (rule 5): `activeOwners`
 * is the number of active owners after the change.
 */
export function assertOwnerRemains(activeOwners: number): void {
  if (activeOwners < 1) throw new DomainError('LAST_OWNER', 'The tenant needs an active owner');
}
