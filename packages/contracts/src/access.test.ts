import { describe, expect, it } from 'vitest';
import {
  accessCatalog,
  accessCatalogSchema,
  assertAdjustmentsAllowed,
  clinicalReadScopeSchema,
  effectivePermissions,
  grantablePermissions,
  idleLockMinutesSchema,
  type PermissionKey,
  permissionAdjustmentsSchema,
  permissionCatalog,
  permissionKeys,
  presetPermissions,
  type Role,
  rolePresets,
  roleSchema,
  rolesSchema,
  withinLimit,
} from './access.js';
import { DomainError } from './errors.js';

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

const allRoles = roleSchema.options;

// The spec's table "Permissions enforced in S02 (and S01)", row by row.
const specTable: Record<PermissionKey, { scoped: boolean; roles: Role[]; limit: 'any' | Role[] }> =
  {
    'tenant.read': {
      scoped: false,
      roles: ['owner', 'doctor', 'reception', 'nurse', 'accountant'],
      limit: 'any',
    },
    'tenant.manage': { scoped: false, roles: ['owner'], limit: ['owner'] },
    'facility.manage': { scoped: true, roles: ['owner'], limit: 'any' },
    'staff.read': { scoped: false, roles: ['owner'], limit: 'any' },
    'staff.manage': { scoped: false, roles: ['owner'], limit: ['owner'] },
    'devices.manage': { scoped: true, roles: ['owner'], limit: 'any' },
    'practitioners.read': {
      scoped: false,
      roles: ['owner', 'doctor', 'reception', 'nurse', 'accountant'],
      limit: 'any',
    },
    'practitioner.edit_own': { scoped: false, roles: ['doctor'], limit: ['doctor'] },
  };

describe('permission catalog', () => {
  it('holds exactly the permissions of the spec table', () => {
    expect([...permissionKeys].sort()).toEqual(Object.keys(specTable).sort());
  });

  it.each(Object.entries(specTable))('%s: branch scope, presets and limit', (key, row) => {
    const permission = key as PermissionKey;
    expect(permissionCatalog[permission].branchScoped).toBe(row.scoped);
    for (const role of allRoles) {
      expect((rolePresets[role] as readonly string[]).includes(permission), `${role} preset`).toBe(
        row.roles.includes(role),
      );
      const allowed = row.limit === 'any' || row.limit.includes(role);
      expect(withinLimit(permission, [role]), `${role} limit`).toBe(allowed);
    }
  });

  it('keeps every preset within its limits', () => {
    for (const role of allRoles) {
      for (const permission of rolePresets[role])
        expect(withinLimit(permission, [role])).toBe(true);
    }
  });
});

describe('roles', () => {
  it('accepts 1–5 distinct roles', () => {
    expect(rolesSchema.safeParse(['doctor', 'owner']).success).toBe(true);
    expect(rolesSchema.safeParse([]).success).toBe(false);
    expect(rolesSchema.safeParse(['doctor', 'doctor']).success).toBe(false);
    expect(rolesSchema.safeParse(['surgeon']).success).toBe(false);
  });
});

describe('effectivePermissions', () => {
  it('is the union of the roles presets without adjustments', () => {
    expect(effectivePermissions(['reception'], [], [])).toEqual([
      'tenant.read',
      'practitioners.read',
    ]);
    expect(effectivePermissions(['doctor', 'owner'], [], [])).toEqual([...permissionKeys]);
    expect(presetPermissions(['nurse', 'accountant'])).toEqual([
      'tenant.read',
      'practitioners.read',
    ]);
  });

  it('adds grants and removes revocations', () => {
    expect(effectivePermissions(['reception'], ['staff.read', 'devices.manage'], [])).toEqual([
      'tenant.read',
      'staff.read',
      'devices.manage',
      'practitioners.read',
    ]);
    expect(effectivePermissions(['doctor'], [], ['practitioner.edit_own'])).toEqual([
      'tenant.read',
      'practitioners.read',
    ]);
  });

  it('drops grants outside the limits, so losing the doctor role loses doctor-only grants', () => {
    expect(
      effectivePermissions(['reception'], ['practitioner.edit_own', 'staff.manage'], []),
    ).toEqual(['tenant.read', 'practitioners.read']);
    expect(effectivePermissions(['nurse'], ['tenant.manage'], [])).not.toContain('tenant.manage');
  });

  it('never takes tenant.manage or staff.manage from an owner', () => {
    expect(
      effectivePermissions(['owner'], [], ['tenant.manage', 'staff.manage', 'staff.read']),
    ).toEqual([
      'tenant.read',
      'tenant.manage',
      'facility.manage',
      'staff.manage',
      'devices.manage',
      'practitioners.read',
    ]);
  });
});

