# TASKS — Phase 0 platform-jobs role

Branch `feat/outbox-jobs-role`. Second of three PRs for the API and worker part of "App skeletons" (after `feat/api-skeleton`, before `feat/worker-skeleton`). The worker's outbox dispatcher reads and claims `outbox_events` across tenants under a separate, audited role (ADR 0004, 0012, 0020, 0021).

Design:
- Role `shifa_jobs`: `LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION NOCREATEDB NOINHERIT`, no memberships. It does not bypass RLS: its cross-tenant reach is a role-scoped policy on each table granted to it, so a grant added by mistake elsewhere still shows no tenant rows.
- Audited: `log_statement = 'all'` set on the role (superuser-only, so a session cannot turn it off); every statement it runs is in the server log. Its statements carry ids and timestamps only (ADR 0016).
- `outbox_events`: `SELECT` and `UPDATE (dispatched_at, updated_at)` for the jobs role; policies `jobs_read` (select, all tenants) and `jobs_claim` (update only undispatched rows, leaving them dispatched). A trigger makes a claim the only change allowed for every role: `dispatched_at` set once, `id`, `tenant_id`, `type`, `payload`, `created_at` never change.

Checklist:
- [x] `packages/db/scripts/setup-local.ts`: the jobs role from `DATABASE_JOBS_URL`, with its attributes and `log_statement`
- [x] `.env.example`, CI env: `DATABASE_JOBS_URL`
- [x] Custom migration: grants, policies, claim-only trigger on `outbox_events`
- [x] `src/testing.ts`: `jobsUrl` in `TestDatabase`; `test/global-setup.ts` and `test/connections.ts` provide it
- [x] Convention test: the jobs role's attributes, memberships and audit setting; its exact privileges on every table; policies other than `tenant_isolation` belong to the jobs role only and only where it holds privileges
- [x] Behavior test `test/platform-jobs.test.ts`: reads and claims across tenants; cannot claim twice, un-claim, change other columns, insert, delete, truncate, or read other tables (with or without a tenant setting); the app role still sees only its tenant's events and cannot update them; the claim-only trigger holds for the owner
- [x] No drift: `pnpm db:generate` reports nothing
- [x] Docs: `packages/db/CLAUDE.md` roles, `docs/architecture.md` if stale, `docs/ROADMAP.md`
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
