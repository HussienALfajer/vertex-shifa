import { describe, expect, it } from 'vitest';
import {
  assertAdminRemains,
  consoleSignInSchema,
  consoleTotpSchema,
  platformPermissionKeys,
  platformRoleHolds,
  recoveryCodeSchema,
  setupCodeSchema,
  totpCodeSchema,
  updatePlatformUserSchema,
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

describe('console route shapes', () => {
  const proofOfWork = { challenge: 'c', nonce: '1' };
  const phone = '0930 000 101';

  it('sign in with the password or the setup code, never both or neither', () => {
    expect(consoleSignInSchema.safeParse({ phone, password: 'x', proofOfWork }).success).toBe(true);
    expect(
      consoleSignInSchema.safeParse({ phone, setupCode: 'abcd-efgh-2345', proofOfWork }).data
        ?.setupCode,
    ).toBe('ABCD-EFGH-2345');
    expect(consoleSignInSchema.safeParse({ phone, proofOfWork }).success).toBe(false);
    expect(
      consoleSignInSchema.safeParse({
        phone,
        password: 'x',
        setupCode: 'ABCD-EFGH-2345',
        proofOfWork,
      }).success,
    ).toBe(false);
  });

  it('take a TOTP code or a recovery code at the TOTP step', () => {
    expect(consoleTotpSchema.safeParse({ ticket: 't', code: '123456' }).success).toBe(true);
    expect(consoleTotpSchema.safeParse({ ticket: 't', code: 'abcd-2345' }).data?.code).toBe(
      'ABCD-2345',
    );
    expect(consoleTotpSchema.safeParse({ ticket: 't', code: '12345' }).success).toBe(false);
  });

  it('change a platform user only with something to change', () => {
    expect(updatePlatformUserSchema.safeParse({ role: 'support' }).success).toBe(true);
    expect(updatePlatformUserSchema.safeParse({ disabled: false }).success).toBe(true);
    expect(updatePlatformUserSchema.safeParse({}).success).toBe(false);
  });
});
