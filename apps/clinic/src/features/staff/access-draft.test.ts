import { accessCatalog, effectivePermissions } from '@vertex-shifa/contracts';
import { describe, expect, it } from 'vitest';
import {
  type AccessDraft,
  accessAdjustments,
  accessErrors,
  branchScope,
  emptyAccessDraft,
  permissionRows,
  setPermission,
  setRoles,
} from './access-draft';

const catalog = accessCatalog();
const branchId = '0199f000-0000-7000-8000-000000000010';

function draft(overrides: Partial<AccessDraft>): AccessDraft {
  return { ...emptyAccessDraft(), ...overrides };
}

function row(state: AccessDraft, key: string) {
  return permissionRows(catalog, state, { self: false }).find(
    (item) => item.permission.key === key,
  );
}

describe('permission rows', () => {
  it('shows the presets of the roles as "from role"', () => {
    const reception = draft({ roles: ['reception'] });
    expect(row(reception, 'tenant.read')).toMatchObject({ held: true, origin: 'role' });
    expect(row(reception, 'staff.read')).toMatchObject({ held: false, origin: 'none' });
  });

  it('disables what is outside the limits of the roles', () => {
    const reception = draft({ roles: ['reception'] });
    expect(row(reception, 'staff.manage')).toMatchObject({ held: false, blocked: 'limit' });
    expect(row(reception, 'practitioner.edit_own')).toMatchObject({ blocked: 'limit' });
    expect(row(draft({ roles: ['doctor'] }), 'practitioner.edit_own')).toMatchObject({
      held: true,
      blocked: null,
    });
  });

  it('keeps the owner-only permissions with owners', () => {
    const owner = draft({ roles: ['owner'], revoked: ['staff.manage', 'staff.read'] });
    for (const key of ['tenant.read', 'staff.read', 'staff.manage', 'practitioners.read']) {
      expect(row(owner, key), key).toMatchObject({ held: true, blocked: 'ownerLocked' });
    }
    expect(row(owner, 'devices.manage')).toMatchObject({ held: true, blocked: null });
  });

  it('keeps what the roles give on the owner’s own record, removals there undoable', () => {
    const own = (state: AccessDraft, key: string) =>
      permissionRows(catalog, state, { self: true }).find((item) => item.permission.key === key);
    const owner = draft({ roles: ['owner'], revoked: ['facility.manage'] });
    expect(own(owner, 'devices.manage')).toMatchObject({ held: true, blocked: 'self' });
    expect(own(owner, 'facility.manage')).toMatchObject({ held: false, blocked: null });
    // The rule does not depend on the role.
    const doctor = draft({ roles: ['doctor'], revoked: ['practitioners.read'] });
    expect(own(doctor, 'tenant.read')).toMatchObject({ held: true, blocked: 'self' });
    expect(own(doctor, 'practitioners.read')).toMatchObject({ held: false, blocked: null });
  });

  it('marks what the owner added and removed', () => {
    let state = draft({ roles: ['reception'] });
    state = setPermission(catalog, state, 'devices.manage', true);
    state = setPermission(catalog, state, 'practitioners.read', false);
    expect(state.granted).toEqual(['devices.manage']);
    expect(state.revoked).toEqual(['practitioners.read']);
    expect(row(state, 'devices.manage')).toMatchObject({ held: true, origin: 'added' });
    expect(row(state, 'practitioners.read')).toMatchObject({ held: false, origin: 'removed' });

    // Undoing an adjustment leaves nothing behind.
    state = setPermission(catalog, state, 'devices.manage', false);
    state = setPermission(catalog, state, 'practitioners.read', true);
    expect(state.granted).toEqual([]);
    expect(state.revoked).toEqual([]);
  });

  it('holds what the API computes as effective', () => {
    const state = draft({
      roles: ['doctor', 'nurse'],
      granted: ['staff.read', 'devices.manage'],
      revoked: ['tenant.read'],
    });
    const held = permissionRows(catalog, state, { self: false })
      .filter((item) => item.held)
      .map((item) => item.permission.key);
    expect(held).toEqual(effectivePermissions(state.roles, state.granted, state.revoked));
  });
});

describe('adjustments sent', () => {
  it('drops what a role change made pointless or not grantable', () => {
    // A doctor-only grant stays from before; the doctor role was removed meanwhile.
    const state = draft({
      roles: ['owner'],
      granted: ['practitioner.edit_own', 'staff.read'],
      revoked: ['tenant.manage', 'devices.manage', 'staff.read'],
    });
    expect(accessAdjustments(catalog, state)).toEqual({
      granted: [],
      revoked: ['devices.manage'],
    });
  });
});

describe('roles and branches', () => {
  it('gives owners every branch', () => {
    const state = setRoles(draft({ allFacilities: false, facilityIds: [branchId] }), ['owner']);
    expect(state.allFacilities).toBe(true);
    expect(branchScope(state)).toEqual({ allFacilities: true });
  });

  it('needs a role and a branch', () => {
    expect(accessErrors(draft({}))).toEqual({ roles: true });
    expect(accessErrors(draft({ roles: ['nurse'], allFacilities: false }))).toEqual({
      branches: true,
    });
    const scoped = draft({ roles: ['nurse'], allFacilities: false, facilityIds: [branchId] });
    expect(accessErrors(scoped)).toEqual({});
    expect(branchScope(scoped)).toEqual({ allFacilities: false, facilityIds: [branchId] });
  });
});
