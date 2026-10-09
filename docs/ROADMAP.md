# Roadmap

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done. Feature IDs refer to `docs/product/v1-scope.md`. Work is grouped into specs (S01–S23): one spec, one `/spec` session. Production is deployed once at the end of each phase (`docs/workflow.md`).

## Phase 0 — Foundation
- [x] Product vision and V1 scope, decisions 0001–0020, glossary, working method, Claude Code setup (subagents `checker`, `reviewer`, `explorer`; skills `spec`, `feature-slice`, `db-migration`)
- [ ] Spike A — offline sync: PowerSync self-hosted, Electron + SQLite, a booking made offline on two sides, server re-execution, conflict recorded → confirm or amend ADR 0008
- [ ] Spike B — WhatsApp gateway: Baileys maintenance status, QR link, send, receive, reconnect after restart, OTP round trip, rate limits; push delivery to a phone in Syria → confirm or amend ADR 0012, 0003
- [ ] Monorepo scaffold: pnpm, Turborepo, TypeScript, Biome and its Claude Code hook, `packages/config`, check record script, CI (typecheck, lint, test, build, gitleaks, migration drift), folder `CLAUDE.md` files
- [ ] `packages/db`: Drizzle, owner and app roles, tenant context, RLS convention test, audit and outbox tables; `packages/contracts`: money, error codes, Arabic name normalization, with full unit tests
- [ ] App skeletons: api (health, access decorators, architecture test), worker (pg-boss, outbox dispatcher), whatsapp-gateway (transport interface, fake transport), clinic (Vite + Electron shell, RTL), console, site, patient (Expo, RTL)
- [ ] Brand and design system: `brand/` from Vertex Hub with the SHIFA logo, `packages/tokens`, `packages/ui` copied and adapted, `packages/ui-native` base (ADR 0018)
- [ ] Deploy skeleton (needs Q1)

## Phase 1 — Platform core
- [ ] S01 Tenancy and clinic setup: F01
- [ ] S02 Identity, access and devices: F02 · F03 · F40 (fake WhatsApp transport until S03)
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
- [ ] S22 Tenants, catalog, quotes, contracts, billing and support access: F32 · F33 · F35 · F39
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
