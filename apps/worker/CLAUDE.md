# apps/worker

The NestJS worker (ADR 0002, ADR 0020): pg-boss queues and the transactional outbox's dispatcher (ADR 0001, ADR 0012). ESM, Node 24, no HTTP: a Nest application context.

## Layout
- `src/main.ts` starts the process; `src/worker.module.ts` (`WorkerModule.forRoot(config, jobs)`) imports the core and registers the queues.
- `src/core/config/`: the environment checked by Zod at start-up (`loadConfig`), provided as `CONFIG`. `DATABASE_QUEUE_URL` must use the queue role, `DATABASE_JOBS_URL` the jobs role.
- `src/core/queue/`: `BOSS`, the process's pg-boss, connected as the queue role `shifa_queue` in schema `pgboss` (`createSchema: false`; the schema comes from the `packages/db` migrations). At start it installs or migrates pg-boss, applies `JOBS_ROLE_GRANTS`, then creates each job's queue, subscribes it to its events and works it. `QueueJob` and `OutboxJobData` (`queue-job.ts`) are the shape of a job.
- `src/core/outbox/`: `JOBS_DATABASE`, connected as the audited jobs role `shifa_jobs`, and `OutboxDispatcher`, which polls every second, claims up to 100 pending events of every tenant whose type has a subscribed queue, with `FOR UPDATE SKIP LOCKED` (index `outbox_events_pending_idx`), and publishes each to those queues in the same transaction (`fromDrizzle(tx, sql)`). Job id = event id. An event of a type nobody subscribes to stays pending until a queue subscribes to it: never claimed without a job.
- `src/jobs/<area>/<name>.job.ts`: one queue per file, an `@Injectable()` class implementing `QueueJob` (queue `<area>.<name>`, the event types it receives, `work`), listed in `src/jobs/index.ts`. The first job (S03 or S18) is the pattern to copy.
- `test/`: against a fresh migrated database per run (`test/global-setup.ts`, `startWorker` in `test/worker.ts`), files one after another because a dispatcher claims every tenant's events. Unit tests sit next to the code.

## Rules
- pg-boss never runs as `shifa_jobs`, and the dispatcher never claims as `shifa_queue`; the config refuses URLs of the wrong role.
- Everything the jobs role writes into pg-boss happens in its claim's transaction. Its reach in `pgboss` is exactly `JOBS_ROLE_GRANTS` (`SELECT (event)` on `subscription`, `SELECT` on `queue`, `INSERT` and `SELECT (id)` on `job_common`), pinned by `test/pg-boss-access.test.ts`. Queues use the shared job table: never create one with `partition: true`.
- A job is idempotent: pg-boss retries failed jobs and an event's job may run more than once (ADR 0001). Job data holds ids and codes only (ADR 0016). The jobs role's statements are in the server log; their parameter values, which carry the payloads, are not (`log_parameter_max_length = 0` on the role).
- Tenant data in a job is read and written through `withTenant` with the job's `tenantId`, as the app role; never as the jobs or queue role.
- Injection is always explicit, `@Inject(TOKEN)`, as in `apps/api`. Log errors with `describeForLog` from `@vertex-shifa/db`, never a job's data or a database error's message.

Run: `pnpm --filter @vertex-shifa/worker test` (needs the local database, `packages/db/CLAUDE.md`).
