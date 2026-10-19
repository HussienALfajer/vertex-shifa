import { describe, expect, it } from 'vitest';
import { staffAccess } from './staff-access';

const branchA = '0199f000-0000-7000-8000-0000000000a1';
const branchB = '0199f000-0000-7000-8000-0000000000b1';

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
    });
    expect(access.manageTenant).toBe(true);
    expect(access.manageFacility(branchB)).toBe(true);
  });

  it('limits a branch-scoped permission to the member’s branches (rule 7)', () => {
    const access = staffAccess({
      permissions: ['facility.manage'],
      allFacilities: false,
      facilityIds: [branchA],
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
    });
    expect(access.manageTenant).toBe(false);
    expect(access.manageFacility(branchA)).toBe(false);
  });
});
