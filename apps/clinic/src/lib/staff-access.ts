import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Me } from '@vertex-shifa/contracts';
import { useMemo } from 'react';
import { api, unwrap } from './api';

/** The signed-in member: account, roles, branches and effective permissions (`GET /api/me`). */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: (): Promise<Me> => unwrap(api.GET('/api/me')),
});

/** What the signed-in staff member may do in clinic setup and staff settings (S01, S02). */
export type StaffAccess = {
  /** `tenant.manage`: the owner's clinic profile, onboarding, branches and security settings. */
  manageTenant: boolean;
  /** `facility.manage` on one branch, or `tenant.manage`. */
  manageFacility: (facilityId: string) => boolean;
  /** `staff.read`: the staff list and members, read-only without `staff.manage`. */
  readStaff: boolean;
  /** `staff.manage` (owners only): invitations, access, deactivation, every doctor profile. */
  manageStaff: boolean;
  /** `devices.manage` in at least one branch: the devices screen (the API keeps it in scope). */
  manageDevices: boolean;
  /** The owner, or the doctor for their own profile (`practitioner.edit_own`, rule 34). */
  editPractitioner: (membershipId: string) => boolean;
};

/**
 * The access a member's effective permissions give (rule 7: branch-scoped permissions apply in
 * the member's branches only). Before the member is known, nothing.
 */
export function staffAccess(
  me: Pick<Me, 'permissions' | 'allFacilities' | 'facilityIds' | 'membershipId'> | undefined,
): StaffAccess {
  const permissions = new Set(me?.permissions ?? []);
  const manageTenant = permissions.has('tenant.manage');
  const manageStaff = permissions.has('staff.manage');
  return {
    manageTenant,
    readStaff: permissions.has('staff.read'),
    manageStaff,
    manageDevices: permissions.has('devices.manage'),
    editPractitioner: (membershipId) =>
      manageStaff ||
      (permissions.has('practitioner.edit_own') && me?.membershipId === membershipId),
    manageFacility: (facilityId) =>
      manageTenant ||
      (permissions.has('facility.manage') &&
        (me?.allFacilities === true || (me?.facilityIds.includes(facilityId) ?? false))),
  };
}

/**
 * The staff member's access, for what the screens show, from the session's member. Cosmetic only:
 * the API decides every request (ADR 0005).
 */
export function useStaffAccess(): StaffAccess {
  const me = useQuery(meQuery);
  return useMemo(() => staffAccess(me.data), [me.data]);
}
