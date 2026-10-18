import { z } from 'zod';
import { DomainError } from './errors.js';

/**
 * Clinic staff permissions (ADR 0005, ADR 0024, spec S02 "Access"). Roles and their presets are
 * code, not rows: a member's effective permissions are the union of their roles' presets, plus the
 * owner's grants, minus the owner's revocations, then filtered by each permission's limit. A preset
 * changed in a later release reaches every member; their adjustments stay. Later specs add their
 * keys to the catalog with the defaults and limits S02 fixed.
 */

export const roles = ['owner', 'doctor', 'reception', 'nurse', 'accountant'] as const;

export const roleSchema = z.enum(roles).meta({ id: 'StaffRole' });

export type Role = z.infer<typeof roleSchema>;

/** 1–5 distinct roles; a member always has at least one. */
export const rolesSchema = z
  .array(roleSchema)
  .min(1)
  .max(roles.length)
  .refine((list) => new Set(list).size === list.length, 'A role appears twice');

export const permissionGroups = ['clinic', 'staff', 'devices', 'practitioners'] as const;

export type PermissionGroup = (typeof permissionGroups)[number];

export type PermissionInfo = {
  group: PermissionGroup;
  /** Applies only in the member's branches (spec S02 rule 7). */
  branchScoped: boolean;
  /** The roles a member needs to hold the permission at all, or `any`. */
  limit: 'any' | readonly [Role, ...Role[]];
};

export const permissionCatalog = {
  'tenant.read': { group: 'clinic', branchScoped: false, limit: 'any' },
  'tenant.manage': { group: 'clinic', branchScoped: false, limit: ['owner'] },
  'facility.manage': { group: 'clinic', branchScoped: true, limit: 'any' },
  'staff.read': { group: 'staff', branchScoped: false, limit: 'any' },
  'staff.manage': { group: 'staff', branchScoped: false, limit: ['owner'] },
  'devices.manage': { group: 'devices', branchScoped: true, limit: 'any' },
  'practitioners.read': { group: 'practitioners', branchScoped: false, limit: 'any' },
  'practitioner.edit_own': { group: 'practitioners', branchScoped: false, limit: ['doctor'] },
} as const satisfies Record<string, PermissionInfo>;

export type PermissionKey = keyof typeof permissionCatalog;

export const permissionKeys = Object.keys(permissionCatalog) as [PermissionKey, ...PermissionKey[]];

export const permissionKeySchema = z.enum(permissionKeys).meta({ id: 'PermissionKey' });

/** What each role holds before the owner's adjustments. Owners have every branch. */
export const rolePresets = {
  owner: [
    'tenant.read',
    'tenant.manage',
    'facility.manage',
    'staff.read',
    'staff.manage',
    'devices.manage',
    'practitioners.read',
  ],
  doctor: ['tenant.read', 'practitioners.read', 'practitioner.edit_own'],
  reception: ['tenant.read', 'practitioners.read'],
  nurse: ['tenant.read', 'practitioners.read'],
  accountant: ['tenant.read', 'practitioners.read'],
} as const satisfies Record<Role, readonly PermissionKey[]>;

/** Owners never lose these (spec S02 rule 6): a tenant is always manageable by its owners. */
export const ownerLockedPermissions = [
  'tenant.manage',
  'staff.manage',
] as const satisfies readonly PermissionKey[];

/** Whether a member with `memberRoles` may hold `permission` at all. */
export function withinLimit(permission: PermissionKey, memberRoles: readonly Role[]): boolean {
  const { limit } = permissionCatalog[permission] as PermissionInfo;
  return limit === 'any' || limit.some((role) => memberRoles.includes(role));
}

/** Every permission the owner may grant to a member with `memberRoles`, in catalog order. */
export function grantablePermissions(memberRoles: readonly Role[]): PermissionKey[] {
  return permissionKeys.filter((permission) => withinLimit(permission, memberRoles));
}

/** The permissions a member's roles give before adjustments, in catalog order. */
export function presetPermissions(memberRoles: readonly Role[]): PermissionKey[] {
  const preset = new Set<PermissionKey>(memberRoles.flatMap((role) => rolePresets[role]));
  return permissionKeys.filter((permission) => preset.has(permission));
}

