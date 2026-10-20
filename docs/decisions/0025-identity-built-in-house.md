# 0025 — Identity built in-house on `node:crypto`, without Better Auth

Status: Accepted · Date: 2026-10-20 · Amends [0002](0002-stack-and-repository.md) and [0005](0005-identity-and-access.md)

## Context
ADR 0002 lists Better Auth for sessions, and ADR 0005 says identity uses its phone-number and two-factor capabilities, with devices and the PIN as platform code. S02 was implemented without Better Auth: no package depends on it or on another authentication or JWT library, and every identity primitive is platform code on Node's built-in `crypto`. The full audit of 2026-10-20 (finding DOC-02) found the records out of step with the code.

Most of S02 was always going to be platform code under ADR 0005: computer registration with an Ed25519 device key, per-member enrollments, single-use sign-in tickets, proof of work, WhatsApp OTPs with decoy answers for unknown phones, the offline PIN and the quarantine. What Better Auth would have added (phone OTP, TOTP, cookie sessions) is a small part, and its own tables and session model would sit beside the RLS, audit and UUIDv7 conventions (ADR 0004, 0020) rather than follow them.

## Decision
- Identity is built in-house in `apps/api/src/modules/platform/identity/` and the clinic's Electron main process, on `node:crypto` only:
  - **Signed tokens:** EdDSA JWTs (Ed25519, RFC 7519 and 8037) signed with `IDENTITY_TOKEN_KEY`: staff access tokens, device tokens, sign-in tickets and console step tickets, each kind with its own claims; the public key is published as a JWKS for the sync service (ADR 0021).
  - **Passwords and PIN keys:** Argon2id (`crypto.argon2`), on the server for passwords and in the clinic's main process to wrap the per-user key (ADR 0024).
  - **Compared secrets:** OTP codes, refresh tokens, console session tokens, setup and recovery codes and rate-limit keys are stored as HMAC-SHA-256 keyed hashes under `IDENTITY_HASH_KEY`, each use with its own purpose.
  - **Secrets read back:** console TOTP secrets are sealed with AES-256-GCM under `IDENTITY_ENCRYPTION_KEY`, bound to their row.
  - **TOTP:** RFC 6238 over HOTP (HMAC-SHA-1, 6 digits) with replay refusal by step.
  - **Sessions:** staff sessions, device enrollments and console sessions are tables of `packages/db` under its conventions; their rules are S02's.
- No authentication or JWT library is added. A new one needs a new ADR.

## Consequences
- The project owns the security of these primitives: their tests stay in `apps/api` and `apps/clinic`, and a change to a token format, hash purpose or key is reviewed as security work (the `reviewer` subagent).
- `crypto.argon2` needs Node 24.7 or later; the repository's `engines` field (`>=24`) allows earlier Node 24 releases.
- Each identity key is a single key with no rotation yet (the token header names one `kid`); rotation is open work.
- The rest of ADR 0002 and ADR 0005 stands.
