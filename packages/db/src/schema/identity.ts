import { isNull, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { staffMemberships } from './access.js';
import {
  archivedAt,
  createdAt,
  id,
  idIsUuidV7,
  tenantId,
  timestamptz,
  updatedAt,
} from './columns.js';
import { facilities, tenants } from './tenancy.js';

// Secrets are stored as keyed hashes (HMAC-SHA-256 with `IDENTITY_HASH_KEY`) or, when they must be
// read back, encrypted (AES-256-GCM with `IDENTITY_ENCRYPTION_KEY`); never in clear (spec S02).

/**
 * One per person (ADR 0005): clinic staff now, patients from S19. Personal data, never medical;
 * logs carry the id only.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    /** E.164 mobile number; the person's identifier. */
    phone: text().notNull(),
    /** Set by the person at first sign-in, prefilled from the invitation. */
    nameAr: text(),
    /** Null until the person sets a password. */
    passwordHash: text(),
    passwordChangedAt: timestamptz(),
    /** Set by the first verified OTP. */
    phoneVerifiedAt: timestamptz(),
    /** Set by an owner or Vertex support: a new password may be set through an OTP until then. */
    passwordResetAuthorizedUntil: timestamptz(),
    failedSignIns: smallint().notNull().default(0),
    signInLockedUntil: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('accounts', t.id),
    unique('accounts_phone_unique').on(t.phone),
    check('accounts_phone', sql`${t.phone} ~ '^\\+[0-9]{8,15}$'`),
    check('accounts_name_ar', sql`char_length(${t.nameAr}) between 2 and 100`),
    check('accounts_failed_sign_ins', sql`${t.failedSignIns} >= 0`),
  ],
);

/**
 * One-time codes sent to a phone (ADR 0022): six digits, 5 minutes, 5 attempts. Only a keyed hash
 * of the code is stored. A work queue: attempts and consumption change the row. Kept until the
 * retention rules (Q2).
 */
export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    purpose: text().notNull(),
    codeHash: text().notNull(),
    expiresAt: timestamptz().notNull(),
    attempts: smallint().notNull().default(0),
    consumedAt: timestamptz(),
    deliveryStatus: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    idIsUuidV7('otp_challenges', t.id),
    check(
      'otp_challenges_purpose',
      sql`${t.purpose} in ('device_sign_in', 'first_sign_in', 'password_reset')`,
    ),
    check('otp_challenges_attempts', sql`${t.attempts} between 0 and 5`),
    check('otp_challenges_delivery_status', sql`${t.deliveryStatus} in ('sent', 'failed')`),
    // The hourly limit per phone and the resend cooldown.
    index('otp_challenges_account_created_idx').on(t.accountId, t.createdAt),
  ],
);

/**
 * A registration of one installation of the clinic app to one tenant and one branch (ADR 0024).
 * An installation registered to two clinics has two rows, in two tenants, with different keys; the
 * server never links them. Moving a computer to another branch is revoking and registering again.
 */
export const devices = pgTable(
  'devices',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    /** Null only while the tenant is onboarding with no branch; set by the wizard's first branch. */
    facilityId: uuid(),
    /** "Reception PC". */
    name: text().notNull(),
    /** Ed25519, base64 of the raw key; the private key never leaves the installation. */
    publicKey: text().notNull(),
    status: text().notNull().default('active'),
    os: text().notNull(),
    appVersion: text().notNull(),
    registeredByMembershipId: uuid().notNull(),
    lastSeenAt: timestamptz().notNull().defaultNow(),
    revokedAt: timestamptz(),
    revokedByMembershipId: uuid(),
    /** When the installation confirmed it deleted this registration's keys and data. */
    wipedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('devices', t.id),
    unique('devices_tenant_id_id_unique').on(t.tenantId, t.id),
    // A double submit of the same registration is refused here; keys are random per registration.
    unique('devices_tenant_public_key_unique').on(t.tenantId, t.publicKey),
    foreignKey({
      name: 'devices_facility_fk',
      columns: [t.tenantId, t.facilityId],
      foreignColumns: [facilities.tenantId, facilities.id],
    }),
    foreignKey({
      name: 'devices_registered_by_fk',
      columns: [t.tenantId, t.registeredByMembershipId],
      foreignColumns: [staffMemberships.tenantId, staffMemberships.id],
    }),
    foreignKey({
      name: 'devices_revoked_by_fk',
      columns: [t.tenantId, t.revokedByMembershipId],
      foreignColumns: [staffMemberships.tenantId, staffMemberships.id],
    }),
    check('devices_name', sql`char_length(${t.name}) between 2 and 50`),
    check('devices_public_key', sql`${t.publicKey} ~ '^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$'`),
    check('devices_status', sql`${t.status} in ('active', 'revoked')`),
    check('devices_revoked', sql`(${t.status} = 'revoked') = (${t.revokedAt} is not null)`),
    check('devices_wiped', sql`${t.wipedAt} is null or ${t.status} = 'revoked'`),
    check('devices_os', sql`char_length(${t.os}) between 1 and 100`),
    check('devices_app_version', sql`char_length(${t.appVersion}) between 1 and 50`),
    index('devices_tenant_facility_status_idx').on(t.tenantId, t.facilityId, t.status),
    index('devices_tenant_registered_by_idx').on(t.tenantId, t.registeredByMembershipId),
    index('devices_tenant_revoked_by_idx').on(t.tenantId, t.revokedByMembershipId),
  ],
);

