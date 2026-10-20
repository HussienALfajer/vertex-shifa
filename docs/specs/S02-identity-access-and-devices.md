# S02 — Identity, access and devices

Status: Approved · Date: 2026-10-18 · Features: `docs/product/v1-scope.md` F02, F03, F40 · ADRs: 0004, 0005, 0008, 0012, 0013, 0016, 0020, 0021, 0022, 0024

## Summary
Every person has one account, identified by a verified Syrian or Turkish phone number, that can hold staff roles in several clinics (ADR 0005). V1 lets a clinic owner invite staff by phone with preset roles, branch scope and per-person permission adjustments within fixed limits; lets a clinic computer be registered to one or more clinics, each with its own branch, keys and (from S04) encrypted database; lets staff unlock the clinic app with a six-digit PIN offline for up to 7 days; lets the owner list and revoke devices; records each doctor's profile (professional name, gender, specialties, photo); and gives Vertex staff console accounts with mandatory TOTP and an audit of every console action.

## In scope / out of scope
- In:
  - Accounts (phone, name, password), staff memberships (roles, branch scope, permission adjustments, states), invitations by phone with a WhatsApp invitation message (sent by S03; S02 publishes the event), the permission catalog and role presets in `packages/contracts`, the session guard that replaces the fail-closed `UNAUTHENTICATED` of S01.
  - OTP challenges: generation, keyed hash, expiry, attempts, cooldown and hourly limits (ADR 0022), behind an `OtpSender` port with a fake implementation until S03. The proof-of-work challenge on sign-in and OTP requests (ADR 0016).
  - Device registration (one installation, one or more clinics, ADR 0024), device keys and device tokens, per-user enrollment with a per-user device key unlocked by the PIN (ADR 0021), staff sessions per device, the offline window, PIN lockout, idle lock, user and clinic switching, revocation and the local wipe of what S02 stores on the device.
  - Owner-authorized staff password reset; owner recovery and phone change by Vertex support.
  - Practitioner profiles for members with the doctor role: professional name, gender (for the F25 filter), specialties from a seeded list, syndicate number, photo.
  - Clinic security settings: idle-lock minutes and the clinical read scope.
  - Console: platform users with roles `admin` and `support`, phone + password + mandatory TOTP with recovery codes, re-authentication for sensitive actions, the platform audit log of every console request, platform user management screens; console routes and CLI for owner recovery (screens in S22).
  - The HTTP access tests of every S01 route (success, 401, 403, another tenant, console routes refused for staff sessions).
  - The S01 rule 7 check: a branch with active devices cannot be archived.
- Out (later or never):
  - The local SQLite database, its key slots per user, PowerSync tokens and stream filters, the command endpoint, the per-command user proof check, the quarantine of a revoked device's commands and its review screen, the conditional acceptance of a deactivated member's commands, the replication scope built from memberships: S04 (S02 fixes the rules, the keys and the data they use).
  - Sending the invitation message and OTPs over WhatsApp: S03. Until then the fake sender is used in development and tests, and production refuses to start with it.
  - Staff-user and doctor limits per contract: S05 (S02 marks where they are checked).
  - Every clinical, scheduling, patient, billing, report, messaging and export permission is enforced by the spec that builds its feature; S02 fixes their preset defaults and limits (Access).
  - `practitioner_roles` (a practitioner at a branch with a schedule): S07.
  - Console screens for tenants, accounts and owner recovery: S22. Support access to a clinic's data (F39): S22.
  - Break-glass reads and the "own patients" relationship: defined here as a setting and a permission, applied by S11.
  - Patient accounts and patient sign-in by OTP only: S19 (same `accounts` table).
  - A web version of the clinic system: not in V1 (owner, 2026-10-18); the clinic system is the desktop app only.
  - Self-service phone number change by staff, biometrics on clinic PCs, SSO: not in V1.

## Access and entitlements
All identity, access, device and practitioner routes declare `@NoFeature()`: they belong to every package. Staff-user and doctor limits (S05) are checked when an invitation is created and when a member is reactivated or given the doctor role (an S05 acceptance item).

### Routes of S02
| Action | Surface | Who (permission) | Feature key |
|---|---|---|---|
| Request a proof-of-work challenge, sign in, request and verify an OTP, set a password with a ticket | Clinic app | Public, with proof of work and rate limits | none |
| Register a computer to a clinic | Clinic app | Staff with `devices.manage` for the chosen branch, by ticket | none |
| Enroll a user on a registered device, open a staff session with the PIN | Clinic app | The device (device token) and the member (ticket or user-key proof) | none |
| Read own account, membership, effective permissions; change own password | Clinic app | Any signed-in staff member | none |
| List staff, read a member | Clinic app | `staff.read` | none |
| Invite, resend or cancel an invitation, change roles, branches and adjustments, deactivate, reactivate, authorize a password reset | Clinic app | Owner only (`staff.manage`, not grantable) | none (S05: staff and doctor limits) |
| Grant or remove the owner role | Clinic app | Owner only (`staff.manage`) | none |
| List practitioners and specialties | Clinic app | Every staff role (`practitioners.read`) | none |
| Edit a practitioner profile and photo | Clinic app | The doctor for their own profile (`practitioner.edit_own`), or the owner (`staff.manage`) | none |
| List, rename and revoke devices; remove a user from a device | Clinic app | `devices.manage`, for devices of branches in the member's scope | none |
| Change idle-lock minutes and the clinical read scope | Clinic app | Owner only (`tenant.manage`) | none |
| Sign in to the console, enroll and use TOTP, change own password | Console | Platform user | none |
| List, create, disable, change the role of, reset a platform user | Console | `admin` (`platform-users.manage`) | none |
| Look up an account by phone; authorize an owner's password reset; change an account's phone | Console API, CLI | `admin` or `support` (`accounts.recover`), with re-authentication | none |

### Permission catalog and role presets
The catalog lives in `packages/contracts/src/access.ts`: each permission has a key, a group, whether it is branch-scoped, and its limit (who may hold it). Role presets are code, not rows: a member's effective permissions are the union of their roles' presets, plus their grants, minus their revocations, then filtered by the limits. A preset change in a later release reaches every member; their adjustments stay.

Permissions enforced in S02 (and S01):

| Permission | Branch-scoped | Owner | Doctor | Reception | Nurse | Accountant | Limit |
|---|---|---|---|---|---|---|---|
| `tenant.read` | no | ✓ | ✓ | ✓ | ✓ | ✓ | any role |
| `tenant.manage` | no | ✓ | | | | | owner only |
| `facility.manage` | yes | ✓ (all branches) | | | | | any role |
| `staff.read` | no | ✓ | | | | | any role |
| `staff.manage` | no | ✓ | | | | | owner only |
| `devices.manage` | yes | ✓ (all branches) | | | | | any role |
| `practitioners.read` | no | ✓ | ✓ | ✓ | ✓ | ✓ | any role |
| `practitioner.edit_own` | no | | ✓ | | | | doctor role |

Defaults and limits that later specs apply when they add their permission keys to the catalog (owner, 2026-10-18):

