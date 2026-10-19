import { z } from 'zod';
import { idleLockMinutesSchema, permissionKeySchema, roleSchema } from './access.js';
import { commonPasswords } from './common-passwords.js';
import { DomainError } from './errors.js';
import { mobilePhoneNumberSchema } from './phone.js';
import { practitionerSchema } from './practitioners.js';
import { tenantStatusSchema } from './tenancy.js';

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

// Routes of sign-in, devices and sessions (spec S02 "API and commands").

const instant = z.iso.datetime();

/**
 * A proof-of-work challenge (ADR 0016): find a `nonce` such that SHA-256 of
 * `<challenge>:<nonce>` (UTF-8) starts with `difficulty` zero bits. Each challenge is single use.
 */
export const proofOfWorkChallengeSchema = z
  .object({ challenge: z.string(), difficulty: z.int().min(0).max(32), expiresAt: instant })
  .meta({ id: 'ProofOfWorkChallenge' });

export type ProofOfWorkChallenge = z.infer<typeof proofOfWorkChallengeSchema>;

export const proofOfWorkSolutionSchema = z
  .object({ challenge: z.string().min(1).max(200), nonce: z.string().min(1).max(64) })
  .meta({ id: 'ProofOfWorkSolution' });

export type ProofOfWorkSolution = z.infer<typeof proofOfWorkSolutionSchema>;

/** Phone and password; on a device where the person is enrolled, with the device token. */
export const signInSchema = z
  .object({
    phone: mobilePhoneNumberSchema,
    // Any length: a wrong password is `INVALID_CREDENTIALS`, never a validation error.
    password: z.string().min(1).max(passwordPolicy.maxLength),
    proofOfWork: proofOfWorkSolutionSchema,
  })
  .meta({ id: 'SignIn' });

export type SignIn = z.infer<typeof signInSchema>;

export const signInResultSchema = z
  .discriminatedUnion('step', [
    z.object({ step: z.literal('otp'), challengeId: z.uuid() }),
    z.object({ step: z.literal('done'), ticket: z.string() }),
  ])
  .meta({ id: 'SignInResult' });

export type SignInResult = z.infer<typeof signInResultSchema>;

export const otpRequestSchema = z
  .object({
    phone: mobilePhoneNumberSchema,
    purpose: z.enum(['first_sign_in', 'password_reset']),
    proofOfWork: proofOfWorkSolutionSchema,
  })
  .meta({ id: 'OtpRequest' });

export type OtpRequest = z.infer<typeof otpRequestSchema>;

/** The answer to every OTP request, whether a code was sent or not (no account enumeration). */
export const otpChallengeSchema = z.object({ challengeId: z.uuid() }).meta({ id: 'OtpChallenge' });

export type OtpChallenge = z.infer<typeof otpChallengeSchema>;

export const otpVerifySchema = z
  .object({ challengeId: z.uuid(), code: otpCodeSchema })
  .meta({ id: 'OtpVerify' });

export type OtpVerify = z.infer<typeof otpVerifySchema>;

export const otpVerifiedSchema = z
  .object({
    ticket: z.string(),
    /** Set a password next (`POST /api/auth/password`): first sign-in or an authorized reset. */
    needsPassword: z.boolean(),
    /** The account has no name yet: ask for it with the password. */
    needsName: z.boolean(),
    /** The name an owner typed in an invitation, to prefill the name field. */
    suggestedName: z.string().nullable(),
  })
  .meta({ id: 'OtpVerified' });

export type OtpVerified = z.infer<typeof otpVerifiedSchema>;

/** What a sign-in ticket allows: setting a password, or acting as the signed-in account. */
export const ticketPurposeSchema = z.enum(['set_password', 'signed_in']);

export type TicketPurpose = z.infer<typeof ticketPurposeSchema>;

/** Sign-in tickets last 10 minutes and are used once (spec S02). */
export const ticketTtlSeconds = 600;

export const setPasswordSchema = z
  .object({ name: accountNameSchema.optional(), password: passwordSchema })
  .meta({ id: 'SetPassword' });

export type SetPassword = z.infer<typeof setPasswordSchema>;

export const signInTicketSchema = z.object({ ticket: z.string() }).meta({ id: 'SignInTicket' });

/** The clinics and branches where the account may register a computer (rule 27). */
export const registrationOptionsSchema = z
  .object({
    clinics: z.array(
      z.object({
        tenantId: z.uuid(),
        nameAr: z.string(),
        nameLatin: z.string().nullable(),
        status: tenantStatusSchema,
        roles: z.array(roleSchema),
        /** Empty while the tenant is onboarding without a branch: owners register without one. */
        branches: z.array(z.object({ id: z.uuid(), name: z.string() })),
      }),
    ),
  })
  .meta({ id: 'RegistrationOptions' });

export type RegistrationOptions = z.infer<typeof registrationOptionsSchema>;

/** A base64 Ed25519 signature (64 bytes). */
export const signatureSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{86}==$/)
  .meta({ id: 'Signature' });

