import { createHmac, randomBytes } from 'node:crypto';
import { totpPolicy } from '@vertex-shifa/contracts';
import { safeEqual } from '@vertex-shifa/crypto';

/**
 * Time-based one-time passwords for the console (RFC 6238 over RFC 4226 HOTP, HMAC-SHA-1, 6 digits,
 * 30-second steps, spec S02 rule 37), and the codes people type: setup and recovery codes.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 without padding, as authenticator apps read secrets. */
export function base32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let text = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      text += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) text += BASE32[(value << (5 - bits)) & 31];
  return text;
}

export function fromBase32(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new TOTP secret: 160 random bits (RFC 4226's recommended length), base32. */
export function newTotpSecret(): string {
  return base32(randomBytes(20));
}

/** The `otpauth://` URI authenticator apps scan from the QR code. */
export function totpUri(secret: string, label: string): string {
  const issuer = 'Vertex Shifa';
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(totpPolicy.digits),
    period: String(totpPolicy.stepSeconds),
  });
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?${query}`;
}

/** The time step of `now` (milliseconds since the epoch). */
export function totpStep(now: number): number {
  return Math.floor(now / 1000 / totpPolicy.stepSeconds);
}

/** The code of `step` for a base32 `secret` (RFC 4226 dynamic truncation). */
export function totpCode(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] as number) & 15;
  const number = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(number % 10 ** totpPolicy.digits).padStart(totpPolicy.digits, '0');
}

/**
 * The step `code` belongs to, within one step of `now`, and later than `lastStep` (a used step is
 * refused, rule 37); undefined when none matches. Every candidate is compared, in constant time.
 */
export function matchTotp(
  secret: string,
  code: string,
  now: number,
  lastStep: number | null,
): number | undefined {
  const current = totpStep(now);
  let matched: number | undefined;
  for (
    let step = current - totpPolicy.toleranceSteps;
    step <= current + totpPolicy.toleranceSteps;
    step += 1
  ) {
    if (safeEqual(totpCode(secret, step), code) && (lastStep === null || step > lastStep)) {
      matched ??= step;
    }
  }
  return matched;
}

/**
 * A code people type: `groups` groups of four base32 characters (`ABCD-EFGH-2345`), 20 random bits
 * each. Setup codes have three groups, recovery codes two (`setupCodeSchema`, `recoveryCodeSchema`).
 */
export function newTypedCode(groups: number): string {
  const text = base32(randomBytes(Math.ceil((groups * 20) / 8))).slice(0, groups * 4);
  return text.match(/.{4}/g)?.join('-') ?? text;
}
