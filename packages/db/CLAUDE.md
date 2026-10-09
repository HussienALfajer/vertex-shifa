# packages/db

Drizzle schema, migrations, RLS policies and the tenant context (ADR 0004, ADR 0020). PostgreSQL 17, node-postgres driver, snake_case columns from camelCase properties.

## Layout
- `src/schema/<module>.ts`: one file per owning module, exported from `schema/index.ts`. Pattern to copy: `schema/audit.ts` (append-only) or `schema/events.ts` (work queue).
- `src/schema/columns.ts`: the shared column helpers (`id`, `idIsUuidV7`, `tenantId`, `timestamptz`, `createdAt`, `updatedAt`). `archivedAt` arrives with the first business table.
- `src/schema/registry.ts`: every table with its owning module, scope (`tenant`, `platform`) and kind (`business`, `append-only`, `queue`).
- `src/client.ts`: `createDatabase(url)`. `src/tenant-context.ts`: `withTenant(db, tenantId, work)`.
- `migrations/`: generated SQL plus custom migrations (RLS, triggers, grants, backfills). Never read or edit `migrations/meta/`.
- `scripts/setup-local.ts`: the local PostgreSQL setup (`pnpm db:setup-local`).
- `src/testing.ts` (`@vertex-shifa/db/testing`): `createTestDatabase()`, a fresh migrated database for one test run, used by this package's and the apps' test global setups.
- `test/`: run against a fresh database per run (`test/global-setup.ts`); `conventions.test.ts` reads the rules below from the migrated database.

## Roles
- `shifa_owner` runs migrations and owns every table. It cannot bypass RLS either: with forced RLS it sees tenant rows only inside `withTenant`. Locally it may create databases, for the test runs.
- `shifa_app` is what the apps connect as: no `BYPASSRLS`, only the privileges each table's custom migration grants.
- `shifa_jobs` is the audited platform-jobs role (ADR 0004) for the worker's cross-tenant jobs. It has no `BYPASSRLS`: it reaches across tenants only through policies of its own (`TO shifa_jobs`) on the tables granted to it, so a stray grant still shows no tenant rows. Today: `SELECT` and `UPDATE (dispatched_at, updated_at)` on `outbox_events`, to read and claim events. Audited by `log_statement = 'all'` on the role, so every statement it runs is in the server log; only a superuser can change it. Its statements carry ids and timestamps only. A new grant to it is listed in `JOBS_ACCESS` in `conventions.test.ts`, which fails on anything else.
- All three exist before the first migration (cluster-wide, created by `pnpm db:setup-local`; on servers by `deploy/`, which must also set the jobs role's `log_statement`). The sync-service replication role (ADR 0021) arrives with S04.

## Rules
- Changes go through `/db-migration`. Never `drizzle-kit push`, never edit a generated migration; commit the schema and its migration together; expand, then contract.
- Every table: in the `public` schema; UUIDv7 `id` with `idIsUuidV7`, `created_at`; a `tableRegistry` entry; no `real`, `double precision`, `money` or zoneless `timestamp` column; every foreign key indexed. The app role never gets `TRUNCATE` (it ignores RLS), `TRIGGER` or `REFERENCES`, nor `DELETE` on business tables (archive instead).
- Tenant tables (scope `tenant`): `tenant_id` not null, secondary indexes start with it; foreign keys between tenant tables are composite, `(tenant_id, x_id) → (tenant_id, id)` with `unique (tenant_id, id)` on the parent, because PostgreSQL checks foreign keys without RLS and a plain key would accept another tenant's id; the custom migration enables and forces RLS and creates the one permissive policy `tenant_isolation` with `USING` and `WITH CHECK (tenant_id = current_tenant_id())`, revokes `PUBLIC` and grants the app role what it needs.
- `current_tenant_id()` reads only the transaction setting: no fallback, no `SECURITY DEFINER`; the convention test pins its body. Never disable a `refuse_change` trigger.
- Tenant data is read and written only inside `withTenant`, with the tenant from the authenticated session or device token, never from client input. Outside it the app role sees no tenant rows and cannot insert any.
- Append-only tables: no `updated_at` or `archived_at`; triggers with `refuse_change()` refuse `UPDATE`, `DELETE` and `TRUNCATE` for every role; the app role gets `SELECT, INSERT` only.
- `outbox_events`: the API adds events in its tenant's transaction; the only change allowed afterwards, for every role, is the claim that sets `dispatched_at` once (trigger `outbox_events_claim_only`).
- Audit entries and outbox payloads hold ids and codes, never medical content (ADR 0016).

## Local database
1. PostgreSQL 17 running locally (the Windows installer or `docker run -p 5432:5432 -e POSTGRES_PASSWORD=… postgres:17`).
2. Copy `.env.example` to `.env` at the repository root and set the four URLs: a superuser of your server for `DATABASE_ADMIN_URL`, passwords of your choice for the three roles.
3. `pnpm db:setup-local` (creates or updates the roles and the `vertex_shifa` database; never drops anything), then `pnpm db:migrate`.

The tests need only the owner, app and jobs URLs: each run creates `shifa_test_<time>_<random>`, migrates it and drops it.

Run: `pnpm --filter @vertex-shifa/db test`.
