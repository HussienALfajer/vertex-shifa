# 0024 — Identity, sessions and devices as specified in S02

Status: Accepted · Date: 2026-10-18 · Amends [0005](0005-identity-and-access.md); details [0021](0021-sync-engine-confirmed-by-spike-a.md) for identity

## Context
ADR 0005 registers a device to one tenant and branch and leaves the offline session window, the PIN rules and the permission model to the identity spec. ADR 0021 asks the identity spec for the per-user command proof and leaves the revoked device's pending commands to the owner (Q14). The S02 interview (owner, 2026-10-18) settled them, and one answer changes ADR 0005: a doctor's own computer may serve several clinics.

## Decision
- **Installations and devices:** an installation of the clinic app may be registered to several tenants. Each registration is a separate device (one tenant, one branch) with its own Ed25519 device key, member enrollments, local data and, from S04, its own encrypted database and key slots. The server never links two registrations of the same installation. An installation never holds two registrations to the same tenant. The clinic system is the desktop app only in V1; there is no web version.
- **Members on a device:** a member enrolls on a device online with phone, password and a WhatsApp OTP, then chooses a six-digit PIN that unlocks a per-user Ed25519 key wrapped by Argon2id and Electron `safeStorage` (ADR 0021). The device token identifies the device; the user key proves the member, online for sessions and, from S04, on every command.
- **Offline window and locks:** the PIN works offline for 7 days after the server last confirmed the member's enrollment on that device; setting the clock back never extends it. Five wrong PINs disable the member's PIN on that device until an online password sign-in. The app locks after an idle time the owner sets (5–60 minutes, default 15).
- **Permissions:** role presets are code in `packages/contracts`; the owner adjusts permissions per member (grants and revocations) within limits fixed in the catalog. Clinical writes are limited to the doctor role; clinical reads to doctors, nurses (summary by default) and owners (read-only, every read audited); reception and accountants never hold clinical permissions. A tenant has one or more owners and never zero. A doctor reads every patient of their branches unless the owner switches the tenant to "own patients" with break-glass for others.
- **Staff password reset:** an owner authorizes it and the person sets the new password through a WhatsApp OTP; an owner recovers through Vertex support. A reset in one clinic never removes the person's access to another.
- **Revoked and deactivated (answers Q14):** a revoked device's pending commands are uploaded to a quarantine and nothing is applied until an owner accepts (run as a late command) or rejects each one with a reason. A deactivated member's pending commands on a device that is still active are accepted when created before the deactivation with an acceptable clock skew, and quarantined otherwise.
- **Console:** platform users (`admin`, `support`) sign in with phone, password and mandatory TOTP, with single-use recovery codes, TOTP re-authentication for sensitive actions, and an audit row for every console request.

## Consequences
- S04 builds one local database per registration, the quarantine and its owner review, the per-command user proof check and the deactivated-member rule; it also decides how a forgotten PIN recovers local data on a device with no other member (S02 open question).
- `docs/architecture.md` lists the identity and access tables of S02; roles and role permissions are code, not tables.
- The rest of ADR 0005 stands.
