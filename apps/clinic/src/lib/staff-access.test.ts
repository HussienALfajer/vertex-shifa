import { describe, expect, it } from 'vitest';
import { staffAccess } from './staff-access';

const branchA = '0199f000-0000-7000-8000-0000000000a1';
const branchB = '0199f000-0000-7000-8000-0000000000b1';
const self = '0199f000-0000-7000-8000-0000000000c1';
const other = '0199f000-0000-7000-8000-0000000000c2';

describe('staff access', () => {
  it('gives nothing before the member is known', () => {
    const access = staffAccess(undefined);
    expect(access.manageTenant).toBe(false);
    expect(access.manageFacility(branchA)).toBe(false);
  });

  it('gives the owner every branch', () => {
    const access = staffAccess({
      permissions: ['tenant.manage'],
      allFacilities: true,
      facilityIds: [],
      membershipId: self,
    });
    expect(access.manageTenant).toBe(true);
    expect(access.manageFacility(branchB)).toBe(true);
  });

  it('limits a branch-scoped permission to the member’s branches (rule 7)', () => {
    const access = staffAccess({
      permissions: ['facility.manage'],
      allFacilities: false,
      facilityIds: [branchA],
      membershipId: self,
    });
    expect(access.manageTenant).toBe(false);
    expect(access.manageFacility(branchA)).toBe(true);
    expect(access.manageFacility(branchB)).toBe(false);
  });

  it('gives a receptionist no setup access', () => {
    const access = staffAccess({
      permissions: ['staff.read'],
      allFacilities: true,
      facilityIds: [],
      membershipId: self,
    });
    expect(access.manageTenant).toBe(false);
    expect(access.manageFacility(branchA)).toBe(false);
  });

  it('lets a doctor edit their own profile only, and the owner every profile (rule 34)', () => {
    const doctor = staffAccess({
      permissions: ['practitioner.edit_own'],
      allFacilities: true,
      facilityIds: [],
      membershipId: self,
    });
    expect(doctor.editPractitioner(self)).toBe(true);
    expect(doctor.editPractitioner(other)).toBe(false);
    expect(doctor.readStaff).toBe(false);
    const owner = staffAccess({
      permissions: ['staff.read', 'staff.manage', 'devices.manage'],
      allFacilities: true,
      facilityIds: [],
      membershipId: self,
    });
    expect(owner.editPractitioner(other)).toBe(true);
    expect(owner.readStaff && owner.manageStaff && owner.manageDevices).toBe(true);
  });
});