| Group (spec) | Owner | Doctor | Reception | Nurse | Accountant | Limit |
|---|---|---|---|---|---|---|
| Clinical full read (S11–S14) | read only, all branches | ✓, per the clinical read scope | never | grantable | never | doctor, nurse, owner only |
| Clinical summary read: allergies, diagnoses, current medications (S11, S12) | ✓ | ✓ | never | ✓ | never | doctor, nurse, owner only |
| Vitals write (S11) | | ✓ | never | ✓ | never | doctor, nurse only |
| Clinical write: visit notes, diagnoses, prescriptions, medical documents, requests (S11–S14) | never | ✓ | never | never | never | doctor role only |
| Break-glass read (S11) | | ✓ | never | | never | doctor role only |
| Scheduling: bookings, check-in, queue (S07, S09, S10) | ✓ | own schedule and queue | ✓ | check-in and queue | | any role |
| Patients: register and edit demographics (S08) | ✓ | ✓ | ✓ | ✓ | | any role |
| Billing: invoices, payments, cash session, expenses (S16) | ✓ | | invoices, payments, own cash session | | ✓ | any role |
| Reports (S17) | ✓ | own activity | | | financial | any role |
| Clinic WhatsApp link (S18), audit and export (S06), quarantine review (S04) | ✓ | | | | | owner only |

Limits are enforced on every write of roles and adjustments (`PERMISSION_NOT_GRANTABLE`) and again when effective permissions are computed, so a member who loses the doctor role loses doctor-only grants at once.

## Data
All tables follow `packages/db/CLAUDE.md`: UUIDv7 `id`, `created_at`, a `tableRegistry` entry. Business tables also have `updated_at` and `archived_at` and are never deleted. Module names follow `docs/architecture.md`: `identity`, `access` (platform layer), `practitioners` (health layer). Secrets and tokens are stored as keyed hashes (HMAC-SHA-256 with `IDENTITY_HASH_KEY`) or, where they must be read back, encrypted (AES-256-GCM with `IDENTITY_ENCRYPTION_KEY`); both keys come from the environment and `.env.example` holds fake values.

### `accounts` (scope `platform`, kind `business`, module `identity`)
One per person (ADR 0005). Personal data, never medical; never logged (ids only).

| Field | Type | Required | Constraints |
|---|---|---|---|
| `phone` | text | yes | E.164 from `phoneNumberSchema` (S01), mobile only; unique |
| `name_ar` | text | no | trimmed, 2–100 characters; set by the person at first sign-in (prefilled from the invitation) |
| `password_hash` | text | no | Argon2id from `node:crypto` (ADR 0025); null until the person sets a password |
| `password_changed_at` | timestamptz | no | |
| `phone_verified_at` | timestamptz | no | set by the first verified OTP |
| `password_reset_authorized_until` | timestamptz | no | set by an owner or Vertex support; 72 hours |
| `failed_sign_ins` | smallint | yes | default 0; reset on success |
| `sign_in_locked_until` | timestamptz | no | 15 minutes after 5 failures in a row |

App role: `SELECT, INSERT, UPDATE`.

### `account_tenant_links` (scope `platform`, kind `business`, module `access`)
Which clinics an account belongs to, so sign-in can offer them before any tenant context exists. Holds no roles; every decision reads `staff_memberships` under the tenant's RLS. Written in the same transaction as the membership it mirrors.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `account_id` | uuid | yes | references `accounts(id)` |
| `linked_tenant_id` | uuid | yes | references `tenants(id)` |

Unique `(account_id, linked_tenant_id)`; index `(linked_tenant_id)`. App role: `SELECT, INSERT, UPDATE` (archived when the membership is archived).

### `staff_memberships` (scope `tenant`, kind `business`, module `access`)
A person's place in a tenant ("staff member" in the glossary).

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id` | uuid | yes | RLS; `unique (tenant_id, id)` |
| `account_id` | uuid | yes | the account (platform table; plain reference, indexed) |
| `status` | text | yes | `invited`, `active`, `deactivated` |
| `roles` | text[] | yes | 1–5 distinct of `owner`, `doctor`, `reception`, `nurse`, `accountant` |
| `all_facilities` | boolean | yes | true for owners (check) |
| `granted_permissions` | text[] | yes | default `{}`; catalog keys |
| `revoked_permissions` | text[] | yes | default `{}`; catalog keys; disjoint from grants |
| `invited_name` | text | yes | the name the owner typed, 2–100 characters; the list shows `accounts.name_ar` once set |
| `invited_by_membership_id` | uuid | no | null for the owner created by Vertex |
| `invitation_expires_at` | timestamptz | while `invited` | 7 days after creation or the last resend |
| `invitation_message_status` | text | while `invited` | `pending`, `sent`, `failed`; updated by S03 |
| `accepted_at`, `deactivated_at` | timestamptz | no | |

Unique `(tenant_id, account_id)`. Index `(tenant_id, status)`. App role: `SELECT, INSERT, UPDATE`.

### `staff_membership_facilities` (scope `tenant`, kind `business`, module `access`)
The branches of a member whose `all_facilities` is false (at least one, checked by the service).

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id`, `membership_id`, `facility_id` | uuid | yes | composite foreign keys to `staff_memberships` and `facilities` |

Unique partial `(tenant_id, membership_id, facility_id) where archived_at is null`. App role: `SELECT, INSERT, UPDATE`.

### `devices` (scope `tenant`, kind `business`, module `identity`)
A registration of one installation of the clinic app to one tenant and one branch (ADR 0024). An installation registered to two clinics has two rows, in two tenants, with different keys; the server never links them.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id` | uuid | yes | RLS; `unique (tenant_id, id)` |
| `facility_id` | uuid | no | composite foreign key; null only while the tenant is `onboarding` and has no branch; set to the first branch when the wizard creates it |
| `name` | text | yes | 2–50 characters ("Reception PC") |
| `public_key` | text | yes | Ed25519, base64; unique |
| `status` | text | yes | `active`, `revoked` |
| `os`, `app_version` | text | yes | reported at registration and on each token |
| `registered_by_membership_id` | uuid | yes | composite foreign key |
| `last_seen_at` | timestamptz | yes | each device token |
| `revoked_at`, `revoked_by_membership_id` | | no | |
| `wiped_at` | timestamptz | no | when the device confirmed its wipe |

Index `(tenant_id, facility_id, status)`. App role: `SELECT, INSERT, UPDATE`.

### `device_enrollments` (scope `tenant`, kind `business`, module `identity`)
A member enrolled on a device: their per-user device key (ADR 0021).

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id`, `device_id`, `membership_id` | uuid | yes | composite foreign keys |
| `public_key` | text | yes | Ed25519, base64; the private key is wrapped by the PIN and `safeStorage` on the device |
| `last_confirmed_at` | timestamptz | yes | each staff session opened online; the offline window counts from it |
| `revoked_at` | timestamptz | no | |
| `revoke_reason` | text | no | `device_revoked`, `member_deactivated`, `removed_from_device`, `pin_forgotten`, `branch_left` |

