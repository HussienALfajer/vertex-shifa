# TASKS — Phase 0 worker skeleton

Branch `feat/worker-skeleton`. Third of three PRs for the API and worker part of "App skeletons" (after `feat/api-skeleton` and `feat/outbox-jobs-role`). Adds `apps/worker` (NestJS, ADR 0020 layout `src/jobs/<area>/<name>.job.ts`) with pg-boss and the outbox dispatcher (ADR 0001, 0002, 0004, 0012).

Design:
- **pg-boss role `shifa_queue`** (new, `DATABASE_QUEUE_URL`): `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION NOCREATEDB NOINHERIT`, no memberships, no privilege on any `public` table. pg-boss runs under it, never under `shifa_jobs`, and owns what it installs in schema `pgboss`. pg-boss 12 creates partitions and migrates its own schema at start, so its tables are not Drizzle's: Drizzle only creates the schema.
- **Schema `pgboss`** (custom migration, owner): created by the owner role, `USAGE, CREATE` to `shifa_queue` (pg-boss runs with `createSchema: false`, so it needs no database-level `CREATE`), `USAGE` to `shifa_jobs`, nothing to the app role or `PUBLIC`.
- **Pending index** (generated migration): `outbox_events_pending_idx` on `(id) WHERE dispatched_at IS NULL`, for the cross-tenant claim in id (time) order. It cannot start with `tenant_id`: a named convention-test exception, allowed only on tables the jobs role claims from.
- **Hand-off in the claim's transaction:** the dispatcher connects as `shifa_jobs`, claims a batch of events whose type has a subscribed queue with `FOR UPDATE SKIP LOCKED` (others stay pending, never claimed without a job), and publishes each event to pg-boss through `fromDrizzle(tx, sql)` in the same transaction: an event is claimed if and only if its jobs exist. Job id = event id (pg-boss key `(name, id)`), data `{ tenantId, type, payload }` (ids and codes only, ADR 0016). Subscriptions are read by pg-boss on its own connection.
- **Jobs role inside `pgboss`:** after `boss.start()` the worker, as the owner of pg-boss's tables, grants `shifa_jobs` exactly `SELECT (event)` on `pgboss.subscription`, `SELECT` on `pgboss.queue` and `INSERT, SELECT (id)` on `pgboss.job_common` (the shared job table every queue uses; queues with their own partition are not allowed). The worker test pins these privileges. The jobs role logs statements without parameter values (`log_parameter_max_length = 0`, from the review), so payloads stay out of the server log.
- **Convention test exceptions:** schema `pgboss` is left out of the table scan (pg-boss's tables, checked by the worker test); a schema check pins the schemas and their privileges; the pending index exception; `shifa_queue` in the role checks.

Checklist:
- [x] `/db-migration`: schema `outbox_events` pending index (generated) and custom migration for schema `pgboss` with its grants
- [x] `packages/db`: `setup-local.ts` creates `shifa_queue`; `testing.ts` `queueUrl`; `.env.example`, CI env, `turbo.json` pass-through: `DATABASE_QUEUE_URL`
- [x] Convention test: `pgboss` exception and schema privileges, pending index exception, queue role attributes, memberships, no `public` privileges
- [x] Move `describeForLog` from `apps/api` to `@vertex-shifa/db` so the worker logs failures the same way
- [x] `apps/worker`: package, tsconfig, vitest config, `CLAUDE.md`; `main.ts` (application context, shutdown hooks); `WorkerModule.forRoot(config, jobs)`
- [x] `src/core/config`: `DATABASE_QUEUE_URL`, `DATABASE_JOBS_URL`, checked by Zod
- [x] `src/core/queue`: pg-boss as `shifa_queue` in `pgboss`, jobs-role grants, `QueueJob` registration (queue, events, work), stop on shutdown
- [x] `src/core/outbox`: the jobs-role database and `OutboxDispatcher` (claim with `SKIP LOCKED`, publish in the same transaction, poll loop, graceful stop)
- [x] `src/jobs/index.ts`: the list of queues (empty until the first job)
- [x] Tests: end to end through a test job; unsubscribed events claimed without jobs; a failed hand-off leaves the event pending; concurrent dispatchers claim disjoint events; claim uses the pending index; jobs-role and queue-role privileges in `pgboss`; restart is idempotent; config
- [x] No drift: `pnpm db:generate` reports nothing
- [x] Docs: `packages/db/CLAUDE.md`, `apps/api/CLAUDE.md`, `apps/worker/CLAUDE.md`, `docs/architecture.md`, `AGENTS.md` commands, `docs/ROADMAP.md`
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
