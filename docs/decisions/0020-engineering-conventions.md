# 0020 — Engineering conventions: layout, module anatomy, data, errors, tests

Status: Accepted (details completed with the Phase 0 scaffold) · Date: 2026-10-09

## Context
Many sessions build many modules (ADR 0019). Without one written shape each session invents its own and the codebase drifts. Rules a machine can check are enforced by tests or lint. These conventions follow the ones proven in Vertex Hub and Vertex Digital, adapted to a multi-tenant, offline-first health system. The Phase 0 scaffold completes this record with exact paths and the first module as the pattern to copy.

## Decision

### Layout
- `apps/api/src/`: `core/` (config, database and tenant context, access and entitlement decorators, errors, events and outbox, SSE, rate limits), `modules/<layer>/<module>/` (layers `platform`, `health`, `clinic`, ADR 0001), `cli/`.
- `apps/worker/src/jobs/<area>/<name>.job.ts`: one file per queue. `apps/whatsapp-gateway/src/`: `transport/`, `sessions/`, `sending/`.
- Front ends: thin routes; `features/<area>/` hold components, queries and forms of one area; app-wide `components/` and `lib/`.
- `packages/contracts/src/<module>.ts`, `packages/db/src/schema/<module>.ts`, `packages/sync/src/commands/<module>.ts`: one file per owning module.

### Module anatomy (API)
- `<module>.module.ts`, `<module>.controller.ts`, `<module>.console.controller.ts` (platform staff routes under `/api/console/`), `<module>.service.ts`, `<module>.commands.ts` (sync command handlers), `index.ts` as the public surface. Kebab-case files with a role suffix.
- No repository layer: services query Drizzle directly, only on tables the module owns.

### Access
- Every route and sync command declares its access (`@Public()`, `@PatientRoute()`, `@StaffRoute(permission)`, `@ConsoleRoute(permission)`) and its entitlement (`@RequiresFeature(key)`). A route or command without them fails the architecture test.

### Contracts
- Schemas `<thing>Schema`, types `Thing = z.infer<…>`, inputs `create<Thing>Schema`; every API schema has a stable `.meta({ id })`.
- Contracts hold shapes and pure rules only (money math, state transitions, queue estimates, matching normalization): no I/O, fully unit-tested.

### Data
- Business table: UUIDv7 `id`, `tenant_id` for tenant data, fields, `created_at`, `updated_at`, `archived_at`. Append-only tables (audit, payments, clinical versions, outbox) have no `updated_at` or `archived_at` and refuse `UPDATE`/`DELETE`.
- RLS policy, forced, on every table with `tenant_id`; indexes start with `tenant_id`; every foreign key indexed; `timestamptz` in UTC, displayed in `Asia/Damascus`; no floating-point columns; money per ADR 0014.
- Unique indexes for idempotency keys, command ids and external references: the database is the last line against duplicates.
- Migrations are generated and never edited; hand-written SQL (RLS policies, triggers, grants, backfills) goes in custom migrations; expand, then contract.
- Multi-row changes run in one transaction with their audit entry and outbox event.

### Errors
- Errors the UI must tell apart carry a stable code (`SLOT_TAKEN`, `POOL_EXHAUSTED`, `NOT_ENTITLED`, `TENANT_SUSPENDED`…) defined in `packages/contracts`; server messages are English for logs; front ends show the Arabic translation of the code.

### Lists
- `page`, `pageSize` (default 50, max 100), `sort`, `order`, named filters, validated by a contract schema; responses `{ items, total, page, pageSize }`.

### Front ends
- Arabic text through i18n only; logical CSS only; tokens and components from the design system; loading, empty, error and offline states on every screen.
- Clinic app: reads from the local database; writes through sync commands; server state for online-only screens through TanStack Query.

### Tests
- Unit tests next to the code. API integration tests over HTTP against a test database: every endpoint covers success, 401, 403, another tenant's records, and a missing entitlement.
- Sync tests: offline commands applied late, duplicates, conflicts (two channels booking the same capacity), clock skew, protocol version mismatch.
- Clinical tests: append-only versions, snapshots, audit of reads.
- UI changes add or update Playwright RTL screenshots (light and dark).
- Test data is synthetic, unique per run and removed after the run.

### Enforcement
| Rule | Enforced by |
|---|---|
| Module boundaries, layer direction, access and entitlement declarations | API architecture test |
| RLS on tenant tables, UUIDv7, timestamps, no floats, indexed foreign keys, append-only triggers | `packages/db` convention test |
| Logical CSS, tokens only | `packages/ui` convention test |
| Migrations match the schema | CI drift check |
| No secrets | gitleaks in CI |
| Formatting and lint | Biome in CI and a Claude Code hook on every edit |
| Everything else in this record | `reviewer` subagent |

## Consequences
- New modules look the same, so a session learns the pattern from one module and applies it everywhere.
- Moving a rule from review into a test is always welcome; changing a rule needs a new record.