Unique partial `(tenant_id, device_id, membership_id) where revoked_at is null`. App role: `SELECT, INSERT, UPDATE`.

### `staff_sessions` (scope `tenant`, kind `business`, module `identity`)
One per unlock of the clinic app by a member, online.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id`, `membership_id`, `device_id`, `enrollment_id` | uuid | yes | composite foreign keys |
| `refresh_token_hash` | text | yes | keyed hash; unique |
| `expires_at` | timestamptz | yes | 12 hours after creation (absolute) |
| `last_refreshed_at` | timestamptz | yes | |
| `ended_at` | timestamptz | no | |
| `end_reason` | text | no | `signed_out`, `locked`, `expired`, `member_deactivated`, `device_revoked`, `enrollment_revoked`, `password_reset` |

Index `(tenant_id, membership_id, ended_at)`. App role: `SELECT, INSERT, UPDATE`.

### `otp_challenges` (scope `platform`, kind `queue`, module `identity`)
| Field | Type | Required | Constraints |
|---|---|---|---|
| `account_id` | uuid | yes | references `accounts(id)` |
| `purpose` | text | yes | `device_sign_in`, `first_sign_in`, `password_reset` |
| `code_hash` | text | yes | keyed hash of the six-digit code; the code itself is never stored |
| `expires_at` | timestamptz | yes | 5 minutes |
| `attempts` | smallint | yes | at most 5 |
| `consumed_at` | timestamptz | no | |
| `delivery_status` | text | yes | `sent`, `failed` |

Index `(account_id, created_at)` (hourly limit). App role: `SELECT, INSERT, UPDATE`. Rows are kept until the retention rules (Q2).

### `used_tokens` (scope `platform`, kind `append-only`, module `identity`)
The single-use tokens that were used: sign-in tickets (`ticket`), console step tickets (`console_step`) and proof-of-work challenges (`proof_of_work`), by `kind`, `token_id` (the ticket's `jti` or the challenge id; unique per kind) and `expires_at`. A ticket is used by inserting its row in the transaction of the step it authorizes, so a failed step keeps it usable, a restart forgets no use, and of two concurrent uses one wins; a proof of work is used at once, whatever its request then decides. Random ids only, nothing personal. App role: `SELECT, INSERT`. Rows are kept until the retention rules (Q2); server nonces stay in the API's memory, since a restart refuses every nonce it issued.

### `practitioners` (scope `tenant`, kind `business`, module `practitioners`)
The doctor profile of a member with the doctor role. Archived when the doctor role is removed; restored if it is given back.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id`, `membership_id` | uuid | yes | composite foreign key; unique partial `(tenant_id, membership_id) where archived_at is null` |
| `display_name_ar` | text | yes | 2–100 characters, as patients see it ("د. أحمد الخطيب") |
| `display_name_latin` | text | no | 2–100 characters, the S01 Latin name rule |
| `gender` | text | yes | `male`, `female` |
| `syndicate_number` | text | no | 1–30 characters, digits, letters, `-`, `/` |

### `practitioner_specialties` (scope `tenant`, kind `business`, module `practitioners`)
1–3 per practitioner; the first is the main one.

| Field | Type | Required | Constraints |
|---|---|---|---|
| `tenant_id`, `practitioner_id` | uuid | yes | composite foreign key |
| `specialty_id` | uuid | yes | references `specialties(id)` |
| `position` | smallint | yes | 1–3; unique partial per practitioner where `archived_at is null` |

### `practitioner_photos` (scope `tenant`, kind `business`, module `practitioners`)
Same shape and rules as `tenant_logos` (S01): at most one row per practitioner not archived; replacing archives the old one. `content_type` is `image/jpeg` (re-encoded), square, 128–512 pixels, at most 262,144 bytes, `sha256`.

### `specialties` (scope `platform`, kind `business`, module `practitioners`)
Seeded by a custom migration with fixed UUIDv7 ids (public names): general practice, family medicine, internal medicine, pediatrics, obstetrics and gynecology, general dentistry, orthodontics, oral surgery, ENT, ophthalmology, dermatology, orthopedics, cardiology, neurology, psychiatry, urology, general surgery, gastroenterology, endocrinology, chest medicine, nephrology, physical therapy. Fields: `code` (unique, kebab-case), `name_ar`, `name_latin`, `position`. App role: `SELECT`. Vertex adds specialties by migration until S23.

### `tenants` (S01 table): new columns
| Field | Type | Required | Constraints |
|---|---|---|---|
| `idle_lock_minutes` | smallint | yes | 5–60, default 15 |
| `clinical_read_scope` | text | yes | `branch` (default: a doctor reads every patient of their branches) or `own_patients` (S11 defines "own patients"; others by break-glass) |

### `platform_users` (scope `platform`, kind `business`, module `identity`)
Vertex staff, separate from `accounts` (ADR 0005).

| Field | Type | Required | Constraints |
|---|---|---|---|
| `phone` | text | yes | E.164, unique; the sign-in name (no OTP is sent to it) |
| `name` | text | yes | 2–100 characters |
| `role` | text | yes | `admin`, `support` |
| `status` | text | yes | `pending_setup`, `active`, `disabled` |
| `password_hash` | text | no | null until setup |
| `setup_code_hash` | text | no | one-time setup code, 24 hours, after creation or a reset |
| `setup_code_expires_at` | timestamptz | no | |
| `totp_secret` | text | no | encrypted |
| `totp_last_step` | bigint | no | refuses a reused code |
| `failed_sign_ins`, `sign_in_locked_until` | | | as in `accounts` |

### `platform_user_recovery_codes` (scope `platform`, kind `business`, module `identity`)
Ten per TOTP enrollment: `platform_user_id`, `code_hash`, `used_at`. A new enrollment archives the old set.

### `platform_sessions` (scope `platform`, kind `business`, module `identity`)
`platform_user_id`, `token_hash` (unique), `expires_at` (12 hours absolute), `last_seen_at` (30 minutes idle), `reauthenticated_at` (TOTP within 5 minutes for sensitive actions), `ended_at`, `end_reason`.

### `platform_audit_entries` (scope `platform`, kind `append-only`, module `audit`)
Every console request and every account-level change that has no tenant (ADR 0016). Same shape as `audit_entries` without `tenant_id`, plus `subject_tenant_id` (uuid, nullable: the tenant a console action concerns) and `request_route` (the route id, never the body). Actor kinds `platform`, `staff` (account-level changes by the person), `system` (CLI).

### Contracts
`packages/contracts/src/access.ts`: `roleSchema`, `permissionKeySchema`, `permissionCatalog`, `rolePresets`, `effectivePermissions(roles, grants, revokes)`, `grantablePermissions(roles)`, `clinicalReadScopeSchema`. `packages/contracts/src/identity.ts`: `passwordSchema`, `pinSchema` (with the trivial-PIN check), `otpCodeSchema`, sign-in, OTP, ticket, device, enrollment and session shapes. `packages/contracts/src/staff.ts`: membership, invitation, access change shapes. `packages/contracts/src/practitioners.ts`: practitioner, specialty, photo shapes. `packages/contracts/src/console-identity.ts`: platform user, TOTP, recovery code shapes.

