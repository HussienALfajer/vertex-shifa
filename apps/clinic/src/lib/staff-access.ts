/** What the signed-in staff member may do in clinic setup (S01 permissions). */
export type StaffAccess = {
  /** `tenant.manage`: the owner's clinic profile, onboarding and branches. */
  manageTenant: boolean;
  /** `facility.manage` on one branch, or `tenant.manage`. */
  manageFacility: (facilityId: string) => boolean;
};

const ownerAccess: StaffAccess = { manageTenant: true, manageFacility: () => true };

/**
 * The staff member's access, for what the screens show. Until S02 there are no sessions, so every
 * screen is the owner's; S02 reads the session's permissions here. Cosmetic only: the API decides
 * every request (ADR 0005).
 */
export function useStaffAccess(): StaffAccess {
  return ownerAccess;
}