const osSchema = z.string().trim().min(1).max(100);
const appVersionSchema = z.string().trim().min(1).max(50);

export const registerDeviceSchema = z
  .object({
    tenantId: z.uuid(),
    /** Null only for an owner while the tenant is onboarding without a branch (rule 28). */
    facilityId: z.uuid().nullable(),
    name: deviceNameSchema,
    publicKey: publicKeySchema,
    os: osSchema,
    appVersion: appVersionSchema,
    userPublicKey: publicKeySchema,
  })
  .refine((input) => input.publicKey !== input.userPublicKey, {
    message: 'The device and user keys must differ',
    path: ['userPublicKey'],
  })
  .meta({ id: 'RegisterDevice' });

export type RegisterDevice = z.infer<typeof registerDeviceSchema>;

export const deviceRegistrationSchema = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    facilityId: z.uuid().nullable(),
    name: z.string(),
    status: deviceStatusSchema,
  })
  .meta({ id: 'DeviceRegistration' });

export type DeviceRegistration = z.infer<typeof deviceRegistrationSchema>;

export const deviceEnrollmentSchema = z
  .object({
    id: z.uuid(),
    deviceId: z.uuid(),
    membershipId: z.uuid(),
    /** The offline window counts from here (rule 24). */
    lastConfirmedAt: instant,
  })
  .meta({ id: 'DeviceEnrollment' });

export type DeviceEnrollment = z.infer<typeof deviceEnrollmentSchema>;

/** A staff session: a 15-minute access token, and a refresh token for at most 12 hours. */
export const sessionTokensSchema = z
  .object({
    sessionId: z.uuid(),
    accessToken: z.string(),
    accessTokenExpiresAt: instant,
    refreshToken: z.string(),
    /** The session's absolute end. */
    expiresAt: instant,
  })
  .meta({ id: 'SessionTokens' });

export type SessionTokens = z.infer<typeof sessionTokensSchema>;

export const registeredDeviceSchema = z
  .object({
    device: deviceRegistrationSchema,
    enrollment: deviceEnrollmentSchema,
    session: sessionTokensSchema,
  })
  .meta({ id: 'RegisteredDevice' });

export type RegisteredDevice = z.infer<typeof registeredDeviceSchema>;

/**
 * Asks for a nonce to sign. The installation sends the tenant of its registration with the id:
 * the server reads the device under that tenant's isolation and trusts the pair only once the
 * device key's signature verifies.
 */
export const deviceTokenChallengeSchema = z
  .object({ tenantId: z.uuid(), deviceId: z.uuid() })
  .meta({ id: 'DeviceTokenChallenge' });

export type DeviceTokenChallenge = z.infer<typeof deviceTokenChallengeSchema>;

/** A server nonce: single use, valid 60 seconds. */
export const nonceSchema = z
  .object({ nonce: z.string(), expiresAt: instant })
  .meta({ id: 'Nonce' });

export type Nonce = z.infer<typeof nonceSchema>;

export const nonceTtlSeconds = 60;

export const deviceTokenRequestSchema = z
  .object({
    tenantId: z.uuid(),
    deviceId: z.uuid(),
    nonce: z.string().min(1).max(100),
    /** The device key's signature of `deviceTokenMessage(nonce, deviceId)`. */
    signature: signatureSchema,
    appVersion: appVersionSchema,
  })
  .meta({ id: 'DeviceTokenRequest' });

export type DeviceTokenRequest = z.infer<typeof deviceTokenRequestSchema>;

/** Device tokens last 5 minutes (spec S02). */
export const deviceTokenTtlSeconds = 300;

export const deviceTokenSchema = z
  .object({ deviceToken: z.string(), expiresAt: instant })
  .meta({ id: 'DeviceToken' });

export type DeviceToken = z.infer<typeof deviceTokenSchema>;

/** What a registered device shows on its lock screen. */
export const currentDeviceSchema = z
  .object({
    device: deviceRegistrationSchema,
    tenant: z.object({
      id: z.uuid(),
      nameAr: z.string(),
      nameLatin: z.string().nullable(),
      status: tenantStatusSchema,
      idleLockMinutes: idleLockMinutesSchema,
    }),
    facility: z.object({ id: z.uuid(), name: z.string() }).nullable(),
    members: z.array(
      z.object({
        enrollmentId: z.uuid(),
        membershipId: z.uuid(),
        name: z.string(),
        /** The account's phone now: the device signs in with it to re-enable a PIN (rule 22). */
        phone: z.string(),
        roles: z.array(roleSchema),
        lastConfirmedAt: instant,
      }),
    ),
  })
  .meta({ id: 'CurrentDevice' });

export type CurrentDevice = z.infer<typeof currentDeviceSchema>;

export const deviceWipedSchema = z
  .object({ wipedAt: instant.nullable() })
  .meta({ id: 'DeviceWiped' });

export const enrollSchema = z.object({ userPublicKey: publicKeySchema }).meta({ id: 'Enroll' });

export type Enroll = z.infer<typeof enrollSchema>;