## States and rules
### Staff membership
| From | To | Trigger |
|---|---|---|
| (new) | `invited` | Owner invites (or Vertex creates the tenant with `--owner-phone`) |
| `invited` | `active` | The person completes first sign-in (OTP, name, password) before the invitation expires |
| `invited` | (archived) | Owner cancels the invitation |
| `invited` (expired) | `invited` | Owner resends: a new 7-day expiry and a new message |
| `active` | `deactivated` | Owner deactivates, with a reason |
| `deactivated` | `active` | Owner reactivates (S05 limits) |

Rules:
1. An invitation needs a mobile phone, a name, at least one role, a branch scope (all branches or at least one branch), and, with the doctor role, a practitioner profile (professional name, gender, at least one specialty). The account is found by phone or created without a password; the response never says which (no account enumeration).
2. A phone that already has a membership in this tenant is refused with `ALREADY_MEMBER`; a deactivated member is reactivated instead.
3. Invitations are created only while the tenant is `active`, except the owner's, which Vertex creates with the tenant (S01 CLI `--owner-phone`).
4. The invitation message goes out once per invitation and per resend, from a platform number (S03), and says only the clinic's name, the role and that the person can sign in on the clinic's computer with this number. Resend has a 10-minute cooldown.
5. A tenant always has at least one active owner: removing the owner role from, or deactivating, the last active owner is refused with `LAST_OWNER`. Only owners grant or remove the owner role. Owners have all branches.
6. Effective permissions are computed by `effectivePermissions` (Access); a grant or revocation outside the limits is refused with `PERMISSION_NOT_GRANTABLE`. `tenant.read`, `tenant.manage`, `staff.read`, `staff.manage` and `practitioners.read` cannot be revoked from an owner (`ownerLockedPermissions`; owner, 2026-10-19), their own record included, and `effectivePermissions` keeps them whatever is stored.
7. A branch-scoped permission applies only in the member's branches. A member signs in only on devices of a branch in their scope.
8. Deactivation, and removal of a branch from a member's scope, end the member's sessions in this tenant and revoke their enrollments on the affected devices at once online; an offline device learns it on its next connection.
9. Removing the doctor role archives the practitioner profile; S07 and S09 define what happens to that doctor's schedules and bookings. Giving the role back restores the member's latest archived profile, with its photo, specialties and syndicate number (owner, 2026-10-19): the owner sees it prefilled (`GET /api/staff/:id/previous-practitioner`) and the change sends it back with any edits; a change without a profile restores it untouched.
10. Access changes carry the `updated_at` the client read; a stale value returns `CONFLICT` (S01 rule 16).

### Sign-in, passwords and OTP
11. Passwords: 10–128 characters, no composition rules, refused if in the bundled list of common passwords or containing the phone's last 7 digits (`PASSWORD_TOO_WEAK`).
12. Sign-in by phone and password. Five failures in a row lock password sign-in for that account for 15 minutes (`RATE_LIMITED`); the response is the same for an unknown phone, a wrong password and a locked account (`INVALID_CREDENTIALS`) except the lock, which says when to retry.
13. An OTP is required when a person signs in on a device where they are not enrolled (registration of a computer, or a new user on a registered device), at first sign-in, and to set a password after an authorized reset. OTPs follow ADR 0022: six digits, 5 minutes, 5 attempts, 60 seconds between sends, 3 an hour per phone, only a keyed hash stored.
14. Sign-in and OTP requests need a valid proof-of-work solution (ADR 0016), and are rate-limited per IP address (30 per 10 minutes) in addition to the per-account limits.
15. First sign-in: the person enters their phone, receives an OTP if an invitation is pending (the response is the same otherwise), confirms their name and sets a password; every pending invitation of this account becomes active, and the person then enrolls on the device (rule 20).
16. An owner may authorize a password reset for a member (`staff.manage`): the account may set a new password through an OTP within 72 hours. The old password keeps working until replaced, so the reset never affects the person's access to other clinics. Setting the new password ends this account's staff sessions in every tenant (`password_reset`); device enrollments stay.
17. An owner who lost their password or phone recovers through Vertex support (ADR 0005): `support` or `admin`, after identity checks outside the system, authorizes the reset (rule 16) or changes the account's phone, with a reason and TOTP re-authentication; both are written to the platform audit and to the audit of every tenant where the account is an owner.

### Devices, enrollment and PIN
18. A computer is registered by a member with `devices.manage` for the chosen branch: sign in with phone, password and OTP; choose the clinic among those offered (rule 27); choose the branch; name the computer. The installation makes an Ed25519 device key pair; only the public key leaves it. The registering member is enrolled in the same step.
19. An installation may hold registrations to several clinics (ADR 0024), each with its own device key, enrollments, local data and (from S04) database. It never holds two registrations to the same tenant. "Add a clinic to this computer" repeats rule 18.
20. A member is enrolled on a device by signing in on it with phone, password and OTP, then choosing a PIN; the installation makes a per-user Ed25519 key pair, whose private key is wrapped with an Argon2id key derived from the PIN (64 MiB, 3 passes) and then by Electron `safeStorage` (ADR 0021). Only the public key goes to the server.
21. PIN: exactly six digits; refused if all digits are equal, ascending or descending (`123456`, `987654`), or equal to the last six digits of the phone. The PIN never leaves the device.
22. Five wrong PINs in a row disable PIN unlock for that member on that registration. An online password sign-in on the device (no OTP: the member is enrolled) re-enables it. "Forgot PIN" is an online password sign-in that replaces the enrollment with a new key and PIN (`pin_forgotten`). Other members of the device keep working.
23. Opening a staff session with the PIN online: the device signs a server nonce with the device key (device token) and the member signs it with the user key; the server checks the device is active, the enrollment is active, the membership is active and the device's branch is in the member's scope, then issues an access token (15 minutes) and a refresh token (session up to 12 hours), and sets `last_confirmed_at`.
24. Offline, the PIN unlocks the member's key locally while `last_confirmed_at` is less than 7 days old (the offline window). The device keeps the highest time it has seen; the window is computed from the later of the device clock and that time, so setting the clock back never extends it, and a clock behind the highest time shows a clock warning.
25. After `idle_lock_minutes` without input (default 15, owner sets 5–60), the app locks and shows the member picker; any enrolled member unlocks with their PIN. Locking ends the online session (`locked`).
26. With several clinic registrations, the member picks the clinic first; switching clinic locks the current one.
27. The clinics offered at registration are those linked to the account where the membership is active (or invited, completing first sign-in), the tenant is not `closed` (owners excepted), and the member has `devices.manage` for at least one branch, which are the branches offered.
28. A device with `facility_id` null (tenant in onboarding) is used only by the owner for the wizard; when the wizard creates the first branch, every such device of the tenant gets that branch.
29. Revoking a device (with a reason category: `lost_or_stolen`, `replaced`, `other`, and free text) is immediate on the server: its tokens, enrollments and sessions stop working. On its next connection the API answers `DEVICE_REVOKED`, and the installation deletes that registration's keys and local data (from S04, after the audit-only upload and the quarantine upload of ADR 0021 and Q14) and confirms the wipe (`wiped_at`). Other clinic registrations on the same installation are untouched.
30. A revoked device's pending commands (S04) are uploaded to a quarantine, stored flagged as coming from a revoked device, and nothing is applied until an owner reviews each one and accepts it (it is then run as a late command, with the normal conflict rules) or rejects it with a reason (Q14, owner 2026-10-18). Pending `RecordAccessed` commands go through the audit-only path (ADR 0021).
31. A deactivated member's pending commands on a device that is still active (S04) are accepted normally when created before `deactivated_at` and the device's clock skew is within the S04 limit; otherwise they go to the quarantine of rule 30 (owner, 2026-10-18).
32. A branch with active devices cannot be archived (`FACILITY_HAS_DEVICES`; S01 rule 7). Moving a device to another branch is revoking it and registering it again.
33. Staff sign in while the tenant is `suspended` (read-only plus export, ADR 0013): every S02 action works except new invitations (`TENANT_SUSPENDED`). While `closed`, only owners sign in, and invitations and registrations by non-owners are refused (`TENANT_CLOSED`).

