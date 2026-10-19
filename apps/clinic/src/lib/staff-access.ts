import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Me } from '@vertex-shifa/contracts';
import { useMemo } from 'react';
import { api, unwrap } from './api';

/** The signed-in member: account, roles, branches and effective permissions (`GET /api/me`). */
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: (): Promise<Me> => unwrap(api.GET('/api/me')),
});

/** What the signed-in staff member may do in clinic setup (S01 permissions). */
export type StaffAccess = {
  /** `tenant.manage`: the owner's clinic profile, onboarding and branches. */
  manageTenant: boolean;
  /** `facility.manage` on one branch, or `tenant.manage`. */
  manageFacility: (facilityId: string) => boolean;
};

/**
 * The access a member's effective permissions give (rule 7: branch-scoped permissions apply in
 * the member's branches only). Before the member is known, nothing.
 */
export function staffAccess(
  me: Pick<Me, 'permissions' | 'allFacilities' | 'facilityIds'> | undefined,
): StaffAccess {
  const permissions = new Set(me?.permissions ?? []);
  const manageTenant = permissions.has('tenant.manage');
  return {
    manageTenant,
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
