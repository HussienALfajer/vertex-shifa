-- The schema of pg-boss, the worker's job queue (ADR 0002, ADR 0012). pg-boss runs as the queue role
-- shifa_queue, which exists before this migration (`pnpm db:setup-local` locally, deploy/ on
-- servers), never as the platform-jobs role. It installs, migrates and partitions its own tables in
-- this schema at start (with createSchema off, so it needs no database-level CREATE) and owns them;
-- they are not Drizzle's. The owner role keeps the schema itself.
CREATE SCHEMA pgboss;
--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA pgboss TO shifa_queue;
--> statement-breakpoint

-- The outbox dispatcher, as shifa_jobs, hands each claimed event to pg-boss in the claim's
-- transaction. It only needs to reach the schema here; the worker grants it the two pg-boss tables it
-- writes to after pg-boss has installed them (apps/worker, src/core/queue).
GRANT USAGE ON SCHEMA pgboss TO shifa_jobs;