### Practitioner profiles
34. The doctor edits their own profile; owners edit every practitioner profile of their tenant. Gender and at least one specialty are required; the professional name is prefilled from the account name with "د.".
35. The photo is optional: PNG, JPEG or WebP up to 2 MB, decoded and re-encoded on the server to a square JPEG of at most 512 × 512 with metadata stripped, refused (`FILE_REJECTED`) if it does not decode or exceeds 262,144 bytes. It appears to patients only where S19 and S21 show the doctor, for tenants listed in the directory.

### Console (F40)
36. Vertex creates the first `admin` with the CLI; admins create platform users in the console. A new or reset user gets a one-time setup code (24 hours) shown once to the admin, who hands it over in person; the user signs in with phone and code, sets a password and enrolls TOTP.
37. Sign-in is phone and password, then a TOTP code (RFC 6238, 30-second steps, one step of tolerance, a used step refused) or one of ten single-use recovery codes. TOTP enrollment is mandatory before any other console action and is confirmed with a valid code; recovery codes are shown once.
38. Sensitive actions need a TOTP entered in the last 5 minutes (`REAUTH_REQUIRED`): tenant status and directory changes, owner recovery, phone changes, platform user management.
39. Sessions last 12 hours at most and end after 30 minutes without a request. The session is an `HttpOnly`, `Secure`, `SameSite=Strict` cookie scoped to `/api/console/`; console write routes also check the `Origin` header.
40. An admin cannot disable, demote or reset themselves; the last active admin cannot be disabled or demoted (`LAST_ADMIN`). A lost TOTP is reset by another admin (or, for the last admin, with the CLI).
41. Every console request, read or write, that carries a known session token writes a `platform_audit_entries` row with the route id, the ids involved, the subject tenant and the session's user, also when the session is ended, expired, idle or its user disabled (the row commits with the end this request makes), and when the origin, the role or re-authentication refuses it. Every failed console sign-in, setup or TOTP step for the phone of an existing platform user, disabled or locked included, writes `platform_user.sign_in_failed` or `platform_user.totp_failed`; a step refused before any user or code is looked at (an invalid or used ticket, the per-user code rate limit) is not an attempt and writes none. A request with no or an unknown session token, and a sign-in for an unknown phone, writes no audit row: it stays under the rate limits, and at most a server security log line with the route and a reason code, never a phone, token, address or body (owner, 2026-10-19). Console actions on a tenant also write the tenant's `audit_entries` (S01).

## Offline behavior and conflicts
- **Works offline:** unlocking with the PIN within the offline window, idle lock and member switching, clinic switching on a multi-clinic installation. The device enforces branch scope and permissions locally from the membership and catalog it last received (S04 replicates memberships; until then the clinic app is online-only for everything but these screens).
- **Needs a connection:** registering a computer, enrolling a member, first sign-in, password sign-in, forgot PIN, every staff, device, practitioner and security-setting change (configuration, ADR 0008), the console.
- **What the server re-checks:** every online session re-checks device, enrollment, membership, branch scope and tenant status (rule 23); from S04, every command carries the member's user-key proof and is re-checked against the membership's permissions at the command's time (rules 30–31).
- **Conflicts:** a member deactivated or removed from a branch while a device is offline keeps working on that device until it connects, for at most the remaining offline window (7 days); a revoked device likewise. Their commands are judged by rules 30–31; nothing is applied silently. Concurrent online access edits are refused by rule 10.
- No number ranges.
- **What the user sees offline:** the PIN pad works; actions that need a connection are disabled with "needs an internet connection"; when the window has expired: "Connect to the internet to continue" for that member only; a revoked registration shows "This computer was removed from <clinic>; its data on this computer was deleted" after the wipe.

## Clinical data and privacy
No medical data is created or read by S02. It fixes who may read and write medical data later (Access), including the owner's read-only access to every clinical record (each read audited, ADR 0016) and the clinical read scope.
- Phones, names, gender and photos of staff are personal data: never in logs, error reports or URLs (ids only); the rate-limiter keys use keyed hashes of phones, never the phones.
- The invitation and OTP messages carry no medical content (ADR 0012).
- A practitioner's gender, specialties, professional name and photo are shown to patients from S19 and S21; nothing else of the account is.
- Revocation deletes what the installation holds for that clinic (from S04, the database), preserving the audit and quarantine uploads first.

## Money
None.

## API and commands
Modules: `apps/api/src/modules/platform/identity/` (sign-in, OTP, proof of work, devices, enrollments, sessions, console identity), `apps/api/src/modules/platform/access/` (memberships, invitations, catalog), `apps/api/src/modules/health/practitioners/`. The session guard in `apps/api/src/core/access/` replaces the fail-closed branch for staff and console routes and sets the actor and the tenant context from verified tokens only (ADR 0004). New access declarations: `@DeviceRoute()` (a valid device token, no member), `@TicketRoute(purpose)` (a valid sign-in ticket). `StaffActor` becomes `{ kind: 'staff', tenantId, membershipId, accountId, deviceId, facilityId, permissions }`.

Tokens: access tokens and device tokens are EdDSA JWTs signed by the API (keys from the environment, JWKS published at `/api/.well-known/jwks.json` for S04); tickets are signed, 10 minutes, single use; refresh tokens are opaque with a server-signed tenant and session id, stored hashed.

