# Decision records

Short records of decisions that shape the system. Each has a status: **Accepted**, **Superseded by NNNN**, or **Proposed**. To change a decision, add a new record that supersedes the old one; don't rewrite history. Records 0001–0020 come from the owner's analysis sessions of 2026-10-08 and 2026-10-09.

| # | Decision | Status |
|---|---|---|
| [0001](0001-platform-architecture.md) | Modular monolith: platform core, shared health domain, products as modules; versioned events through an outbox | Accepted |
| [0002](0002-stack-and-repository.md) | TypeScript everywhere in one pnpm + Turborepo monorepo: NestJS, Drizzle, PostgreSQL 17, Zod, Electron, Next.js, Expo | Accepted |
| [0003](0003-patient-app-react-native-expo.md) | Patient app in React Native with Expo, on both stores, no PWA | Accepted |
| [0004](0004-tenancy-and-data-isolation.md) | One organization hierarchy; PostgreSQL row-level security; a silo option per tenant | Accepted |
| [0005](0005-identity-and-access.md) | One account per person with roles in many tenants; devices and offline PIN; no email or SMS | Accepted |
| [0006](0006-patient-identity-and-consent.md) | Platform person, a chart per clinic, patient index with Arabic matching, family links, consent | Accepted |
| [0007](0007-clinical-data-and-terminologies.md) | FHIR-aligned relational model; ICD-10, LOINC, ATC, UCUM; append-only records with snapshots | Accepted |
| [0008](0008-offline-first-clinic-and-sync.md) | Offline-first clinic app: local SQLite, commands validated by the server, PowerSync candidate (Spike A) | Accepted |
| [0009](0009-scheduling-queues-and-channel-capacity.md) | Timed slots and queue sessions; capacity pools per channel; offline policies; conflict inbox | Accepted |
| [0010](0010-templates-specialties-and-custom-fields.md) | Versioned templates with inheritance; general and dental packs in V1; bounded custom fields | Accepted |
| [0011](0011-medication-catalog.md) | One platform medication catalog from official Syrian and Turkish sources and reviewed clinic suggestions | Accepted |
| [0012](0012-messaging-whatsapp-and-push.md) | Push and WhatsApp only; our WhatsApp gateway (Baileys, Spike B); clinic QR sessions; WhatsApp OTP | Accepted |
| [0013](0013-commercial-model-and-entitlements.md) | Catalog, packages as presets, a contract per customer, derived entitlements, never lock medical data | Accepted |
| [0014](0014-money-and-currencies.md) | Integer units per currency (USD, TRY, SYP), stored rates, append-only payments, cash sessions | Accepted |
| [0015](0015-public-sites-and-custom-domains.md) | Clinic subdomains and custom domains with automatic TLS, without Cloudflare | Accepted |
| [0016](0016-security-privacy-and-audit.md) | Encryption, audit of every medical-record read, minimum exposure, public-repo rules | Accepted |
| [0017](0017-deployment-and-hosting.md) | Provider-independent deployment; PM2 and containers behind one gateway; provider open (Q1) | Accepted |
| [0018](0018-brand-and-design-system.md) | The Vertex Hub identity and logo with SHIFA; components copied and adapted; "Vertex" always visible | Accepted |
| [0019](0019-ai-assisted-development.md) | Claude Code (Opus 5.5) as the primary developer: files as memory, skills, subagents, enforcement | Accepted |
| [0020](0020-engineering-conventions.md) | Engineering conventions: layout, module anatomy, access, data, errors, tests, enforcement | Accepted |

Template:

```markdown
# NNNN — Title
Status: Proposed | Accepted | Superseded by NNNN · Date: YYYY-MM-DD
## Context
## Decision
## Consequences
```
