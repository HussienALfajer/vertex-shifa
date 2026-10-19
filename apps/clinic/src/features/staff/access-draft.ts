import type {
  AccessCatalog,
  BranchScope,
  PermissionAdjustments,
  PermissionKey,
  Role,
  StaffMember,
} from '@vertex-shifa/contracts';

/**
 * A member's access as the invite and member forms hold it (screen 7): roles, branch scope and the
 * owner's adjustments. The catalog comes from the API (`GET /api/access/catalog`), so the editor
 * shows the presets and limits the server applies.
 */
export type AccessDraft = {
  roles: Role[];
  allFacilities: boolean;
  facilityIds: string[];
  granted: PermissionKey[];
  revoked: PermissionKey[];
};

export function emptyAccessDraft(): AccessDraft {
  return { roles: [], allFacilities: true, facilityIds: [], granted: [], revoked: [] };
}

export function accessDraftFromMember(member: StaffMember): AccessDraft {
  return {
    roles: [...member.roles],
    allFacilities: member.branchScope.allFacilities,
    facilityIds: member.branchScope.allFacilities ? [] : [...member.branchScope.facilityIds],
    granted: [...member.adjustments.granted],
    revoked: [...member.adjustments.revoked],
  };
}

type CatalogPermission = AccessCatalog['permissions'][number];

function withinLimit(permission: CatalogPermission, roles: readonly Role[]): boolean {
  return permission.limit === 'any' || permission.limit.some((role) => roles.includes(role));
}

function presetOf(catalog: AccessCatalog, roles: readonly Role[]): Set<PermissionKey> {
  return new Set(roles.flatMap((role) => catalog.presets[role] ?? []));
}

function ownerLocked(catalog: AccessCatalog, key: PermissionKey, roles: readonly Role[]): boolean {
  return roles.includes('owner') && catalog.ownerLocked.includes(key);
}

/**
 * How a permission comes to the member: from a role's preset, added or removed by the owner, or
 * not held at all.
 */
export type PermissionOrigin = 'role' | 'added' | 'removed' | 'none';

export type PermissionRow = {
  permission: CatalogPermission;
  held: boolean;
  origin: PermissionOrigin;
  /**
   * Why the owner cannot change it: outside the limits of the member's roles (`limit`), or one an
   * owner always keeps (`ownerLocked`).
   */
  blocked: 'limit' | 'ownerLocked' | null;
};

/** Every permission of the catalog, in its order, as the member's draft gives it. */
export function permissionRows(catalog: AccessCatalog, draft: AccessDraft): PermissionRow[] {
  const preset = presetOf(catalog, draft.roles);
  return catalog.permissions.map((permission): PermissionRow => {
    const { key } = permission;
    if (!withinLimit(permission, draft.roles)) {
      return { permission, held: false, origin: 'none', blocked: 'limit' };
    }
    if (ownerLocked(catalog, key, draft.roles)) {
      return { permission, held: true, origin: 'role', blocked: 'ownerLocked' };
    }
    const inPreset = preset.has(key);
    if (inPreset) {
      return draft.revoked.includes(key)
        ? { permission, held: false, origin: 'removed', blocked: null }
        : { permission, held: true, origin: 'role', blocked: null };
    }
    return draft.granted.includes(key)
      ? { permission, held: true, origin: 'added', blocked: null }
      : { permission, held: false, origin: 'none', blocked: null };
  });
}

/** Gives or takes one permission: an adjustment only where it differs from the roles' presets. */
export function setPermission(
  catalog: AccessCatalog,
  draft: AccessDraft,
  key: PermissionKey,
  held: boolean,
): AccessDraft {
  const inPreset = presetOf(catalog, draft.roles).has(key);
  const granted = draft.granted.filter((item) => item !== key);
  const revoked = draft.revoked.filter((item) => item !== key);
  if (held && !inPreset) granted.push(key);
  if (!held && inPreset) revoked.push(key);
  return { ...draft, granted, revoked };
}

/** Owners have every branch (rule 5): choosing the owner role sets it. */
export function setRoles(draft: AccessDraft, roles: Role[]): AccessDraft {
  return roles.includes('owner') ? { ...draft, roles, allFacilities: true } : { ...draft, roles };
}

/**
 * The adjustments the API accepts for the draft's roles: grants within the limits that the presets
 * do not already give, revocations of what the presets give and an owner may lose. Adjustments a
 * role change made pointless are dropped, never sent as `PERMISSION_NOT_GRANTABLE`.
 */
export function accessAdjustments(
  catalog: AccessCatalog,
  draft: AccessDraft,
): PermissionAdjustments {
  const preset = presetOf(catalog, draft.roles);
  const permission = (key: PermissionKey) => catalog.permissions.find((item) => item.key === key);
  return {
    granted: draft.granted.filter((key) => {
      const found = permission(key);
      return found !== undefined && withinLimit(found, draft.roles) && !preset.has(key);
    }),
    revoked: draft.revoked.filter(
      (key) => preset.has(key) && !ownerLocked(catalog, key, draft.roles),
    ),
  };
}

export function branchScope(draft: AccessDraft): BranchScope {
  return draft.allFacilities || draft.roles.includes('owner')
    ? { allFacilities: true }
    : { allFacilities: false, facilityIds: draft.facilityIds };
}

export type AccessErrors = { roles?: true; branches?: true };

/** At least one role, and every branch or at least one (rule 1, edge case 4). */
export function accessErrors(draft: AccessDraft): AccessErrors {
  const errors: AccessErrors = {};
  if (draft.roles.length === 0) errors.roles = true;
  if (!branchScope(draft).allFacilities && draft.facilityIds.length === 0) errors.branches = true;
  return errors;
}
