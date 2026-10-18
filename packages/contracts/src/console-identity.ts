import { z } from 'zod';
import { DomainError } from './errors.js';

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
] as const;

export type PlatformPermissionKey = (typeof platformPermissionKeys)[number];

/** Admins hold everything; support holds the tenant registry and account recovery. */
export const platformRolePermissions = {
  admin: platformPermissionKeys,
  support: [
    'tenants.read',
    'tenants.create',
    'tenants.change-status',
    'tenants.manage-directory',
    'accounts.recover',
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