export const enrolledSchema = z
  .object({ enrollment: deviceEnrollmentSchema, session: sessionTokensSchema })
  .meta({ id: 'Enrolled' });

export type Enrolled = z.infer<typeof enrolledSchema>;

export const openSessionSchema = z
  .object({
    enrollmentId: z.uuid(),
    nonce: z.string().min(1).max(100),
    /** The user key's signature of `staffSessionMessage(nonce, deviceId, enrollmentId)`. */
    signature: signatureSchema,
  })
  .meta({ id: 'OpenSession' });

export type OpenSession = z.infer<typeof openSessionSchema>;

export const refreshSessionSchema = z
  .object({ refreshToken: z.string().min(1).max(400) })
  .meta({ id: 'RefreshSession' });

export const endSessionSchema = z
  .object({ reason: z.enum(['signed_out', 'locked']) })
  .meta({ id: 'EndSession' });

export const sessionEndedSchema = z.object({ endedAt: instant }).meta({ id: 'SessionEnded' });

/** The signed-in member: their account, their place in the tenant, effective permissions. */
export const meSchema = z
  .object({
    account: z.object({ id: z.uuid(), phone: z.string(), nameAr: z.string().nullable() }),
    tenantId: z.uuid(),
    membershipId: z.uuid(),
    roles: z.array(roleSchema),
    /** Every branch, or `facilityIds`. */
    allFacilities: z.boolean(),
    facilityIds: z.array(z.uuid()),
    permissions: z.array(permissionKeySchema),
    deviceId: z.uuid(),
    facilityId: z.uuid().nullable(),
    /** The member's doctor profile, while they have the doctor role. */
    practitioner: practitionerSchema.nullable(),
  })
  .meta({ id: 'Me' });

export type Me = z.infer<typeof meSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(passwordPolicy.maxLength),
    newPassword: passwordSchema,
  })
  .meta({ id: 'ChangePassword' });

export type ChangePassword = z.infer<typeof changePasswordSchema>;

export const passwordChangedSchema = z
  .object({ passwordChangedAt: instant })
  .meta({ id: 'PasswordChanged' });

/** The API's public token keys (RFC 7517), for the sync service to check access tokens (S04). */
export const jwksSchema = z
  .object({
    keys: z.array(
      z.object({
        kty: z.literal('OKP'),
        crv: z.literal('Ed25519'),
        x: z.string(),
        kid: z.string(),
        alg: z.literal('EdDSA'),
        use: z.literal('sig'),
      }),
    ),
  })
  .meta({ id: 'Jwks' });

// Routes of device management (spec S02 rules 29 and 32).

/** A registered computer as the devices screen shows it, with its enrolled members. */
export const managedDeviceSchema = z
  .object({
    id: z.uuid(),
    facilityId: z.uuid().nullable(),
    name: z.string(),
    status: deviceStatusSchema,
    os: z.string(),
    appVersion: z.string(),
    lastSeenAt: instant,
    registeredAt: instant,
    revokedAt: instant.nullable(),
    wipedAt: instant.nullable(),
    updatedAt: instant,
    members: z.array(
      z.object({
        enrollmentId: z.uuid(),
        membershipId: z.uuid(),
        name: z.string(),
        roles: z.array(roleSchema),
        lastConfirmedAt: instant,
      }),
    ),
  })
  .meta({ id: 'ManagedDevice' });

export type ManagedDevice = z.infer<typeof managedDeviceSchema>;

export const managedDeviceListSchema = z
  .array(managedDeviceSchema)
  .meta({ id: 'ManagedDeviceList' });

export const listDevicesQuerySchema = z
  .object({ status: deviceStatusSchema.optional() })
  .meta({ id: 'ListDevicesQuery' });

export const renameDeviceSchema = z.object({ name: deviceNameSchema }).meta({ id: 'RenameDevice' });

/** Rule 29: a reason category and free text, kept in the audit entry. */
export const revokeDeviceSchema = z
  .object({ category: deviceRevokeCategorySchema, reason: z.string().trim().min(2).max(500) })
  .meta({ id: 'RevokeDevice' });

export type RevokeDevice = z.infer<typeof revokeDeviceSchema>;

export const revokedEnrollmentSchema = z
  .object({
    id: z.uuid(),
    deviceId: z.uuid(),
    membershipId: z.uuid(),
    revokedAt: instant,
    revokeReason: enrollmentRevokeReasonSchema,
  })
  .meta({ id: 'RevokedEnrollment' });

export type RevokedEnrollment = z.infer<typeof revokedEnrollmentSchema>;

// What the device and user keys sign: a domain tag, the nonce and the ids it binds, so a signature
// is never valid for another purpose, device or enrollment.

export function deviceTokenMessage(nonce: string, deviceId: string): string {
  return `vertex-shifa/device-token/v1\n${nonce}\n${deviceId}`;
}

export function staffSessionMessage(nonce: string, deviceId: string, enrollmentId: string): string {
  return `vertex-shifa/staff-session/v1\n${nonce}\n${deviceId}\n${enrollmentId}`;
}