| Method and path | Access | Request | Response | Error codes |
|---|---|---|---|---|
| `POST /api/auth/pow` | Public | — | challenge | `RATE_LIMITED` |
| `POST /api/auth/sign-in` | Public (device token optional) | phone, password, proof of work | `{ step: 'otp', challengeId }` or, on an enrolled device, `{ step: 'done', ticket }` | `INVALID_CREDENTIALS`, `POW_INVALID`, `RATE_LIMITED`, `OTP_DELIVERY_UNAVAILABLE` |
| `POST /api/auth/otp/request` | Public | phone, purpose `first_sign_in` or `password_reset`, proof of work | `{ challengeId }` (always) | `POW_INVALID`, `RATE_LIMITED` |
| `POST /api/auth/otp/resend` | Public | challengeId | `{ challengeId }` | `OTP_COOLDOWN`, `RATE_LIMITED` |
| `POST /api/auth/otp/verify` | Public | challengeId, code | `{ ticket, needsPassword, needsName }` | `OTP_INVALID`, `OTP_EXPIRED`, `OTP_ATTEMPTS_EXCEEDED` |
| `POST /api/auth/password` | Ticket | name (first sign-in), password | `{ ticket }` | `PASSWORD_TOO_WEAK`, `TICKET_INVALID` |
| `GET /api/auth/registration-options` | Ticket | — | clinics and branches (rule 27) | `TICKET_INVALID` |
| `POST /api/devices` | Ticket | tenantId (from the options, rechecked), facilityId, name, publicKey, os, appVersion, userPublicKey | device, enrollment, session tokens | `FORBIDDEN`, `TENANT_CLOSED`, `TICKET_INVALID`, `VALIDATION_FAILED` |
| `POST /api/devices/token/challenge` | Public | deviceId | nonce | `RATE_LIMITED` |
| `POST /api/devices/token` | Public | deviceId, nonce, signature, appVersion | device token (5 minutes) | `DEVICE_REVOKED`, `DEVICE_UNKNOWN`, `SIGNATURE_INVALID` |
| `GET /api/devices/current` | Device | — | registration status, tenant, branch, enrollments' members and settings | `DEVICE_REVOKED` |
| `POST /api/devices/current/wiped` | Device (revoked allowed) | — | — | — |
| `POST /api/devices/current/enrollments` | Device + ticket | userPublicKey | enrollment, session tokens | `MEMBERSHIP_INACTIVE`, `BRANCH_NOT_IN_SCOPE`, `TICKET_INVALID` |
| `POST /api/sessions` | Device | enrollmentId, nonce, user signature | session tokens | `ENROLLMENT_REVOKED`, `MEMBERSHIP_INACTIVE`, `BRANCH_NOT_IN_SCOPE`, `SIGNATURE_INVALID` |
| `POST /api/sessions/refresh` | Device | refresh token | session tokens | `SESSION_ENDED` |
| `POST /api/sessions/current/end` | Staff | reason `signed_out` or `locked` | — | — |
| `GET /api/me` | Staff | — | account, membership, effective permissions, practitioner | — |
| `PUT /api/me/password` | Staff | current, new | — | `INVALID_CREDENTIALS`, `PASSWORD_TOO_WEAK` |
| `GET /api/access/catalog` | Staff, `tenant.read` | — | permissions, presets, limits | — |
| `GET /api/staff` | Staff, `staff.read` | status filter, list params | `{ items, total, page, pageSize }` | — |
| `GET /api/staff/:id` | Staff, `staff.read` | — | membership | `NOT_FOUND` |
| `GET /api/staff/:id/previous-practitioner` | Staff, `staff.manage` | — | `{ practitioner, photo }`, the latest archived profile (both null with a current profile or none) | `NOT_FOUND` |
| `POST /api/staff/invitations` | Staff, `staff.manage` | phone, name, roles, branch scope, adjustments, practitioner | membership | `ALREADY_MEMBER`, `PERMISSION_NOT_GRANTABLE`, `TENANT_SUSPENDED`, `TENANT_CLOSED`, `VALIDATION_FAILED` (S05: `NOT_ENTITLED`) |
| `POST /api/staff/:id/invitation/resend` | Staff, `staff.manage` | — | membership | `INVALID_STATUS_TRANSITION`, `RATE_LIMITED` |
| `POST /api/staff/:id/invitation/cancel` | Staff, `staff.manage` | — | membership | `INVALID_STATUS_TRANSITION` |
| `PATCH /api/staff/:id/access` | Staff, `staff.manage` | roles, branch scope, adjustments, `updatedAt` | membership | `LAST_OWNER`, `PERMISSION_NOT_GRANTABLE`, `CONFLICT` |
| `POST /api/staff/:id/deactivate` | Staff, `staff.manage` | reason | membership | `LAST_OWNER`, `INVALID_STATUS_TRANSITION` |
| `POST /api/staff/:id/reactivate` | Staff, `staff.manage` | — | membership | `INVALID_STATUS_TRANSITION` (S05: `NOT_ENTITLED`) |
| `POST /api/staff/:id/password-reset` | Staff, `staff.manage` | — | — | `INVALID_STATUS_TRANSITION` |
| `GET /api/practitioners`, `GET /api/practitioners/:id` | Staff, `practitioners.read` | — | practitioner(s) | `NOT_FOUND` |
| `PATCH /api/practitioners/:id` | Staff, `staff.manage` or own with `practitioner.edit_own` | profile, `updatedAt` | practitioner | `FORBIDDEN`, `CONFLICT`, `VALIDATION_FAILED` |
| `PUT`, `GET`, `DELETE /api/practitioners/:id/photo` | As `PATCH` (`GET`: `practitioners.read`) | file ≤ 2 MB | photo | `FILE_REJECTED`, `NOT_FOUND` |
| `GET /api/specialties` | Staff, `practitioners.read` | — | specialties | — |
| `GET /api/devices`, `GET /api/devices/:id` | Staff, `devices.manage` (branches in scope) | — | devices with enrollments | `NOT_FOUND` |
| `PATCH /api/devices/:id` | Staff, `devices.manage` | name | device | `NOT_FOUND` |
| `POST /api/devices/:id/revoke` | Staff, `devices.manage` | reason category, reason | device | `INVALID_STATUS_TRANSITION`, `NOT_FOUND` |
| `POST /api/devices/:id/enrollments/:enrollmentId/revoke` | Staff, `devices.manage` | — | enrollment | `NOT_FOUND` |
| `PATCH /api/tenant/security` | Staff, `tenant.manage` | idleLockMinutes, clinicalReadScope, `updatedAt` | tenant | `CONFLICT`, `TENANT_CLOSED` |
| `POST /api/console/auth/sign-in` | Public | phone, password or setup code, proof of work | `{ step: 'totp' or 'setup' }` | `INVALID_CREDENTIALS`, `RATE_LIMITED` |
| `POST /api/console/auth/setup` | Console setup step | password; TOTP secret confirmation code | recovery codes, session | `PASSWORD_TOO_WEAK`, `TOTP_INVALID` |
| `POST /api/console/auth/totp` | Console TOTP step | code or recovery code | session | `TOTP_INVALID`, `RATE_LIMITED` |
| `POST /api/console/auth/reauth` | Console | code | — | `TOTP_INVALID` |
| `POST /api/console/auth/sign-out`, `GET /api/console/me`, `PUT /api/console/me/password` | Console | — | — | `INVALID_CREDENTIALS`, `PASSWORD_TOO_WEAK` |
| `GET`, `POST /api/console/platform-users`; `PATCH /api/console/platform-users/:id`; `POST /api/console/platform-users/:id/reset` | Console, `platform-users.manage` (re-auth for writes) | — | platform user, setup code once | `LAST_ADMIN`, `REAUTH_REQUIRED` |
| `POST /api/console/accounts/lookup` | Console, `accounts.recover` | phone (in the body: phones never go in URLs) | account with its memberships (tenant names and roles) | `NOT_FOUND` |
| `POST /api/console/accounts/:id/password-reset` | Console, `accounts.recover`, re-auth | reason | — | `REAUTH_REQUIRED` |
| `PUT /api/console/accounts/:id/phone` | Console, `accounts.recover`, re-auth | phone, reason | account | `ALREADY_MEMBER` (phone in use), `REAUTH_REQUIRED` |

