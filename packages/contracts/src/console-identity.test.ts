import { describe, expect, it } from 'vitest';
import {
  assertAdminRemains,
  platformPermissionKeys,
  platformRoleHolds,
  recoveryCodeSchema,
  setupCodeSchema,
  totpCodeSchema,
} from './console-identity.js';
import { DomainError } from './errors.js';

describe('platform roles', () => {
  it('give admins every console permission', () => {
    for (const permission of platformPermissionKeys) {
      expect(platformRoleHolds('admin', permission)).toBe(true);
    }
  });

  it('give support everything but platform user management', () => {
    for (const permission of platformPermissionKeys) {
      expect(platformRoleHolds('support', permission), permission).toBe(
        permission !== 'platform-users.manage',
      );
    }
  });
});

describe('typed codes', () => {
  it('accept setup and recovery codes in any case, with spaces around', () => {
    expect(setupCodeSchema.parse(' abcd-efgh-2345 ')).toBe('ABCD-EFGH-2345');
    expect(recoveryCodeSchema.parse('wxyz-7654')).toBe('WXYZ-7654');
    expect(setupCodeSchema.safeParse('ABCD-EFGH').success).toBe(false);
    expect(recoveryCodeSchema.safeParse('ABC1-2345').success).toBe(false);
  });

  it('take TOTP codes of six digits', () => {
    expect(totpCodeSchema.safeParse('012345').success).toBe(true);
    expect(totpCodeSchema.safeParse('12345').success).toBe(false);
  });
});

describe('last admin', () => {
  it('refuses leaving no active admin', () => {
    expect(() => assertAdminRemains(0)).toThrow(DomainError);
    expect(() => assertAdminRemains(2)).not.toThrow();
  });
});
