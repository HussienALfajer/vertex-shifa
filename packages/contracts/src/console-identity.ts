import { z } from 'zod';
import { roleSchema } from './access.js';
import { DomainError } from './errors.js';
import { passwordPolicy, passwordSchema, proofOfWorkSolutionSchema } from './identity.js';
import { mobilePhoneNumberSchema } from './phone.js';
import { membershipStatusSchema } from './staff.js';
import { tenantStatusSchema } from './tenancy.js';

/**
 * Vertex staff in the console (F40, ADR 0005, spec S02): platform users with roles `admin` and
 * `support`, phone and password plus a mandatory TOTP, single-use recovery codes and
 * re-authentication for sensitive actions.
 */

export const platformRoleSchema = z.enum(['admin', 'support']).meta({ id: 'PlatformRole' });

export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const platformUserStatusSchema = z
  .enum(['pending_setup', 'active', 'disabled'])
  .meta({ id: 'PlatformUserStatus' });

export type PlatformUserStatus = z.infer<typeof platformUserStatusSchema>;

/** Console permissions; `ConsoleRoute` names one of them. */
export const platformPermissionKeys = [
  'tenants.read',
  'tenants.create',
  'tenants.change-status',
  'tenants.manage-directory',
  'accounts.recover',
  'platform-users.manage',
  'whatsapp-sessions.read',
  'whatsapp-sessions.manage',
] as const;

export type PlatformPermissionKey = (typeof platformPermissionKeys)[number];

/**
 * Admins hold everything; support holds the tenant registry, account recovery and reading the
 * WhatsApp numbers (S03).
 */
export const platformRolePermissions = {
  admin: platformPermissionKeys,
  support: [
    'tenants.read',
    'tenants.create',
    'tenants.change-status',
    'tenants.manage-directory',
    'accounts.recover',
    'whatsapp-sessions.read',
  ],
} as const satisfies Record<PlatformRole, readonly PlatformPermissionKey[]>;

export function platformRoleHolds(role: PlatformRole, permission: PlatformPermissionKey): boolean {
  return (platformRolePermissions[role] as readonly PlatformPermissionKey[]).includes(permission);
}

export const platformUserNameSchema = z.string().trim().min(2).max(100);

/** Codes typed by people: upper case base32 without padding, in groups. */
const typedCode = (groups: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.string().regex(new RegExp(`^[A-Z2-7]{4}(-[A-Z2-7]{4}){${groups - 1}}$`)),
  );

/** The one-time setup code an admin hands over in person (rule 36). */
export const setupCodeSchema = typedCode(3).meta({ id: 'SetupCode' });

/** One of the ten single-use recovery codes (rule 37). */
export const recoveryCodeSchema = typedCode(2).meta({ id: 'RecoveryCode' });

export const totpCodeSchema = z
  .string()
  .regex(/^\d{6}$/)
  .meta({ id: 'TotpCode' });

/** RFC 6238 with 30-second steps and one step of tolerance; a used step is refused (rule 37). */
export const totpPolicy = { stepSeconds: 30, digits: 6, toleranceSteps: 1 } as const;

export const consolePolicy = {
  setupCodeHours: 24,
  recoveryCodes: 10,
  sessionMaxHours: 12,
  sessionIdleMinutes: 30,
  reauthMinutes: 5,
} as const;

/**
 * Refuses a change that would leave no active admin (rule 40): `activeAdmins` is the number of
 * active admins after the change.
 */
export function assertAdminRemains(activeAdmins: number): void {
  if (activeAdmins < 1) throw new DomainError('LAST_ADMIN', 'The console needs an active admin');
}

// Routes of the console identity (spec S02 "API and commands", rules 36–41).

const instant = z.iso.datetime();

/** A step of signing in to the console: the signed, single-use ticket of the next step. */
const stepTicketSchema = z.string().min(1).max(2000);

/**
 * Phone and either the password or, for a new or reset user, the one-time setup code; with a
 * proof of work as the clinic sign-in (ADR 0016).
 */
export const consoleSignInSchema = z
  .object({
    phone: mobilePhoneNumberSchema,
    // Any length: a wrong password is `INVALID_CREDENTIALS`, never a validation error.
    password: z.string().min(1).max(passwordPolicy.maxLength).optional(),
    setupCode: setupCodeSchema.optional(),
    proofOfWork: proofOfWorkSolutionSchema,
  })
  .refine((input) => (input.password === undefined) !== (input.setupCode === undefined), {
    message: 'Give the password or the setup code',
    path: ['password'],
  })
  .meta({ id: 'ConsoleSignIn' });

export type ConsoleSignIn = z.infer<typeof consoleSignInSchema>;

/**
 * The next step: a TOTP code (or a recovery code), or, after a setup code, the setup with the new
 * TOTP secret to scan (base32, and as an `otpauth://` URI for the QR code).
 */
export const consoleSignInResultSchema = z
  .discriminatedUnion('step', [
    z.object({ step: z.literal('totp'), ticket: z.string() }),
    z.object({
      step: z.literal('setup'),
      ticket: z.string(),
      totpSecret: z.string(),
      totpUri: z.string(),
    }),
  ])
  .meta({ id: 'ConsoleSignInResult' });

export type ConsoleSignInResult = z.infer<typeof consoleSignInResultSchema>;

/** Rule 36: the first password, and a code of the new TOTP secret to confirm it. */
export const consoleSetupSchema = z
  .object({ ticket: stepTicketSchema, password: passwordSchema, code: totpCodeSchema })
  .meta({ id: 'ConsoleSetup' });