/**
 * The permissions a member holds, in catalog order: presets plus grants minus revocations, then
 * filtered by the limits, so a member who loses the doctor role loses doctor-only grants at once.
 * An owner keeps `ownerLockedPermissions` whatever the stored revocations say.
 */
export function effectivePermissions(
  memberRoles: readonly Role[],
  granted: readonly PermissionKey[],
  revoked: readonly PermissionKey[],
): PermissionKey[] {
  const held = new Set<PermissionKey>([...presetPermissions(memberRoles), ...granted]);
  for (const permission of revoked) held.delete(permission);
  if (memberRoles.includes('owner')) {
    for (const permission of ownerLockedPermissions) held.add(permission);
  }
  return permissionKeys.filter(
    (permission) => held.has(permission) && withinLimit(permission, memberRoles),
  );
}

/**
 * Refuses adjustments outside the limits (spec S02 rule 6) with `PERMISSION_NOT_GRANTABLE`: a grant
 * the member's roles may not hold, or the revocation of an owner's locked permission. Run on every
 * write of roles or adjustments.
 */
export function assertAdjustmentsAllowed(
  memberRoles: readonly Role[],
  granted: readonly PermissionKey[],
  revoked: readonly PermissionKey[],
): void {
  for (const permission of granted) {
    if (!withinLimit(permission, memberRoles)) {
      throw new DomainError('PERMISSION_NOT_GRANTABLE', `${permission} is outside the limits`);
    }
  }
  if (memberRoles.includes('owner')) {
    for (const permission of revoked) {
      if ((ownerLockedPermissions as readonly string[]).includes(permission)) {
        throw new DomainError('PERMISSION_NOT_GRANTABLE', `${permission} stays with owners`);
      }
    }
  }
}

/** Grants and revocations: catalog keys, each at most once, never both granted and revoked. */
export const permissionAdjustmentsSchema = z
  .object({
    granted: z.array(permissionKeySchema).max(permissionKeys.length).default([]),
    revoked: z.array(permissionKeySchema).max(permissionKeys.length).default([]),
  })
  .refine(
    ({ granted, revoked }) =>
      new Set(granted).size === granted.length &&
      new Set(revoked).size === revoked.length &&
      granted.every((permission) => !revoked.includes(permission)),
    'A permission is listed twice or both granted and revoked',
  )
  .meta({ id: 'PermissionAdjustments' });

export type PermissionAdjustments = z.infer<typeof permissionAdjustmentsSchema>;

/**
 * Which patients a doctor reads (spec S02, applied by S11): every patient of their branches, or
 * their own patients with break-glass for the others.
 */
export const clinicalReadScopeSchema = z
  .enum(['branch', 'own_patients'])
  .meta({ id: 'ClinicalReadScope' });

export type ClinicalReadScope = z.infer<typeof clinicalReadScopeSchema>;

/** Minutes without input before the clinic app locks; the owner sets it per tenant. */
export const idleLockMinutesSchema = z.int().min(5).max(60).meta({ id: 'IdleLockMinutes' });

export const DEFAULT_IDLE_LOCK_MINUTES = 15;

/** The catalog as the clinic app shows it in the permission editor (`GET /api/access/catalog`). */
export const accessCatalogSchema = z
  .object({
    permissions: z.array(
      z.object({
        key: permissionKeySchema,
        group: z.enum(permissionGroups),
        branchScoped: z.boolean(),
        /** The roles a member needs to hold it, or `any`. */
        limit: z.union([z.literal('any'), z.array(roleSchema)]),
      }),
    ),
    presets: z.record(roleSchema, z.array(permissionKeySchema)),
    ownerLocked: z.array(permissionKeySchema),
  })
  .meta({ id: 'AccessCatalog' });

export type AccessCatalog = z.infer<typeof accessCatalogSchema>;

export function accessCatalog(): AccessCatalog {
  return {
    permissions: permissionKeys.map((key) => {
      const info = permissionCatalog[key] as PermissionInfo;
      return {
        key,
        group: info.group,
        branchScoped: info.branchScoped,
        limit: info.limit === 'any' ? 'any' : [...info.limit],
      };
    }),
    presets: Object.fromEntries(
      roles.map((role) => [role, [...rolePresets[role]]]),
    ) as AccessCatalog['presets'],
    ownerLocked: [...ownerLockedPermissions],
  };
}
