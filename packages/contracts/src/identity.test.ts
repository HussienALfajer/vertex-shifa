import { describe, expect, it } from 'vitest';
import { commonPasswords } from './common-passwords.js';
import { DomainError } from './errors.js';
import {
  assertPasswordStrong,
  isTrivialPin,
  isWeakPassword,
  isWeakPin,
  OFFLINE_WINDOW_DAYS,
  offlineWindow,
  otpCodeSchema,
  passwordSchema,
  pinSchema,
  publicKeySchema,
} from './identity.js';
import { mobilePhoneNumberSchema } from './phone.js';

// Synthetic numbers only.
const PHONE = '+963900412345';

describe('passwords', () => {
  it('need 10–128 characters and no composition', () => {
    expect(passwordSchema.safeParse('a'.repeat(9)).success).toBe(false);
    expect(passwordSchema.safeParse('correct horse').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('refuses common passwords whatever their case', () => {
    expect(isWeakPassword('Password123', PHONE)).toBe(true);
    expect(isWeakPassword('QWERTYUIOP', PHONE)).toBe(true);
    for (const password of commonPasswords) {
      expect(password.length, password).toBeGreaterThanOrEqual(10);
      expect(password, password).toBe(password.toLowerCase());
    }
  });

  it('refuses one repeated character and the phone’s last seven digits', () => {
    expect(isWeakPassword('zzzzzzzzzzzz', PHONE)).toBe(true);
    expect(isWeakPassword('clinic0412345!', PHONE)).toBe(true);
    expect(isWeakPassword('clinic412345!', PHONE)).toBe(false);
  });

  it('accepts a long uncommon password, and throws PASSWORD_TOO_WEAK otherwise', () => {
    expect(() => assertPasswordStrong('olive tree by the river', PHONE)).not.toThrow();
    try {
      assertPasswordStrong('1234567890', PHONE);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('PASSWORD_TOO_WEAK');
    }
  });
});

describe('PINs', () => {
  it('are six digits', () => {
    expect(pinSchema.safeParse('120593').success).toBe(true);
    expect(pinSchema.safeParse('12059').success).toBe(false);
    expect(pinSchema.safeParse('12a593').success).toBe(false);
    expect(pinSchema.safeParse('١٢٠٥٩٣').success).toBe(false);
  });

  it('refuse equal, ascending and descending digits', () => {
    for (const pin of ['000000', '777777', '123456', '345678', '987654', '654321']) {
      expect(isTrivialPin(pin), pin).toBe(true);
      expect(pinSchema.safeParse(pin).success, pin).toBe(false);
    }
    for (const pin of ['123457', '135790', '112233', '908172']) {
      expect(isTrivialPin(pin), pin).toBe(false);
    }
  });

  it('refuse the phone’s last six digits', () => {
    expect(isWeakPin('412345', PHONE)).toBe(true);
    expect(isWeakPin('904123', PHONE)).toBe(false);
    expect(isWeakPin('123456', PHONE)).toBe(true);
  });
});

describe('OTP codes', () => {
  it('are six Latin digits', () => {
    expect(otpCodeSchema.safeParse('004211').success).toBe(true);
    expect(otpCodeSchema.safeParse('4211').success).toBe(false);
  });
});

describe('mobile phones', () => {
  it('accept Syrian and Turkish mobiles in local forms and refuse landlines', () => {
    expect(mobilePhoneNumberSchema.parse('0900 412 345')).toBe(PHONE);
    expect(mobilePhoneNumberSchema.parse('0500 000 00 02')).toBe('+905000000002');
    expect(mobilePhoneNumberSchema.safeParse('021 2123456').success).toBe(false);
  });
});

describe('public keys', () => {
  it('are base64 of 32 bytes', () => {
    expect(publicKeySchema.safeParse(`${'A'.repeat(43)}=`).success).toBe(true);
    expect(publicKeySchema.safeParse('A'.repeat(44)).success).toBe(false);
  });
});

describe('offline window', () => {
  const confirmed = new Date('2026-10-01T08:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  const at = (days: number) => new Date(confirmed.getTime() + days * day);

  it('stays open for 7 days after the last confirmation', () => {
    expect(OFFLINE_WINDOW_DAYS).toBe(7);
    const open = offlineWindow({
      lastConfirmedAt: confirmed,
      deviceNow: at(6.9),
      highestSeenAt: at(6),
    });
    expect(open).toEqual({ open: true, closesAt: at(7), clockBehind: false });
    expect(
      offlineWindow({ lastConfirmedAt: confirmed, deviceNow: at(7), highestSeenAt: at(7) }).open,
    ).toBe(false);
  });

  it('is never extended by setting the clock back, and warns about it', () => {
    const rolledBack = offlineWindow({
      lastConfirmedAt: confirmed,
      deviceNow: at(1),
      highestSeenAt: at(8),
    });
    expect(rolledBack.open).toBe(false);
    expect(rolledBack.clockBehind).toBe(true);
  });
});
