import { z } from 'zod';
import { commonPasswords } from './common-passwords.js';
import { DomainError } from './errors.js';

/**
 * Staff identity (ADR 0005, ADR 0022, ADR 0024, spec S02): accounts, passwords, OTPs, PINs and the
 * offline window. One account per person, identified by a verified mobile number.
 */

/** The name a person gives at first sign-in, prefilled from the invitation. */
export const accountNameSchema = z.string().trim().min(2).max(100).meta({ id: 'AccountName' });

// Passwords (rule 11): long, no composition rules, not common, not the phone.

export const passwordPolicy = { minLength: 10, maxLength: 128, phoneDigits: 7 } as const;

export const passwordSchema = z
  .string()
  .min(passwordPolicy.minLength)
  .max(passwordPolicy.maxLength)
  .meta({ id: 'Password' });

function digitsOf(text: string): string {
  return text.replace(/\D/g, '');
}

/**
 * Whether `password` is refused as too weak for the account of `phone` (E.164): in the bundled
 * list of common passwords, one character repeated, or containing the phone's last 7 digits.
 */
export function isWeakPassword(password: string, phone: string): boolean {
  const lower = password.toLowerCase();
  if (commonPasswords.has(lower)) return true;
  if (new Set(lower).size === 1) return true;
  const phoneTail = digitsOf(phone).slice(-passwordPolicy.phoneDigits);
  return phoneTail.length === passwordPolicy.phoneDigits && password.includes(phoneTail);
}

export function assertPasswordStrong(password: string, phone: string): void {
  if (isWeakPassword(password, phone)) {
    throw new DomainError('PASSWORD_TOO_WEAK', 'The password is too weak');
  }
}

/** Password sign-in: five failures in a row lock it for 15 minutes (rule 12). */
export const signInPolicy = { maxFailures: 5, lockMinutes: 15 } as const;

// OTPs (rule 13, ADR 0022): six digits, 5 minutes, 5 attempts, 60 seconds between sends, 3 an hour
// per phone; only a keyed hash of the code is stored.

export const otpPolicy = {
  digits: 6,
  ttlSeconds: 300,
  maxAttempts: 5,
  resendCooldownSeconds: 60,
  maxPerHour: 3,
} as const;

export const otpCodeSchema = z
  .string()
  .regex(/^\d{6}$/)
  .meta({ id: 'OtpCode' });

export const otpPurposeSchema = z
  .enum(['device_sign_in', 'first_sign_in', 'password_reset'])
  .meta({ id: 'OtpPurpose' });

export type OtpPurpose = z.infer<typeof otpPurposeSchema>;

// PINs (rule 21): six digits, never trivial, never the phone's last six digits.

export const pinPolicy = { length: 6, maxFailures: 5 } as const;

/** All digits equal, or each one more (`123456`) or one less (`987654`) than the one before. */
export function isTrivialPin(pin: string): boolean {
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((digit, i) => digit - (digits[i] ?? 0)));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0] ?? NaN);
}

export const pinSchema = z
  .string()
  .regex(/^\d{6}$/)
  .refine((pin) => !isTrivialPin(pin), 'The PIN is too easy to guess');

/** Whether `pin` is refused for the account of `phone`: trivial, or the phone's last six digits. */
export function isWeakPin(pin: string, phone: string): boolean {
  return isTrivialPin(pin) || digitsOf(phone).endsWith(pin);
}

// The offline window (rule 24): the PIN works offline for 7 days after the server last confirmed
// the member's enrollment on the device. The device keeps the highest time it has seen, so setting
// the clock back never extends the window.

export const OFFLINE_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type OfflineWindow = {
  /** The PIN may unlock the member's key offline. */
  open: boolean;
  /** When the window closes. */
  closesAt: Date;
  /** The device clock is behind the highest time seen: show the clock warning. */
  clockBehind: boolean;
};

/**
 * The offline window of an enrollment, from the server's last confirmation, the device clock and
 * the highest time the device has seen. The window is measured from the later of the two times.
 */
export function offlineWindow(input: {
  lastConfirmedAt: Date;
  deviceNow: Date;
  highestSeenAt: Date;
}): OfflineWindow {
  const now = Math.max(input.deviceNow.getTime(), input.highestSeenAt.getTime());
  const closesAt = new Date(input.lastConfirmedAt.getTime() + OFFLINE_WINDOW_DAYS * DAY_MS);
  return {
    open: now < closesAt.getTime(),
    closesAt,
    clockBehind: input.deviceNow.getTime() < input.highestSeenAt.getTime(),
  };
}

/** Ed25519 public keys made on the device, base64 of the raw 32 bytes. */
export const publicKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}=$/)
  .meta({ id: 'PublicKey' });

/** A computer's name in the clinic ("Reception PC"). */
export const deviceNameSchema = z.string().trim().min(2).max(50).meta({ id: 'DeviceName' });

export const deviceStatusSchema = z.enum(['active', 'revoked']).meta({ id: 'DeviceStatus' });

export const deviceRevokeCategorySchema = z
  .enum(['lost_or_stolen', 'replaced', 'other'])
  .meta({ id: 'DeviceRevokeCategory' });

export const enrollmentRevokeReasonSchema = z
  .enum([
    'device_revoked',
    'member_deactivated',
    'removed_from_device',
    'pin_forgotten',
    'branch_left',
  ])
  .meta({ id: 'EnrollmentRevokeReason' });

export const sessionEndReasonSchema = z
  .enum([
    'signed_out',
    'locked',
    'expired',
    'member_deactivated',
    'device_revoked',
    'enrollment_revoked',
    'password_reset',
  ])
  .meta({ id: 'SessionEndReason' });

/** Staff sessions: 15-minute access tokens, refreshed for at most 12 hours (rule 23). */
export const staffSessionPolicy = { accessTokenMinutes: 15, maxHours: 12 } as const;