New error codes in `packages/contracts/src/errors.ts` with Arabic texts: `INVALID_CREDENTIALS` (401), `TICKET_INVALID` (401), `SESSION_ENDED` (401), `SIGNATURE_INVALID` (401), `DEVICE_UNKNOWN` (401), `DEVICE_REVOKED` (403), `ENROLLMENT_REVOKED` (403), `MEMBERSHIP_INACTIVE` (403), `BRANCH_NOT_IN_SCOPE` (403), `REAUTH_REQUIRED` (403), `POW_INVALID` (400), `OTP_INVALID` (422), `OTP_EXPIRED` (422), `OTP_ATTEMPTS_EXCEEDED` (429), `OTP_COOLDOWN` (429), `PASSWORD_TOO_WEAK` (422), `TOTP_INVALID` (422), `PERMISSION_NOT_GRANTABLE` (422), `ALREADY_MEMBER` (409), `LAST_OWNER` (409), `LAST_ADMIN` (409), `FACILITY_HAS_DEVICES` (409), `OTP_DELIVERY_UNAVAILABLE` (503).

CLI (`apps/api/src/cli/`): `tenant:create` gains `--owner-phone <phone> --owner-name <name>` (S01); `platform-user:create --phone <phone> --name <name> --role <admin|support>` and `platform-user:reset <id>` print a one-time setup code; `account:authorize-password-reset --phone <phone> --reason <text>`; `account:change-phone --phone <old> --new-phone <new> --reason <text>`. They are added to the `AGENTS.md` commands table.

`OtpSender` (`apps/api/src/modules/platform/identity/`): `send(accountId, phone, code, purpose)`. S02 ships the fake (records the last code per account in memory for tests; in development prints "OTP for account <id>: <code>" to the API's output, never the phone). The API refuses to start with the fake when `NODE_ENV=production`. S03 adds the gateway sender.

## Jobs, events and notifications
- Event `staff.invitation_created.v1` `{ tenantId, membershipId }` in the outbox, on invitation and on resend. S03 consumes it and sends the invitation message from a platform number (rule 4), then sets `invitation_message_status`. S02 registers no handler; the status stays `pending` until S03.
- OTPs go through `OtpSender` synchronously, not the outbox, because the code must never be stored in clear.
- No push. No worker jobs.

## Screens
Clinic app, Arabic RTL, design-system components. Online-only screens use TanStack Query (ADR 0020); each has loading, error and offline states, the offline state disabling actions that need a connection.

1. **Welcome** (`/welcome`), unregistered installation: "Register this computer" and "First time? Sign in with your phone".
2. **Sign-in** (`/sign-in`): phone and password; OTP step with resend countdown; first sign-in steps (name, password with strength hints); errors from the codes above; lock message with retry time.
3. **Register this computer** (`/register`): clinic choice (skipped with one), branch choice (skipped with one), computer name, then the PIN step.
4. **Choose a PIN** (`/pin/new`): six digits twice, with the trivial-PIN rule explained.
5. **Member picker and lock screen** (`/lock`): the clinic's name and logo, enrolled members (name and roles), PIN pad, "Another user" (sign-in on this device), "Forgot PIN", the clinic switcher with "Add a clinic to this computer". States: offline (PIN works, sign-in disabled), window expired for a member, PIN disabled after 5 attempts, clock warning, revoked-and-wiped notice.
6. **Staff** (`/settings/staff`), `staff.read`: list with name, roles, branches, status (invited with expiry and message status, active, deactivated); filters; "Invite" for owners.
7. **Invite and member detail** (`/settings/staff/new`, `/settings/staff/:id`), owner: phone, name, roles (owner role shown to owners only), branch scope, permissions grouped as in the catalog, each showing "from role", "added" or "removed", with items outside the limits disabled and explained; doctor profile fields when the doctor role is chosen, prefilled from the member's previous profile when they had one (rule 9); actions resend, cancel, deactivate, reactivate, authorize password reset. Read-only for `staff.read` without `staff.manage`.
8. **Doctor profile** (`/settings/staff/:id/profile`, and `/me/profile` for the doctor): professional names, gender, specialties (1–3, the first is main), syndicate number, photo with preview and remove.
9. **Devices** (`/settings/devices`), `devices.manage`: computers of the branches in scope with name, branch, status, last seen, app version and enrolled members; rename, revoke (reason category and text, with a warning about pending work), remove a member from a device.
10. **Security** (in clinic settings), owner: idle-lock minutes; clinical read scope (all patients of the doctor's branches, or the doctor's own patients with break-glass for others).
11. **My account** (`/me`): name, phone (read-only, "contact your clinic owner or Vertex to change it"), change password, change PIN on this computer.

Console (web, Arabic RTL):
12. **Sign-in** (`/sign-in`), with setup (password, TOTP QR and confirmation, recovery codes shown once) and the TOTP step (or a recovery code).
13. **Re-authentication dialog**: a TOTP code before a sensitive action.
14. **Platform users** (`/platform-users`), admin: list, create (setup code shown once), change role, disable, reset.
15. **My account** (`/me`): change password, recovery codes remaining.

## Audit
In the tenant's `audit_entries`, same transaction, ids only: `staff.invited`, `staff.invitation_resent`, `staff.invitation_cancelled`, `staff.invitation_accepted`, `staff.access_changed`, `staff.deactivated` (reason), `staff.reactivated`, `staff.password_reset_authorized`, `device.registered`, `device.renamed`, `device.revoked` (reason), `device.wiped`, `device_enrollment.created`, `device_enrollment.revoked`, `staff_session.started`, `practitioner.updated`, `practitioner_photo.replaced`, `practitioner_photo.archived`, `tenant.security_updated`, and console recovery actions on the tenant's owners.
In `platform_audit_entries`: every console request with a known session token, refused or over included (rule 41), `account.created`, `account.password_set`, `account.phone_changed`, `account.sign_in_locked`, `platform_user.*`, console sign-ins, and failed sign-in, setup and TOTP attempts for existing platform users (rule 41).
Wrong PINs and PIN lockouts happen offline; from S04 the device uploads them as audit commands.

## Abuse and failure cases
- **Password guessing and OTP flooding:** proof of work, per-IP and per-account limits, the 15-minute lock, ADR 0022's OTP limits and the platform numbers' daily caps; the same answers for known and unknown phones.
- **Account enumeration** through invitations, OTP requests or sign-in: identical responses and similar timing.
- **SIM or WhatsApp takeover:** an OTP alone never gives access: sign-in also needs the password, and a password reset needs the owner's (or Vertex's) authorization.
- **Stolen clinic PC:** the database (S04) and the user keys need a member's PIN plus the Windows account (DPAPI); five wrong PINs disable each member; the owner revokes the device and it wipes on its next connection; offline use ends with the 7-day window.
- **Setting the clock back** to extend the offline window: the highest-seen time (rule 24).
- **Cross-tenant access:** tenant context only from verified tokens; `staff_memberships`, devices, enrollments, sessions and practitioners under forced RLS; the link table is read only to offer clinics at sign-in and every choice is rechecked under the tenant's RLS; a device token for one tenant is refused on another tenant's resources (`NOT_FOUND`).
- **A forged or replayed device or user proof:** nonces are single use and expire in 60 seconds; signatures cover the nonce, the device id and the enrollment id.
- **Privilege escalation by a member with `staff.read` or `devices.manage`:** staff writes are owner-only; `devices.manage` acts only on branches in scope and cannot enroll anyone but the signing-in member.
- **Owner lockout:** several owners allowed, last owner protected, support recovery with audit.
- **Console compromise:** mandatory TOTP, re-authentication, short sessions, `SameSite=Strict` cookie and `Origin` check, every request audited, last admin protected.
- **Fake OTP sender in production:** refused at start.
- **OTP numbers banned (ADR 0012):** new sign-ins wait (`OTP_DELIVERY_UNAVAILABLE`); PIN sign-ins on enrolled devices keep working.
- **Double submit:** invitation creation is refused the second time by `ALREADY_MEMBER`; device registration with the same public key is refused by its unique key; enrollment by the unique partial index.

