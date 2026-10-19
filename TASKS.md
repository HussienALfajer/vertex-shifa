# TASKS — S02 Identity, access and devices

Spec: `docs/specs/S02-identity-access-and-devices.md` (Approved 2026-10-18). ADRs: 0004, 0005, 0008, 0012, 0013, 0016, 0020, 0021, 0022, 0024. Seven PRs; each leaves `main` working, and every route stays fail-closed until the PR that adds its guard.

## PR 1 — contracts and database (`feat/s02-identity-data`)
- [x] Contracts `access.ts`: roles, permission catalog (S01 and S02 keys) with groups, branch scope and limits, role presets, `effectivePermissions`, `grantablePermissions`, `clinicalReadScopeSchema`; unit tests for every preset and limit
- [x] Contracts `identity.ts`: `passwordSchema` (common-password list, phone digits), `pinSchema` (trivial PINs, phone digits), `otpCodeSchema`, OTP and sign-in policies, offline window, device and session codes; tests. Request and response shapes arrive with their routes (PR 2–4)
- [x] Contracts `staff.ts`, `practitioners.ts`, `console-identity.ts`: membership state table, invitation and access change inputs, practitioner profile and specialty, photo policy, platform roles and permissions, TOTP, setup and recovery codes; tests
- [x] Contracts: new error codes with Arabic texts, audit actions with labels (the `staff.invitation_created.v1` event arrives with the owner invitation in PR 2)
- [x] Database (`/db-migration`): `accounts`, `account_tenant_links`, `staff_memberships`, `staff_membership_facilities`, `devices`, `device_enrollments`, `staff_sessions`, `otp_challenges`, `practitioners`, `practitioner_specialties`, `practitioner_photos`, `specialties` (seeded), `platform_users`, `platform_user_recovery_codes`, `platform_sessions`, `platform_audit_entries` (append-only); `tenants.idle_lock_minutes`, `tenants.clinical_read_scope`; RLS and grants; registry and owner map
- [x] Database tests: conventions, isolation of the new tenant tables, `platform_audit_entries` refuses update and delete, specialties seed; migration drift
- [x] Docs: `docs/architecture.md` tables (already listed by the spec PR), `packages/db/CLAUDE.md`, `packages/contracts/CLAUDE.md`
- [x] Checks, reviewer, acceptance (summary), PR with auto-merge

## PR 2 — API: sign-in, devices and sessions (`feat/s02-identity-api`)
- [x] Config: `IDENTITY_HASH_KEY`, `IDENTITY_TOKEN_KEY` (Ed25519), proof-of-work difficulty, `OTP_SENDER` (fake refused in production); `.env.example` fake values. `IDENTITY_ENCRYPTION_KEY` moves to PR 4, with its first use (the TOTP secret)
- [x] Identity module: proof of work, `OtpSender` port and fake (refused in production), OTP challenges (ADR 0022 limits), sign-in with lock, tickets (single use), password set, registration options, device registration, device token challenge and token, enrollments, staff sessions (nonce, signatures, refresh, end), JWKS, `/api/me`, `PUT /api/me/password`, `/api/devices/current`, wiped. `/api/me` without the practitioner (PR 3, health layer); `POST /api/sessions/challenge` added for the session nonce
- [x] Session guard in `core/access`: staff access tokens, `@DeviceRoute()`, `@TicketRoute(purpose)`, permissions from `effectivePermissions` with branch scope, tenant status rules; `StaffActor` reshaped; console routes stay fail-closed
- [x] Access module: membership reads needed by sign-in and sessions; `GET /api/access/catalog`
- [x] Event `staff.invitation_created.v1` in the outbox; CLI: `tenant:create --owner-phone --owner-name` (owner invitation); `account:authorize-password-reset`, `account:change-phone`
- [x] S01 rule 7: `FACILITY_HAS_DEVICES`; onboarding wizard gives null-branch devices the first branch (rule 28)
- [x] HTTP access tests of every S01 route (success, 401, 403, another tenant) and of the PR's routes; service tests from the spec's list
- [x] OpenAPI regenerated, clinic API types regenerated; `AGENTS.md` commands
- [x] Checks, reviewer, acceptance (summary), PR with auto-merge