describe('grantablePermissions', () => {
  it('lists what the roles may hold', () => {
    expect(grantablePermissions(['reception'])).toEqual([
      'tenant.read',
      'facility.manage',
      'staff.read',
      'devices.manage',
      'practitioners.read',
    ]);
    expect(grantablePermissions(['doctor'])).toContain('practitioner.edit_own');
    expect(grantablePermissions(['owner'])).toContain('staff.manage');
    expect(grantablePermissions(['owner'])).not.toContain('practitioner.edit_own');
  });
});

describe('assertAdjustmentsAllowed', () => {
  it('accepts grants within the limits', () => {
    expect(() =>
      assertAdjustmentsAllowed(['reception'], ['devices.manage'], ['tenant.read']),
    ).not.toThrow();
  });

  it('refuses a grant outside the limits', () => {
    expect(refusal(() => assertAdjustmentsAllowed(['reception'], ['staff.manage'], []))).toBe(
      'PERMISSION_NOT_GRANTABLE',
    );
    expect(refusal(() => assertAdjustmentsAllowed(['nurse'], ['practitioner.edit_own'], []))).toBe(
      'PERMISSION_NOT_GRANTABLE',
    );
  });

  it('refuses revoking an owner’s locked permissions', () => {
    for (const permission of ['tenant.manage', 'staff.manage'] as const) {
      expect(refusal(() => assertAdjustmentsAllowed(['owner'], [], [permission]))).toBe(
        'PERMISSION_NOT_GRANTABLE',
      );
    }
    expect(() => assertAdjustmentsAllowed(['owner'], [], ['staff.read'])).not.toThrow();
  });
});

describe('permission adjustments', () => {
  it('defaults to none and refuses duplicates or a permission both granted and revoked', () => {
    expect(permissionAdjustmentsSchema.parse({})).toEqual({ granted: [], revoked: [] });
    expect(
      permissionAdjustmentsSchema.safeParse({ granted: ['staff.read', 'staff.read'] }).success,
    ).toBe(false);
    expect(
      permissionAdjustmentsSchema.safeParse({ granted: ['staff.read'], revoked: ['staff.read'] })
        .success,
    ).toBe(false);
    expect(permissionAdjustmentsSchema.safeParse({ granted: ['patients.read'] }).success).toBe(
      false,
    );
  });
});

describe('tenant security settings', () => {
  it('bounds the idle lock to 5–60 minutes', () => {
    expect(idleLockMinutesSchema.safeParse(5).success).toBe(true);
    expect(idleLockMinutesSchema.safeParse(60).success).toBe(true);
    expect(idleLockMinutesSchema.safeParse(4).success).toBe(false);
    expect(idleLockMinutesSchema.safeParse(61).success).toBe(false);
  });

  it('knows the two clinical read scopes', () => {
    expect(clinicalReadScopeSchema.options).toEqual(['branch', 'own_patients']);
  });
});

describe('the catalog for the permission editor', () => {
  it('lists every permission with its limit, every preset and the owner-locked keys', () => {
    const catalog = accessCatalog();
    expect(catalog.permissions.map((permission) => permission.key)).toEqual(permissionKeys);
    expect(catalog.permissions.find((p) => p.key === 'staff.manage')?.limit).toEqual(['owner']);
    expect(catalog.presets.reception).toEqual([...rolePresets.reception]);
    expect(accessCatalogSchema.parse(catalog)).toEqual(catalog);
  });
});