export type ConsoleSetup = z.infer<typeof consoleSetupSchema>;

/** Rule 37: a TOTP code or one of the recovery codes. */
export const consoleTotpSchema = z
  .object({ ticket: stepTicketSchema, code: z.union([totpCodeSchema, recoveryCodeSchema]) })
  .meta({ id: 'ConsoleTotp' });

export type ConsoleTotp = z.infer<typeof consoleTotpSchema>;

/** Rule 38: a TOTP code before a sensitive action. */
export const consoleReauthSchema = z.object({ code: totpCodeSchema }).meta({ id: 'ConsoleReauth' });

export type ConsoleReauth = z.infer<typeof consoleReauthSchema>;

export const consoleReauthenticatedSchema = z
  .object({ reauthenticatedUntil: instant })
  .meta({ id: 'ConsoleReauthenticated' });

/** The signed-in platform user and their session; the session token itself is in the cookie. */
export const consoleMeSchema = z
  .object({
    id: z.uuid(),
    phone: z.string(),
    name: z.string(),
    role: platformRoleSchema,
    permissions: z.array(z.enum(platformPermissionKeys)),
    recoveryCodesRemaining: z.int().min(0),
    session: z.object({
      expiresAt: instant,
      /** Sensitive actions need no new TOTP until then (rule 38); null when one is needed. */
      reauthenticatedUntil: instant.nullable(),
    }),
  })
  .meta({ id: 'ConsoleMe' });

export type ConsoleMe = z.infer<typeof consoleMeSchema>;

/** The end of setup: the session, and the recovery codes, shown this once (rule 37). */
export const consoleSetUpSchema = consoleMeSchema
  .extend({ recoveryCodes: z.array(z.string()) })
  .meta({ id: 'ConsoleSetUp' });

export type ConsoleSetUp = z.infer<typeof consoleSetUpSchema>;

// Platform users (rules 36 and 40).

export const platformUserSchema = z
  .object({
    id: z.uuid(),
    phone: z.string(),
    name: z.string(),
    role: platformRoleSchema,
    status: platformUserStatusSchema,
    /** When the pending setup code expires; null once set up. */
    setupCodeExpiresAt: instant.nullable(),
    createdAt: instant,
    updatedAt: instant,
  })
  .meta({ id: 'PlatformUser' });

export type PlatformUser = z.infer<typeof platformUserSchema>;

export const platformUserListSchema = z.array(platformUserSchema).meta({ id: 'PlatformUserList' });

export const createPlatformUserSchema = z
  .object({
    phone: mobilePhoneNumberSchema,
    name: platformUserNameSchema,
    role: platformRoleSchema,
  })
  .meta({ id: 'CreatePlatformUser' });

export type CreatePlatformUser = z.infer<typeof createPlatformUserSchema>;

/** A role change, or disabling (`true`) or enabling (`false`) the user. */
export const updatePlatformUserSchema = z
  .object({ role: platformRoleSchema.optional(), disabled: z.boolean().optional() })
  .refine((input) => input.role !== undefined || input.disabled !== undefined, {
    message: 'Nothing to change',
    path: ['role'],
  })
  .meta({ id: 'UpdatePlatformUser' });

export type UpdatePlatformUser = z.infer<typeof updatePlatformUserSchema>;

/** A created or reset user with their one-time setup code, shown to the admin this once. */
export const platformUserSetupSchema = z
  .object({ user: platformUserSchema, setupCode: z.string(), setupCodeExpiresAt: instant })
  .meta({ id: 'PlatformUserSetup' });

export type PlatformUserSetup = z.infer<typeof platformUserSetupSchema>;

// Owner recovery by Vertex support (rule 17).

const recoveryReasonSchema = z.string().trim().min(2).max(500);

/** The phone travels in the body, never in the URL (spec S02 "Clinical data and privacy"). */
export const consoleAccountLookupSchema = z
  .object({ phone: mobilePhoneNumberSchema })
  .meta({ id: 'ConsoleAccountLookup' });

/** An account as support sees it: no password, no clinical data; its clinics and roles. */
export const consoleAccountSchema = z
  .object({
    id: z.uuid(),
    phone: z.string(),
    nameAr: z.string().nullable(),
    hasPassword: z.boolean(),
    passwordResetAuthorizedUntil: instant.nullable(),
    signInLockedUntil: instant.nullable(),
    memberships: z.array(
      z.object({
        tenantId: z.uuid(),
        tenantNameAr: z.string(),
        tenantStatus: tenantStatusSchema,
        membershipId: z.uuid(),
        status: membershipStatusSchema,
        roles: z.array(roleSchema),
      }),
    ),
  })
  .meta({ id: 'ConsoleAccount' });

export type ConsoleAccount = z.infer<typeof consoleAccountSchema>;

export const authorizeAccountPasswordResetSchema = z
  .object({ reason: recoveryReasonSchema })
  .meta({ id: 'AuthorizeAccountPasswordReset' });

export const accountPasswordResetAuthorizedSchema = z
  .object({ accountId: z.uuid(), passwordResetAuthorizedUntil: instant })
  .meta({ id: 'AccountPasswordResetAuthorized' });

export const changeAccountPhoneSchema = z
  .object({ phone: mobilePhoneNumberSchema, reason: recoveryReasonSchema })
  .meta({ id: 'ChangeAccountPhone' });
