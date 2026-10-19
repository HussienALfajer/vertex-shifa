# Roadmap

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done. Feature IDs refer to `docs/product/v1-scope.md`. Work is grouped into specs (S01–S23): one spec, one `/spec` session. Production is deployed once at the end of each phase (`docs/workflow.md`).

## Phase 0 — Foundation
- [x] Product vision and V1 scope, decisions 0001–0020, glossary, working method, Claude Code setup (subagents `checker`, `reviewer`, `explorer`; skills `spec`, `feature-slice`, `db-migration`)
- [x] Spike A — offline sync: PowerSync self-hosted, Electron + SQLite, a booking made offline on two sides (cloud vs reception, and two offline reception devices), server re-execution, conflict recorded, encrypted local database, a local read-audit command uploaded on reconnect → confirm or amend ADR 0008. Done: PowerSync confirmed with amendments (ADR 0021, `docs/spikes/A-offline-sync.md`)
- [x] Spike B — WhatsApp gateway: Baileys maintenance status, QR link, send, receive, reconnect after restart, OTP round trip, rate limits; push delivery to a phone in Syria → confirm or amend ADR 0012, 0003. Done: Baileys and Expo push confirmed with amendments (ADR 0022, `docs/spikes/B-whatsapp-gateway.md`)
- [x] Monorepo scaffold: pnpm, Turborepo, TypeScript, Biome and its Claude Code hook, `packages/config`, check record script, CI (typecheck, lint, test, build, gitleaks, migration drift), folder `CLAUDE.md` files
- [x] GitHub settings with the owner's approval: auto-merge allowed, merge commits only, `main` protected with required CI checks (needed by "Finishing a task" in `AGENTS.md`)
- [x] `packages/db`: Drizzle, owner and app roles, tenant context, RLS convention test, audit and outbox tables; `packages/contracts`: money, error codes, Arabic name normalization, with full unit tests. Done: local setup script, CI PostgreSQL service and migration drift step
- [x] App skeletons: api (health, access decorators, architecture test), worker (pg-boss, outbox dispatcher), whatsapp-gateway (transport interface, fake transport), clinic (Vite + Electron shell, RTL), console, site, patient (Expo, RTL). Done: api (also the core database module, error mapping, OpenAPI from the contracts with a drift test); the audited platform-jobs role `shifa_jobs` that claims `outbox_events` across tenants; worker (pg-boss as the queue role `shifa_queue` in schema `pgboss`, the outbox dispatcher claiming with `SKIP LOCKED` and handing events to pg-boss in the same transaction, queue registration); whatsapp-gateway (the `WhatsAppTransport` interface and a fake transport, sessions applying ADR 0022's disconnect table with backoff, sending through connected sessions only, a transport-boundary test); clinic (React + Vite + TanStack Router renderer, Arabic RTL through `packages/i18n` with Latin digits, logical-CSS test; Electron main process with a sandboxed window, the `app://clinic/` protocol with a strict CSP, navigation and permissions refused; Playwright RTL screenshots light and dark in CI); console (React + Vite + TanStack Router web app, Arabic RTL through the `console` namespace of `packages/i18n`, errors logged by name only, logical-CSS test, Playwright RTL screenshots light and dark); site (Next.js App Router, server components, Arabic RTL through the `site` namespace of `packages/i18n`, errors logged by name only on the server and in the browser, logical-CSS test, Playwright RTL screenshots light and dark); patient (Expo SDK 57 + Expo Router, RTL forced at start through the app config and `I18nManager`, the `patient` namespace of `packages/i18n`, errors logged by name only including uncaught ones, logical-style test, Android, iOS and web bundles exported by `build`, Playwright RTL screenshots light and dark of the test-only web export)
- [x] Brand and design system: `brand/` from Vertex Hub with the SHIFA logo, `packages/tokens`, `packages/ui` copied and adapted, `packages/ui-native` base (ADR 0018). Done: `brand/` (identity adapted, the logo with SHIFA set in Montserrat Medium in place of MEDIA, color variants, favicon, app icons); `packages/tokens` (palette, semantic roles light and dark, scales, pinned to the identity and its contrast ratios); `packages/ui` (Vertex Hub's Tailwind CSS v4 theme and Base UI components, dark theme from the system setting, client components for Next.js, `VertexShifaLogo`/`VertexShifaMark`, the convention test over the web apps); `packages/ui-native` (theme provider, `Button`, `Card`, the convention test over the patient app); clinic, console, site and patient moved onto them with new RTL screenshots light and dark
- [ ] Deploy skeleton (needs Q1)

## Phase 1 — Platform core
- [x] S01 Tenancy and clinic setup: F01 (spec `docs/specs/S01-tenancy-and-clinic-setup.md`). Done: contracts, database with RLS, API module and tenant CLI; the web map component and the clinic CSP; the clinic's first online-only screens (onboarding wizard, clinic settings, location or branch list and branch settings, directory status, read-only banner) on a generated OpenAPI client and TanStack Query, with E2E against a mocked API. The owner's checks after S02 sign-in remain (spec "Acceptance")
- [x] UX foundations (owner, 2026-10-18, before S02; ADR 0018 amended): Vertex Hub's theme toggle (one light/dark button, the system's setting until pressed) applied before the first paint in every app; `Form` (Enter between fields, Shift+Enter back, primary action on the last field), `useDraft` (Save waits for a change, Discard changes), unsaved-changes dialog with the router blocker, `beforeunload` and the Electron close question; save feedback as a toast and progress on the button, fields locked without moving; segmented wizard `Stepper`; `PageContainer` and back actions, Alt+Left / Alt+Right in the clinic; Arabic and Latin fonts preloaded with `font-display: block` on desktop. Applied to the S01 clinic screens, the console, the site and the patient app
- [x] S02 Identity, access and devices: F02 · F03 · F40 (spec `docs/specs/S02-identity-access-and-devices.md`; fake WhatsApp transport until S03; records the practitioner's gender for the F25 filter; adds the HTTP access tests of the S01 routes). In seven PRs. Done: PR 1, contracts (permission catalog and role presets, password, PIN, OTP and offline-window rules, memberships, practitioners, console roles) and database (identity, access and practitioner tables with RLS, the platform audit, the specialties seed); PR 2, API sign-in (proof of work, password with lock, OTPs with ADR 0022's limits behind the fake sender, single-use tickets), computer registration, device tokens, enrollments, staff sessions and the JWKS, the session guard replacing the fail-closed staff branch, the first owner's invitation with `tenant:create`, owner recovery commands, `FACILITY_HAS_DEVICES`, and the HTTP access tests of every S01 route; PR 3, API staff management (invitations with the outbox event, resend, cancel, access changes with `LAST_OWNER` and the permission limits, deactivation ending sessions and enrollments, owner-authorized password reset), doctor profiles with specialties and re-encoded photos, device management (list, rename, revoke, remove a member) and the clinic security settings; PR 4, API console identity (platform users with one-time setup codes, password and mandatory TOTP with replay refusal, ten single-use recovery codes, cookie sessions with idle and absolute expiry and the `Origin` check, re-authentication for sensitive actions including the S01 tenant status and directory routes, `LAST_ADMIN`, a platform audit row for every console request, owner recovery routes, `platform-user:create` and `platform-user:reset`); PR 5, the clinic app's identity (Ed25519 device and user keys in the main process, the PIN wrapped by Argon2id and `safeStorage` with its lockout, the 7-day offline window against clock rollback, several clinics on one computer; welcome, first sign-in with the OTP, registering the computer, choosing a PIN, the member picker and lock screen in all its states, the idle lock, the clinic switcher, my account; the wipe on `DEVICE_REVOKED`); PR 6, the clinic's staff list, invitations and member detail with the permission editor, doctor profiles with specialties and photos, devices and security settings; owner decisions of 2026-10-19: owners keep the read permissions, and the doctor role given back restores the previous profile after the owner reviews it; PR 7, the console's sign-in with the setup step (setup code, password, authenticator QR code and confirmation, recovery codes shown once), the TOTP or recovery-code step, the re-authentication dialog before sensitive actions, platform users (create with the setup code shown once, change role, disable, enable, reset) and my account (password, recovery codes left), the cookie session's end handled, and the six-digit `CodeField` shared from `packages/ui`
  - S02 audit follow-up, API side (2026-10-19): tickets, console step tickets and proofs of work used once in PostgreSQL (`used_tokens`), in the transaction of the step they authorize, so a restart or a concurrent request cannot reuse them; a revocation outside the role limits refused (`PERMISSION_NOT_GRANTABLE`); a session opening locked against a deactivation or a device revocation; concurrent password resets set one password; console requests of known sessions that are over, and failed console steps of existing users, written to the platform audit (rule 41, owner 2026-10-19); tests of these races and of RLS with rows in two tenants
  - S02 audit follow-up, clinic main process (2026-10-19): the main process makes the requests whose answers change what a member may do on the computer (registration, enrollment, opening and refreshing the staff session, the password sign-in that re-enables a PIN, the device's members and confirmations) and never takes a session, a confirmation or a success from the renderer; the refresh token stays in the main process and the renderer gets the access token only; the 7-day offline window is enforced during the session (checked every 30 seconds and on wake, on a clock that setting the computer's clock back does not stop) and the renderer is told when it locks; the idle lock runs on a monotonic clock and counts the computer's sleep
  - S02 audit follow-up, clinic password recovery (2026-10-19): "Forgot your password?" on the clinic's password sign-in completes a reset the owner (or Vertex support) authorized (rule 16): phone, proof of work, the `password_reset` OTP with its resend countdown, the new password with the strength rules, then the PIN as any sign-in on the computer; the same answer and words for a phone without an authorization, the texts that send the member to the owner when the authorization ended, and a first sign-in of an account with a password pointed to the right path
  - S02 audit follow-up, E2E reliability (2026-10-19): the web E2E serve their build on a free port locally and never reuse a running server (another worktree's); the clinic E2E captures and measures a screen only once it has settled (no fetch or device call open, layout still), drops the connection only after the lock screen's refresh answered, and its mocked API answers nothing offline; the console E2E captures and measures a screen only once it has settled too, and finds the theme toggle only once the shell is drawn
- [ ] S03 WhatsApp gateway and OTP: platform sessions, OTP delivery, failover (ADR 0012)
- [ ] S04 Sync foundation: F22 (commands, number ranges, sync status, first commands)
- [ ] S05 Entitlements core: F34 (resolver and enforcement; console screens in S22)
- [ ] S06 Audit and export: F23
- [ ] Production deploy of Phase 1 (internal test tenants only)

## Phase 2 — Clinic core
- [ ] S07 Working hours and visit types: F04
- [ ] S08 Patients and Excel import: F09 · F10
- [ ] S09 Appointments and offline policy: F05 · F06
- [ ] S10 Reception, live queue and waiting-room display: F07 · F08
- [ ] Production deploy of Phase 2

## Phase 3 — Clinical
- [ ] S11 Visit record and general template: F11 · F15 (general)
- [ ] S12 Medication catalog and prescriptions: F12 · F38 (catalog and review queue)
- [ ] S13 Requests and medical documents: F13 · F14
- [ ] S14 Dental pack: F15 (dental)
- [ ] S15 Custom fields: F16
- [ ] Production deploy of Phase 3

## Phase 4 — Money and reports
- [ ] S16 Billing, payments, cash sessions and expenses: F17 · F18
- [ ] S17 Reports: F19
- [ ] Production deploy of Phase 4

## Phase 5 — Messaging, patients and public sites
- [ ] S18 Clinic WhatsApp link and patient notifications: F20 · F21
- [ ] S19 Patient app: account, family, discovery, booking, notifications: F24 · F25 · F26 · F29
- [ ] S20 Live queue tracking and my health record: F27 · F28
- [ ] S21 Public clinic pages and custom domains: F30 · F31 · F36
- [ ] Production deploy of Phase 5; patient app submitted to both stores

## Phase 6 — Console
- [ ] S22 Tenants, catalog, quotes, contracts, billing, entitlement and override screens, and support access: F32 · F33 · F34 (console screens) · F35 · F39
- [ ] S23 Monitoring and global templates: F37 · F38 (templates)
- [ ] Production deploy of Phase 6

## Pilot
- [ ] Launch checklist done (below)
- [ ] Two or three clinics in Azaz (one dental), on-site onboarding, daily follow-up
- [ ] Fixes from the pilot, then open sales

## Launch checklist
- [ ] Hosting, platform domain and TLS (Q1)
- [ ] Off-server encrypted backups configured and a restore tested
- [ ] Legal review of Law 12/2024 and health-data retention (Q2); terms and privacy policy published
- [ ] Platform WhatsApp numbers active with failover (Q4)
- [ ] Apple and Google developer accounts; store listings, privacy and health declarations (Q9)
- [ ] Specialty packs and documents reviewed by a medical advisor (Q7)
- [ ] Medication catalog imported from official sources
- [ ] Console accounts with TOTP; monitoring and alerts active
