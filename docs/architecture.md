# Architecture

The map of the system. Decisions and their reasons live in `docs/decisions/`; this file shows how the parts fit. Paths marked *(Phase 0)* arrive with their Phase 0 roadmap item.

## Layers (ADR 0001)

```
┌──────────────────────────────────────────────────────────────────────┐
│ CLIENTS  clinic (Electron, offline-first) · patient (Expo) ·         │
│          site (Next.js, public pages) · console (platform staff)     │
├──────────────────────────────────────────────────────────────────────┤
│ API  apps/api (NestJS): REST + SSE, sync command endpoint, OpenAPI   │
│      tenant context · access · entitlements on every route/command   │
├──────────────────────────────────────────────────────────────────────┤
│ PRODUCTS     clinic  (later: lab · pharmacy · hospital)              │
├──────────────────────────────────────────────────────────────────────┤
│ HEALTH       people · patient-index · practitioners · scheduling ·   │
│              clinical · orders · medications · consent · terminology │
├──────────────────────────────────────────────────────────────────────┤
│ PLATFORM     identity · tenancy · access · entitlements · commercial │
│              config (templates, custom fields) · messaging · files · │
│              audit · domains · sync                                  │
├──────────────────────────────────────────────────────────────────────┤
│ WORKERS  apps/worker (jobs, outbox dispatch, imports, reminders)     │
│          apps/whatsapp-gateway (sessions, sending, receipts)         │
├──────────────────────────────────────────────────────────────────────┤
│ DATA  PostgreSQL 17 (RLS) · sync service · S3-compatible storage     │
└──────────────────────────────────────────────────────────────────────┘
```

A module depends only on modules in its own layer or below, through their `index.ts` or their events.

## Repository layout

```
apps/
  api/                NestJS API: core/, modules/<platform|health|clinic>/<module>/ (exists)
  worker/             NestJS jobs: jobs/<area>/<name>.job.ts
  whatsapp-gateway/   WhatsApp transport, sessions, sending
  clinic/             React + Vite + TanStack; electron/ shell; local SQLite + sync client
  console/            React + Vite + TanStack; platform back office
  site/               Next.js; clinic public pages, subdomains and custom domains
  patient/            React Native + Expo
packages/
  contracts/          Zod schemas, error codes, state tables, money and matching rules (exists)
  db/                 Drizzle schema, migrations, RLS policies, shared write paths (exists)
  sync/               command definitions, sync rules, conflict policies
  tokens/             design tokens (web and native)
  ui/                 web components (from Vertex Hub, adapted)
  ui-native/          React Native components
  i18n/               Arabic catalog
  config/             TypeScript, Biome and test presets (exists)
scripts/              repository scripts (check record) (exists)
.github/              CI and Dependabot (exists)
brand/                identity, logo files (brand phase)
deploy/               server configuration and release scripts
docs/                 product, decisions, specs, roadmap, workflow
```

## Module map

| Layer | Module | Owns (main tables) | Notes |
|---|---|---|---|
| platform | identity | accounts, sessions, devices, otp_challenges | ADR 0005 |
| platform | tenancy | tenants, facilities, units, tenant_catalog | ADR 0004 |
| platform | access | roles, role_permissions, staff_memberships | ADR 0005 |
| platform | commercial | catalog_items, packages, quotes, contracts, contract_items, platform_invoices, platform_payments | ADR 0013, 0014 |
| platform | entitlements | entitlement_overrides, resolved cache | ADR 0013 |
| platform | config | templates, template_versions, custom_field_definitions | ADR 0010 |
| platform | messaging | message_templates, messages, whatsapp_sessions (with lease), send_counters, known_recipients, whatsapp_lid_map, push_tokens (Expo and native), opt_outs | ADR 0012, 0022 |
| platform | files | files, attachments | ADR 0016 |
| platform | audit | audit_entries (append-only) | ADR 0016 |
| platform | events | outbox_events (work queue) | ADR 0012, 0020 |
| platform | domains | domains, certificates | ADR 0015 |
| platform | sync | device_sync_state, number_ranges, command_log (append-only), replication scopes | ADR 0008 |
| health | people | persons, related_persons | ADR 0006 |
| health | patient-index | patient_charts, person_chart_links, match_candidates | ADR 0006 |
| health | practitioners | practitioners, practitioner_roles | ADR 0004 |
| health | scheduling | schedules, sessions, slots, capacity_pools, appointments, queue_tickets, conflicts | ADR 0009 |
| health | clinical | encounters, notes and versions, observations, conditions, allergies, documents | ADR 0007 |
| health | orders | service_requests, results | ADR 0007 |
| health | medications | substances, products, medication_suggestions, prescriptions | ADR 0011 |
| health | consent | consents, shares | ADR 0006 |
| health | terminology | code_systems, codes (ICD-10, LOINC, ATC, UCUM) | ADR 0007 |
| clinic | reception | queue board state, waiting-room displays | ADR 0009 |
| clinic | billing | invoices, invoice_lines, payments, cash_sessions, expenses, exchange_rates | ADR 0014 |
| clinic | dental | odontogram entries, treatment_plans | ADR 0010 |
| clinic | reports | read models | — |

Table names are indicative; each spec fixes them.

## Key flows

**Offline booking (ADR 0008, 0009):** reception books on its device → `BookAppointment` command queued locally → on reconnect, the API re-runs it against the reception pool → accepted, or a conflict recorded with alternatives → the result streams back to every device of the clinic → the patient is notified through the outbox.

**Notification (ADR 0012):** a state change writes an outbox event → the worker builds the message from the template → push to the patient's devices and/or a WhatsApp job → the gateway sends through the clinic's session within rate limits → receipts update the message.

**Patient link (ADR 0006):** the patient verifies their phone by WhatsApp OTP → the patient index proposes charts with the same phone and matching names → the patient confirms → shared items of those charts appear in the app.

## Data conventions

UUIDv7 ids (checked by the database), `tenant_id` with forced RLS on tenant data (one policy per table against `current_tenant_id()`, set per transaction by `withTenant`; roles `shifa_owner` and `shifa_app`, neither bypassing RLS), `timestamptz` in UTC displayed in `Asia/Damascus`, integer money with currency, append-only clinical, payment and audit data, archive instead of delete. Full rules: ADR 0020.

## Deployment

Provider-independent; one gateway, apps on `127.0.0.1`, PostgreSQL, the sync service, object storage, off-server backups. Provider and domain: Q1. Details: ADR 0017 and `deploy/` *(Phase 0)*.