## PR 3 — API: staff, practitioners, devices and security settings (`feat/s02-staff-api`)
- [x] Invitations (create, resend, cancel; outbox event), access changes (`LAST_OWNER`, `PERMISSION_NOT_GRANTABLE`, `CONFLICT`), deactivate and reactivate (ending sessions and enrollments), staff password reset, staff list and detail
- [x] Practitioners: list, read, edit (own or owner), photo upload with re-encoding, specialties list; doctor role adds, archives and restores the profile; `/api/me` gains the practitioner
- [x] Devices management: list, read, rename, revoke, remove a member from a device
- [x] `PATCH /api/tenant/security`
- [x] HTTP access tests and service tests; OpenAPI and clinic types regenerated
- [x] Checks, reviewer, acceptance (summary), PR with auto-merge

## PR 4 — API: console identity (`feat/s02-console-api`)
- [x] Platform users: setup code, password, TOTP enrollment and replay refusal, recovery codes, sessions (cookie, idle and absolute expiry, `Origin` check), re-authentication, `LAST_ADMIN`
- [x] Console session guard; platform audit row for every console request; S01 console routes require re-authentication where rule 38 says
- [x] Console account recovery routes; CLI `platform-user:create`, `platform-user:reset`
- [x] HTTP access tests (console refused for staff sessions and the reverse); OpenAPI regenerated
- [x] Checks, reviewer, acceptance (summary), PR with auto-merge

## PR 5 — Clinic app: devices, PIN and lock (`feat/s02-clinic-sign-in`)
- [x] Electron main: device and user keys (Ed25519), PIN wrapping (Argon2id + `safeStorage`), lockout counter, offline window with highest-seen time, multi-clinic registrations, wipe of one registration; IPC bridge; unit tests
- [x] Screens: welcome, sign-in (OTP, first sign-in), register this computer, choose a PIN, member picker and lock screen (all states), idle lock, clinic switcher, my account
- [x] Session handling in the API client (access token, refresh, `DEVICE_REVOKED` wipe)
- [x] i18n; E2E with a mocked API; RTL screenshots light and dark
- [x] Checks, reviewer, owner acceptance (steps 1, 2, 4–8 of the spec), PR with auto-merge

## PR 6 — Clinic app: staff, doctor profile, devices and security (`feat/s02-clinic-staff`)
- [x] Screens: staff list, invite and member detail with the permission editor, doctor profile with photo, devices, security settings
- [x] i18n; E2E with a mocked API; RTL screenshots light and dark
- [x] Checks, reviewer, owner acceptance (steps 3, 9, 11 of the spec), PR with auto-merge

## PR 6b — Owner decisions of 2026-10-19 (`feat/s02-owner-locks-and-profile-restore`)
- [x] Owners keep `tenant.read`, `staff.read` and `practitioners.read` too (rule 6): contracts, API refusal, tests
- [x] The doctor role given back shows the previous profile prefilled for review and restores it with the owner's edits (rule 9, edge case 11): `GET /api/staff/:id/previous-practitioner`, clinic member screen, API and E2E tests
- [x] Checks, reviewer, owner acceptance, PR with auto-merge

## PR 7 — Console: sign-in, TOTP and platform users (`feat/s02-console-sign-in`)
- [ ] Screens: sign-in with setup and TOTP step, re-authentication dialog, platform users, my account
- [ ] i18n; E2E with a mocked API; RTL screenshots light and dark
- [ ] Checks, reviewer, owner acceptance (step 10 of the spec), PR with auto-merge; `docs/ROADMAP.md` S02 done