/**
 * A member enrolled on a device (ADR 0021, ADR 0024): their per-user device key, whose private key
 * is wrapped by the PIN and `safeStorage` on the device. The offline window counts from
 * `last_confirmed_at`.
 */
export const deviceEnrollments = pgTable(
  'device_enrollments',
  {
    id: id(),
    tenantId: tenantId(),
    deviceId: uuid().notNull(),
    membershipId: uuid().notNull(),
    /** Ed25519, base64 of the raw key. */
    publicKey: text().notNull(),
    /** Each staff session opened online. */
    lastConfirmedAt: timestamptz().notNull().defaultNow(),
    revokedAt: timestamptz(),
    revokeReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('device_enrollments', t.id),
    unique('device_enrollments_tenant_id_id_unique').on(t.tenantId, t.id),
    foreignKey({
      name: 'device_enrollments_device_fk',
      columns: [t.tenantId, t.deviceId],
      foreignColumns: [devices.tenantId, devices.id],
    }),
    foreignKey({
      name: 'device_enrollments_membership_fk',
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [staffMemberships.tenantId, staffMemberships.id],
    }),
    check(
      'device_enrollments_public_key',
      sql`${t.publicKey} ~ '^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$'`,
    ),
    check(
      'device_enrollments_revoked',
      sql`(${t.revokedAt} is null) = (${t.revokeReason} is null)`,
    ),
    check(
      'device_enrollments_revoke_reason',
      sql`${t.revokeReason} in ('device_revoked', 'member_deactivated', 'removed_from_device', 'pin_forgotten', 'branch_left')`,
    ),
    uniqueIndex('device_enrollments_current_idx')
      .on(t.tenantId, t.deviceId, t.membershipId)
      .where(isNull(t.revokedAt)),
    index('device_enrollments_device_idx').on(t.tenantId, t.deviceId),
    index('device_enrollments_membership_idx').on(t.tenantId, t.membershipId),
  ],
);

/**
 * One per unlock of the clinic app by a member, online (spec S02 rule 23): refreshed for at most
 * 12 hours. The refresh token is opaque and stored as a keyed hash; it carries its tenant, signed
 * by the server, so the lookup runs under that tenant's RLS.
 */
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid().notNull(),
    deviceId: uuid().notNull(),
    enrollmentId: uuid().notNull(),
    refreshTokenHash: text().notNull(),
    /** 12 hours after creation, absolute. */
    expiresAt: timestamptz().notNull(),
    lastRefreshedAt: timestamptz().notNull().defaultNow(),
    endedAt: timestamptz(),
    endReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('staff_sessions', t.id),
    unique('staff_sessions_tenant_refresh_token_unique').on(t.tenantId, t.refreshTokenHash),
    foreignKey({
      name: 'staff_sessions_membership_fk',
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [staffMemberships.tenantId, staffMemberships.id],
    }),
    foreignKey({
      name: 'staff_sessions_device_fk',
      columns: [t.tenantId, t.deviceId],
      foreignColumns: [devices.tenantId, devices.id],
    }),
    foreignKey({
      name: 'staff_sessions_enrollment_fk',
      columns: [t.tenantId, t.enrollmentId],
      foreignColumns: [deviceEnrollments.tenantId, deviceEnrollments.id],
    }),
    check('staff_sessions_ended', sql`(${t.endedAt} is null) = (${t.endReason} is null)`),
    check(
      'staff_sessions_end_reason',
      sql`${t.endReason} in ('signed_out', 'locked', 'expired', 'member_deactivated', 'device_revoked', 'enrollment_revoked', 'password_reset')`,
    ),
    index('staff_sessions_tenant_membership_ended_idx').on(t.tenantId, t.membershipId, t.endedAt),
    index('staff_sessions_tenant_device_idx').on(t.tenantId, t.deviceId),
    index('staff_sessions_tenant_enrollment_idx').on(t.tenantId, t.enrollmentId),
  ],
);

