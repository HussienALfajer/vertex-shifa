# Testing

How the checks run, locally and in CI, and why. `AGENTS.md` holds the rules in short; this file explains them. Measurements from 2026-10-26 are at the end.

## Where each check runs

Each check runs once, in the place where it is cheapest. The session checks what it changed; CI checks everything before a merge.

| When | What runs | Command |
|---|---|---|
| While writing | Biome on each edited file (hook), the test file you are working on | `pnpm verify <file>` |
| A layer's gate (`/feature-slice`) | That layer's test files, `pnpm typecheck` | `pnpm verify <files>` |
| Before the PR, once (and once more after the reviewer's fixes) | Lint; typecheck, test and build of every package (Turborepo replays the unchanged ones; OpenAPI drift is an api test); migration drift; the changed E2E specs | `pnpm verify` |
| CI, before the merge | Everything, every app's whole E2E suite included, on four parallel shards | — |

A whole E2E suite never runs in a session unless asked for (`pnpm verify --e2e-all`).

## `pnpm verify`

`scripts/verify.mjs`, from the repository root:

- `pnpm verify`: Biome over the repository; `turbo run typecheck test build` (with `--continue`, so one failure does not hide the others); `drizzle-kit generate` when `packages/db/src` or `packages/contracts/src` changed (the schema takes its enums and limits from the contracts): a migration it writes fails the run as it fails CI; then, for each web app, the E2E specs the branch changed, against the app's build (clinic and console on `vite preview`, site on `next start`, patient's web export, each started by its own `playwright.config.ts` on a free port). An app that changed without a changed spec is named in the summary: CI runs its suite.
- `pnpm verify <file>...`: only those test files, paths from the repository root. Vitest files run in their package after `turbo run build --filter=<package>^...` (a stale dependency's `dist` gives failures that are not in the code); E2E specs run after their app's build. `--grep "<title>"` picks tests of a spec.
- Changed files are those that differ from the merge base with `origin/main` (committed, uncommitted or new).
- Output: the whole output of each step in `.verify/<step>.log` (git-ignored); the console and `.verify/summary.md` get only the summary: each step's result and time, the tasks Turborepo ran rather than replayed, each failure with its file and line, and the command that reruns only the failed files.
- Exit code 0 when everything passed, 1 when a check failed, 3 when it refused to start: another `pnpm verify` is running on the machine (lock file `vertex-shifa-verify.lock` in the temp folder; a lock left by a killed run expires after 30 minutes), a dev server is up (the ports come from each app's `dev` script or Vite config: clinic 5173, console 5174, site 5175, patient 5176; `next build` and `expo export` rewrite what `next dev` and Metro serve; `--allow-dev` overrides), or a file does not exist.

## Rules, and what enforces them

| Rule | Why | Enforced by |
|---|---|---|
| One test run at a time on the machine | Two runs share the CPU: the E2E servers and the clinic's Argon2id sign-ins time out the other run's tests | The `test-guard` hook refuses a second run; the verify lock |
| Run once, read the log | Rerunning a suite to read its output again costs minutes | `pnpm verify` keeps every log and prints the failures |
| Rerun only what failed | A full rerun after a one-file fix repeats passing tests | The summary prints the rerun command; Turborepo replays untouched packages |
| No edits while a check runs | The result no longer describes the code | Instructions (`CLAUDE.md`) |
| No whole E2E suite in a session | Minutes locally, under load from everything else on the machine; CI runs it on four shards | The `test-guard` hook (`pnpm verify --e2e-all` to run it on purpose) |
| No `timeout` around a test run | A killed run proves nothing and gets run again | The `test-guard` hook |
| No checks while a dev server runs | Its watcher loads the machine, and the builds rewrite the files it serves | `pnpm verify` refuses |

The hook is `.claude/hooks/test-guard.mjs` (PreToolUse on Bash and PowerShell). Commands that run no tests pass straight through, and the text of a heredoc counts as data; for a test command it reads the verify lock and the running Node processes of this checkout and the main one (worktrees under `.claude/worktrees/` share the machine).

## Test databases

- Every run of a database suite (`packages/db`, `apps/api`, `apps/worker`) creates its own database, `shifa_test_<time>_<random>`, migrates it in its global setup and drops it at the end (`createTestDatabase` in `packages/db/src/testing.ts`). Runs never share rows, so suites run side by side and need no per-worker databases or locks.
- A run that is killed never drops its database: the next run's `createTestDatabase` drops the ones older than two hours (a database still in use is skipped).
- Within a run, the files of the api and db suites run in parallel on the run's database and keep apart by seeding their own rows with unique values; the worker suite runs its files one after another (a dispatcher claims every tenant's events).

## Vitest

- Every suite keeps Vitest's isolation (each file loads its modules afresh). Measured on 2026-10-26: turning it off saved nothing on the api suite, whose 16 files each get a worker of their own on a 32-thread machine, and at most 2 seconds on the db and worker suites; with it off, Vitest also held the process up to 33 seconds after its summary in 3 of about 14 runs. Revisit when a suite has many more files than workers, and first make every file leave no module state behind: a schema registered with `.meta({ id })` in a test stays in Zod's global registry, which the OpenAPI document reads whole (`core.test.ts`'s `TestProbe` broke `openapi.test.ts` when they shared a worker).
- The api suite uses Vitest's default worker count (one fewer than the logical CPUs; CI runners have four). At 16 parallel files it peaked at 46 connections on PostgreSQL's default `max_connections` of 100, and capping the workers at 8 or 12 was no faster. Each file holds about three connections beyond the server's own: past about 30 files on a large machine, cap `maxWorkers` or "too many clients" errors follow.
- A test that compares several rows read back orders them (`orderBy`): PostgreSQL returns rows in no guaranteed order, and an audit read of `console.test.ts` failed that way (a second one had the same flaw).

## E2E

- Every test mocks the API in memory (`e2e/mock-api.ts` in each app); the suites run against the production builds.
- Every web screen is screenshotted in every project: desktop light and dark, tablet, and phones of 412, 375 and 320 px (patient: phone light and dark, tablet, 375 and 320 px). `screenshot()` fails a page that scrolls sideways (AGENTS.md "Responsive").
- A clinic or console test that takes no screenshot is tagged `@flow` (`test(title, { tag: '@flow' }, …)`) and runs in two projects only: `light` (desktop: mouse, sidebar) and `phone` (412 px: touch, navigation sheet), the two paths a flow can take; the other projects would repeat it at another color or width, which the screenshots cover (`grepInvert` in `playwright.config.ts`). `screenshot()` fails in a `@flow` test, so a screen never loses its sizes. A new test without a screenshot gets the tag.
- Traces are recorded on the first retry only (`trace: 'on-first-retry'`): CI retries a failed test once and keeps its trace. Debug locally with `--trace on`.
- The clinic runs on a quarter of the cores locally (`workers: '25%'`): every test signs a member in with Argon2id (64 MiB), and more workers starve the preview server. Without traces, half the cores ran the suite in 83 s against 95 s (one run each, 2026-10-26): too small a gain to give up the margin under load.
- A wait covers what the app really does before the state appears, at that assertion, never by a global timeout: the clinic's logo-failure test waits through the query's two retries (1 s, then 2 s).

## CI

`.github/workflows/ci.yml`. A pull request that changes only Markdown outside `brand/` skips the checks; the gate job still reports.

| Job | Runs |
|---|---|
| Lint, typecheck, build | Audit, Biome, typecheck, build, migration drift |
| Tests | Every package's tests (OpenAPI drift is an api test) |
| E2E shard 1–4 | Every app's whole E2E suite, each split by Playwright `--shard` |
| Typecheck, lint, test, build | The gate job the branch protection requires: it passes when every job behind it, the shards included, passed or was skipped |
| Secret scan | gitleaks |

`test:e2e` is a cached Turborepo task: its hash covers the app's files, its build and, through the build, every package the app uses. A pull request that changes no front end and no package they use replays the E2E from the cache, with its screenshots.

Turborepo's cache is kept between runs with `actions/cache`, per job and shard. A pull request reads its own runs' cache and `main`'s; `main` cannot read a pull request's (GitHub keeps caches per branch), so after a merge `main` runs what the pull request changed once more.

### Remote cache

The workflow is ready for Turborepo's remote cache, which removes that repeat: `main` replays what its pull request ran, and a session can read what CI ran. Off for now (2026-10-26): the repeat costs only `main`'s run after a merge, which nobody waits for, while the cache would send every build output to a third party or need a server of our own, which waits on hosting (`docs/open-questions.md` Q1). It needs:

1. A remote cache: Vercel's (create a token in the Vercel account settings; check Vercel's current terms) or a self-hosted server that implements the same API (for example `ducktors/turborepo-remote-cache`; then set the `TURBO_API` variable to its URL). Not behind Cloudflare (ADR 0015).
2. Repository secrets `TURBO_TOKEN` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY` (a random string of at least 32 bytes: `turbo.json` has `remoteCache.signature` and `futureFlags.longerSignatureKey`, so artifacts are signed and checked), and the repository variable `TURBO_TEAM` (the team slug).

Only the three jobs that run turbo get these values. Pull requests from forks and from Dependabot get no secrets and keep the per-job cache.

## The local machine (Windows)

- **Other load.** The suites are short, so what else runs on the machine decides their time: another session's checks, a search over `node_modules`, Docker, VPN clients. A run under load turns 5-second test timeouts into failures that are not in the code; check the load before reading a slow or failed run as a regression.
- **Antivirus.** Microsoft Defender scans every file the tests read and write. A [Dev Drive](https://learn.microsoft.com/windows/dev-drive/) (ReFS, with Defender's performance mode) for the repositories and the pnpm store removes most of that; excluding the folders is the weaker alternative. Both are the owner's choice, set by hand.
- **Dev servers.** Stop them before `pnpm verify`.

## Measurements (2026-10-26)

Local: Intel i9-14900HX (24 cores, 32 threads), 32 GB, NVMe, Windows 11, PostgreSQL 17, with the owner's usual background load (other sessions, Docker, VPN clients). Each suite run on its own with `pnpm exec vitest run` or `pnpm exec playwright test` in its package, after `pnpm build`.

| | Before | After |
|---|---|---|
| api suite (16 files, 160 tests) | 13.7–16.8 s (Vitest's Duration; 15 s wall) | unchanged: isolation and the default workers kept (see Vitest) |
| db suite (8 files, 420 tests) · worker suite (4 files, 15 tests) | 5.3–6.3 s · 14.1–15.1 s | unchanged |
| clinic E2E (57 tests × 6 projects = 342 runs, 8 workers) | 295 s, 2 failed (the logo test, under load) | 129 s, none failed |
| console E2E (102 runs) · site (18) · patient (15) | 54 s · 12 s · 10 s | 22 s · 11–13 s · 10 s |
| Every app's whole E2E suite, one after another | 371 s | 174 s; then about 120 s with the `@flow` split |
| CI E2E | one job: median 5.3 min, p90 8.6 min | four shards of 3.1–3.9 min each (one run lost 10 min to the apt mirror of `--with-deps`, since dropped) |

Before this change, sessions of this repository spent 6.3 hours in checks in twelve days (the longest 69 minutes), and CI's longest job was the unsharded E2E (median 5.3 minutes, p90 8.6 minutes), run even when no front end changed.

### The project matrix

Before the split every test ran in every project. 18 of the clinic's 57 tests and 6 of the console's 17 take no screenshot (site and patient: none). Running them in `light` and `phone` only (2026-10-26) drops 96 of the 477 runs: the clinic's suite went from 342 runs to 270 (80 s, against 95–129 s for the whole matrix the same day) and the console's from 102 to 78 (16 s, against 21–22 s).
