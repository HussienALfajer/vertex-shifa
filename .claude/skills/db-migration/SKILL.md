---
name: db-migration
description: Change the database schema safely in packages/db — edit the Drizzle schema, add RLS policies, generate the migration, review its SQL for backward compatibility, isolation and record integrity, and test it. Use whenever a table, column, index, enum, constraint, policy, trigger or grant is added, changed or removed.
argument-hint: <what changes>
effort: high
---

Schema change: **$ARGUMENTS**. Rules: `packages/db/CLAUDE.md`, ADR 0020 (Data), ADR 0004 (tenancy); clinical tables also ADR 0007; money tables ADR 0014.

1. **Edit** `packages/db/src/schema/<module>.ts` with the shared column helpers. A new schema file is exported from `schema/index.ts` and gets an owner module in the architecture test's owner map. Every foreign key gets an index. Command ids, idempotency keys and external references get unique indexes.
2. **Tenant tables:** `tenant_id` not null; indexes start with `tenant_id`; the custom migration enables and forces RLS and creates the policy that compares `tenant_id` with the transaction's tenant setting; the app role gets only the privileges it needs.
3. **Append-only tables** (audit, payments, clinical versions, the sync command log; not work queues such as the outbox or message status, ADR 0020): no `updated_at` or `archived_at`; the migration adds the trigger that refuses `UPDATE`/`DELETE` and revokes those privileges from the app role.
4. **Generate:** `pnpm db:generate`. Read the new `.sql` file in `packages/db/migrations/` (never `meta/`).
5. **Review the SQL.** The previous release must keep working against the migrated database, and offline devices on the previous app version must still sync. Stop and redesign as expand, then contract, if you see:
   - `DROP TABLE`, `DROP COLUMN`, or a `RENAME` of anything code or the sync rules still use;
   - `ALTER COLUMN ... TYPE` that rewrites or narrows data;
   - `SET NOT NULL`, or a new `NOT NULL` column without a default, on a table that has rows;
   - a removed or renamed enum value (appointment, queue, invoice states especially);
   - anything that changes or deletes audit, payment or clinical version rows;
   - a tenant table without a forced RLS policy.
   Contract steps ship in a later release. Data backfills go in a custom migration and never touch append-only rows.
6. **Test:** the `db` package tests (migrations, the convention test with RLS checks, triggers as app role and owner), then the tests of every package that uses the tables, through the `checker` subagent.
7. **Confirm no drift:** running `pnpm db:generate` again reports nothing to migrate.
8. **Dev database:** `pnpm db:migrate` changes the owner's local data, so ask before running it.

Never use `drizzle-kit push`, never edit a generated migration, and commit the schema and its migration together.