/** Vertex staff in the console (F40), separate from `accounts` (ADR 0005). */
export const platformUsers = pgTable(
  'platform_users',
  {
    id: id(),
    /** E.164; the sign-in name. No OTP is sent to it. */
    phone: text().notNull(),
    name: text().notNull(),
    role: text().notNull(),
    status: text().notNull().default('pending_setup'),
    /** Null until setup. */
    passwordHash: text(),
    /** One-time setup code after creation or a reset, valid 24 hours. */
    setupCodeHash: text(),
    setupCodeExpiresAt: timestamptz(),
    /** Encrypted; set during setup and confirmed by a valid code. */
    totpSecret: text(),
    /** The last accepted TOTP step: a code of that step or earlier is refused. */
    totpLastStep: bigint({ mode: 'number' }),
    failedSignIns: smallint().notNull().default(0),
    signInLockedUntil: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('platform_users', t.id),
    unique('platform_users_phone_unique').on(t.phone),
    check('platform_users_phone', sql`${t.phone} ~ '^\\+[0-9]{8,15}$'`),
    check('platform_users_name', sql`char_length(${t.name}) between 2 and 100`),
    check('platform_users_role', sql`${t.role} in ('admin', 'support')`),
    check('platform_users_status', sql`${t.status} in ('pending_setup', 'active', 'disabled')`),
    check(
      'platform_users_active_is_set_up',
      sql`${t.status} <> 'active' or (${t.passwordHash} is not null and ${t.totpSecret} is not null)`,
    ),
    check(
      'platform_users_setup_code',
      sql`(${t.setupCodeHash} is null) = (${t.setupCodeExpiresAt} is null)`,
    ),
    check('platform_users_failed_sign_ins', sql`${t.failedSignIns} >= 0`),
  ],
);

/** Ten single-use codes per TOTP enrollment; a new enrollment archives the old set. */
export const platformUserRecoveryCodes = pgTable(
  'platform_user_recovery_codes',
  {
    id: id(),
    platformUserId: uuid()
      .notNull()
      .references(() => platformUsers.id),
    codeHash: text().notNull(),
    usedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('platform_user_recovery_codes', t.id),
    uniqueIndex('platform_user_recovery_codes_current_idx')
      .on(t.platformUserId, t.codeHash)
      .where(isNull(t.archivedAt)),
    index('platform_user_recovery_codes_user_idx').on(t.platformUserId),
  ],
);

/**
 * Console sessions (spec S02 rule 39): 12 hours at most, ended after 30 minutes without a request;
 * the token lives in an `HttpOnly` cookie and is stored as a keyed hash.
 */
export const platformSessions = pgTable(
  'platform_sessions',
  {
    id: id(),
    platformUserId: uuid()
      .notNull()
      .references(() => platformUsers.id),
    tokenHash: text().notNull(),
    /** 12 hours after creation, absolute. */
    expiresAt: timestamptz().notNull(),
    /** The idle limit counts from here. */
    lastSeenAt: timestamptz().notNull().defaultNow(),
    /** The last TOTP entered, for sensitive actions within 5 minutes. */
    reauthenticatedAt: timestamptz(),
    endedAt: timestamptz(),
    endReason: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('platform_sessions', t.id),
    unique('platform_sessions_token_hash_unique').on(t.tokenHash),
    check('platform_sessions_ended', sql`(${t.endedAt} is null) = (${t.endReason} is null)`),
    check(
      'platform_sessions_end_reason',
      sql`${t.endReason} in ('signed_out', 'expired', 'idle', 'user_disabled', 'user_reset', 'password_changed', 'reauth_failed')`,
    ),
    index('platform_sessions_user_ended_idx').on(t.platformUserId, t.endedAt),
  ],
);

/**
 * Single-use tokens that were used (spec S02): sign-in tickets (`ticket`), console sign-in step
 * tickets (`console_step`) and proof-of-work challenges (`proof_of_work`). A token is used by
 * inserting its id, in the transaction of the step it authorizes, so the use survives a restart,
 * commits or rolls back with that step, and wins once under concurrent requests (the unique key).
 * Random ids and an expiry only, nothing personal. Kept, not purged: a few rows per sign-in, and
 * retention waits for Q2 (`docs/architecture.md`).
 */
export const usedTokens = pgTable(
  'used_tokens',
  {
    id: id(),
    kind: text().notNull(),
    /** The ticket's `jti` or the challenge's id. */
    tokenId: text().notNull(),
    /** When the token expires; past it the row only records a use. */
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    idIsUuidV7('used_tokens', t.id),
    check('used_tokens_kind', sql`${t.kind} in ('ticket', 'console_step', 'proof_of_work')`),
    unique('used_tokens_kind_token_id_unique').on(t.kind, t.tokenId),
  ],
);
