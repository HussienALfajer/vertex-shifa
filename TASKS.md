# TASKS — Phase 0 `packages/db` and `packages/contracts`

Branch `feat/db-contracts-foundation`. One PR: the database package (roles, tenant context, RLS convention test, audit and outbox tables), the contracts package (money, error codes, Arabic name normalization), the local PostgreSQL 17 setup script and the CI database steps.

- [x] `packages/contracts`: money (USD, TRY, SYP; safe-integer minor units, arithmetic, conversion with a stated rate, parse and format), error codes with HTTP status and the error response schema, Arabic name normalization (ADR 0006); unit tests; `CLAUDE.md`
- [x] `packages/db`: Drizzle with node-postgres, column helpers (UUIDv7 id with a database check, timestamps, tenant id), table registry (owner module and kind), `withTenant` (per-transaction `app.tenant_id`), `CLAUDE.md`
- [x] `/db-migration`: `audit_entries` (append-only, refuses `UPDATE`/`DELETE`/`TRUNCATE`) and `outbox_events` (work queue); generated migration plus a custom migration with forced RLS, policies, triggers and grants
- [x] Tests against a fresh database per run: migrations, convention test (registry, ids, timestamps, no floats, indexed foreign keys, forced RLS, append-only triggers and grants, app role cannot bypass RLS), tenant isolation and context leaks, append-only as app role and owner
- [x] Local PostgreSQL 17 setup script (`pnpm db:setup-local`): owner and app roles, the dev database; `.env.example`
- [x] Root scripts `db:generate`, `db:migrate`, `db:setup-local`; turbo passes the database URLs to tests
- [x] CI: PostgreSQL 17 service, database setup, migration drift step without the guard; `.github/CLAUDE.md`
- [x] Docs: commands table in `AGENTS.md`, `docs/architecture.md`, `docs/ROADMAP.md` (this item and the GitHub settings line)
