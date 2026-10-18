import { recoveryCodeSchema, setupCodeSchema } from '@vertex-shifa/contracts';
import { describe, expect, it } from 'vitest';
import {
  base32,
  fromBase32,
  matchTotp,
  newTotpSecret,
  newTypedCode,
  totpCode,
  totpStep,
  totpUri,
} from './totp.js';

// RFC 6238 appendix B, SHA-1: the seed "12345678901234567890", codes cut to six digits.
const SECRET = base32(Buffer.from('12345678901234567890'));

describe('TOTP (RFC 6238)', () => {
  it('encodes base32 as RFC 4648 without padding, and back', () => {
    expect(SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32(Buffer.from('f'))).toBe('MY');
    expect(fromBase32('MY').toString()).toBe('f');
    expect(fromBase32(SECRET).toString()).toBe('12345678901234567890');
  });

  it('gives the test vectors of the RFC', () => {
    for (const [seconds, code] of [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ] as const) {
      expect(totpCode(SECRET, totpStep(seconds * 1000)), String(seconds)).toBe(code);
    }
  });

  it('accepts one step either side, and refuses a used step or an earlier one', () => {
    const now = 1234567890 * 1000;
    const step = totpStep(now);
    expect(matchTotp(SECRET, totpCode(SECRET, step), now, null)).toBe(step);
    expect(matchTotp(SECRET, totpCode(SECRET, step - 1), now, null)).toBe(step - 1);
    expect(matchTotp(SECRET, totpCode(SECRET, step + 1), now, null)).toBe(step + 1);
    expect(matchTotp(SECRET, totpCode(SECRET, step + 2), now, null)).toBeUndefined();
    expect(matchTotp(SECRET, totpCode(SECRET, step), now, step)).toBeUndefined();
    expect(matchTotp(SECRET, totpCode(SECRET, step - 1), now, step - 1)).toBeUndefined();
    expect(matchTotp(SECRET, totpCode(SECRET, step + 1), now, step)).toBe(step + 1);
    expect(matchTotp(SECRET, '000000', now, null)).toBeUndefined();
  });

  it('makes 160-bit secrets and an otpauth URI for the QR code', () => {
    const secret = newTotpSecret();
    expect(fromBase32(secret)).toHaveLength(20);
    expect(newTotpSecret()).not.toBe(secret);
    const uri = new URL(totpUri(secret, '+963900000000'));
    expect(uri.protocol).toBe('otpauth:');
    expect(uri.host).toBe('totp');
    expect(decodeURIComponent(uri.pathname)).toBe('/Vertex Shifa:+963900000000');
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret,
      issuer: 'Vertex Shifa',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
  });
});

describe('typed codes', () => {
  it('match the setup and recovery code formats', () => {
    for (let i = 0; i < 50; i += 1) {
      const setup = newTypedCode(3);
      expect(setupCodeSchema.parse(setup)).toBe(setup);
      const recovery = newTypedCode(2);
      expect(recoveryCodeSchema.parse(recovery)).toBe(recovery);
    }
  });
});