## Edge cases
1. A doctor works in two clinics: one account, two memberships; on a shared installation the clinic switcher shows both; on each clinic's own computers only that clinic.
2. A person is invited by two clinics at once: one first sign-in activates both invitations.
3. An invitation expires before first sign-in: the OTP request answers as for an unknown phone; the owner resends.
4. The owner removes the last branch of a member's scope: refused (`VALIDATION_FAILED`); deactivate instead.
5. A branch is archived: impossible with active devices (rule 32); members whose only branch it was keep their membership and must be given another branch to sign in.
6. The device is offline when its member is deactivated: the member keeps working there until the device connects (at most 7 days); rule 31 judges their commands.
7. The PC clock was reset by a power cut: the clock warning shows; the offline window uses the highest-seen time; S04 handles skew on commands.
8. A tenant is suspended during a session: the session continues read-only (S05 enforces writes); invitations are refused.
9. A tenant is closed: non-owners' sessions are refused on their next refresh; owners keep signing in for export.
10. The only owner forgets their PIN while offline: they wait until the device is online and use "Forgot PIN"; another enrolled member can keep working. What happens to local data whose key is only in the forgotten PIN's slot is decided in S04 (Open questions).
11. A member is given the doctor role later: the practitioner profile is required in the same change. A member who had one sees their previous profile prefilled for review, its photo shown, and saving restores it with the owner's edits (rule 9); a member who never had one gets an empty profile with the professional name prefilled (rule 34).
12. Two owners change the same member's access at once: the second gets `CONFLICT` (rule 10).
13. The account's phone is changed by support while the person is enrolled on devices: enrollments and PINs keep working; the next OTP goes to the new phone.
14. The same installation is registered to a clinic twice: the app refuses locally; the server refuses a second registration that reuses a public key.

## Open questions
- **For S04, not blocking S02:** a member forgets their PIN on a device where no other member's key slot can open the local database and commands are pending. Recommendation: a server-escrowed recovery slot (the database key wrapped by a key the server releases only after an online password sign-in on that device), so pending work is never lost; S04 decides with an ADR amendment to 0021.

## Acceptance
- **Owner checks (fake OTP sender; codes read from the API's output):**
  1. `tenant:create --name-ar "عيادة تجريبية" --owner-phone <synthetic phone> --owner-name "مالك تجريبي" --reason "test"`.
  2. Open the clinic app, "First time? Sign in with your phone", enter the OTP, set a name and a password; register the computer, name it, choose a PIN; finish the onboarding wizard (S01) and see the device get the first branch.
  3. Invite a receptionist and a doctor (gender, two specialties, a photo); see both as invited with message status "pending".
  4. Lock the app, "Another user": the receptionist's first sign-in and PIN; check the receptionist cannot open staff or device settings.
  5. Disconnect the internet: unlock with the PIN as the owner and the receptionist; see sign-in and settings disabled; wait for the idle lock (set it to 5 minutes).
  6. Reconnect; enter a wrong PIN five times as the receptionist and re-enable it with the password.
  7. Register a second clinic on the same computer and switch between them.
  8. Revoke the computer from the second clinic on another device or by the owner's session: see the wipe notice for that clinic only.
  9. Try to archive a branch with an active device: `FACILITY_HAS_DEVICES`.
  10. Console: `platform-user:create`, sign in with the setup code, enroll TOTP, see recovery codes once, create a `support` user, change a tenant's status from the API with and without re-authentication; see the platform audit rows.
  11. The S01 "after S02" checks (spec S01, Acceptance).
- **Tests:**
  - API, every route of S01 and S02: success, 401 without a session, 403 without the permission (`facility.manage` on another branch, `devices.manage` outside scope), another tenant's ids (`NOT_FOUND`), console routes refused for staff sessions and staff routes for console sessions, device routes refused without a device token.
  - Unit (contracts): `effectivePermissions` and every limit in the preset tables, PIN rules, password rules, phone normalization reuse.
  - Service: invitation states and expiry, `ALREADY_MEMBER`, `LAST_OWNER`, `PERMISSION_NOT_GRANTABLE`, deactivation ending sessions and enrollments, branch-scope removal, password reset window and its effect on other tenants, OTP limits (expiry, attempts, cooldown, hourly limit, keyed hash only), sign-in lock, proof of work, account enumeration answers, device registration options, enrollment, session checks, revocation, ticket single use, nonce replay, tenant status rules, practitioner profile rules and photo re-encoding.
  - Console: setup code, TOTP enrollment and replay refusal, recovery codes single use, re-authentication window, idle and absolute expiry, `LAST_ADMIN`, platform audit on every request.
  - Database: convention test for every new table; `platform_audit_entries` refuses update and delete; specialties seed.
  - Clinic app (Electron main, unit): key generation, PIN wrapping and unwrapping (Argon2id + `safeStorage`), lockout counter, offline window with clock rollback, idle lock timer, multi-clinic registrations, wipe of one registration.
  - E2E with a mocked API: welcome, first sign-in, registration, PIN, lock screen states (offline, window expired, PIN disabled, clock warning, wiped), staff list and invite with the permission editor, doctor profile, devices, security settings; console sign-in, TOTP setup, platform users; RTL screenshots light and dark.
