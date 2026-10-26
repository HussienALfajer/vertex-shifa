---
name: feature-slice
description: Implement an approved spec end to end, layer by layer (contracts → db → sync commands → api/worker → bridge → front ends → E2E), with a check gate after each layer, the reviewer and the owner's acceptance, then open the PR with auto-merge. The implement step of the feature cycle, after /spec.
argument-hint: <spec id or path, e.g. S09>
disable-model-invocation: true
effort: medium
---

Implement **$ARGUMENTS**. This skill orders the work and names the gates; the rules for each folder stay in its `CLAUDE.md` and in ADR 0020. The wiring checklist and the files to copy from are in [wiring.md](wiring.md): read it before the first layer.

## 0. Preconditions (stop and tell the owner if one fails)
- The spec (`docs/specs/<id>-*.md`) says `Status: Approved`, and its "Open questions" block nothing this work touches. Never answer an open question yourself.
- The branch is not `main`. Name it `feat/<id>-<slice>`, e.g. `feat/s09-booking-api`.
- The working tree is clean, and `main` is pulled.

## 1. Plan (no code)
- Read only: the spec, the ADRs it lists, `wiring.md`, and the `CLAUDE.md` of each folder you will touch. Open reference files by range when you write the layer that needs them.
- If `TASKS.md` already holds this spec, continue from its first open PR instead of planning again; check that earlier PRs are merged into `main`.
- Split the spec into PRs. Default: PR 1 is contracts, db, sync commands, api and worker with their tests; PR 2 is the screens and E2E. A small spec is one PR. A PR never leaves `main` broken or half-wired, and never ships an offline command without its late, duplicate and conflict tests, or tenant data without its isolation tests.
- Write `TASKS.md` for this spec (replace the previous one): a heading per PR, one item per layer below, the wiring items that apply, and "checks, reviewer, acceptance, PR with auto-merge" at the end of each PR.
- Show the owner the PR split and the task list in a few lines, in Arabic, then **stop and wait for approval**.

## 2. Build, one layer at a time
Finish a layer, run its gate, fix root causes, tick the item in `TASKS.md`, then start the next layer. Never start a layer while the previous gate fails. A gate runs the layer's own test files with `pnpm verify <files>` (paths from the root; it builds what they need first) and typechecks with `pnpm typecheck` (Turborepo replays untouched packages); when one fails, fix it and rerun only the files its summary names. Never run a whole suite at a gate (`docs/testing.md`).

| # | Layer | Build | Gate |
|---|---|---|---|
| 1 | contracts | Schemas and types, error codes, audit actions, state tables, pure rules (scheduling, queue estimates, money, matching) with unit tests | `pnpm verify` on the changed `packages/contracts/src/**/*.test.ts`, `pnpm typecheck` |
| 2 | db | Run `/db-migration`: schema, RLS policies, generated migration, SQL review; shared write paths with concurrency tests | `pnpm verify packages/db/test/conventions.test.ts` and the db test files of the change, migration drift (`pnpm db:generate` writes nothing) |
| 3 | sync | Command definitions and conflict policies in `packages/sync`; the server handlers re-run rules and authorization | `pnpm verify` on the `sync` test files of the commands (late, duplicate, conflicting commands) |
| 4 | api | Module, controllers, command handlers, service: access and entitlement declarations, tenant context, audit and outbox in the transaction, idempotency, rate limits, coded errors; `test/<module>.test.ts` | `pnpm verify apps/api/test/<module>.test.ts apps/api/test/architecture/architecture.test.ts`, `api` typecheck |
| 5 | worker / gateway | Jobs safe to run twice, retries with backoff, classified errors; WhatsApp only through the transport interface with the fake transport in tests | `pnpm verify` on the changed `worker` / `whatsapp-gateway` test files, their typecheck |
| 6 | bridge | `pnpm build`, OpenAPI export, generated clients (commands in `AGENTS.md`) | front-end typecheck |
| 7 | front ends | Clinic (local reads, writes through commands, offline states), console, site or patient screens; i18n keys; loading, empty, error and offline states everywhere | the app's typecheck, lint, `pnpm verify` on its changed unit test files |
| 8 | e2e | The spec's flows, including one offline scenario where relevant; RTL screenshots (light and dark) | `pnpm verify apps/<app>/e2e/<spec>.spec.ts` for each new or changed spec (`--grep "<title>"` for one test of a long spec); open the new screenshots and look at them. The whole suites run in CI |

Layers a PR does not include are skipped. Helpers arrive with their first real use, in the shared place ADR 0020 names.

## 3. Close each PR
1. Walk the wiring checklist in `wiring.md` against the diff (`git diff main...HEAD --stat`).
2. Run `pnpm verify` once on the branch (lint, typecheck, test, build, migration drift, the changed E2E specs), through the `checker` to keep its output out of the context, and the `reviewer` (next step) at the same time. Edit nothing until both are done.
3. Run the `reviewer` subagent with the spec path. Fix every blocking finding and every failure of step 2 together, then run `pnpm verify` once more: Turborepo replays what the fixes did not touch.
4. Owner acceptance, in Arabic:
   - PR with screens: turn the spec's "Acceptance" section into numbered steps (how to start the apps, which test account, what to click, what to see, how to simulate offline). Ask before `pnpm db:migrate` on the dev database.
   - PR without screens: summarize the endpoints, commands and jobs and their rules; the owner may try them on the local API (`apps/api/openapi.json` lists the routes).
   Fix what the owner reports in the same session, then run `pnpm verify` again (only what changed runs) and the reviewer on the fix.
5. Tick the PR's items in `TASKS.md`, then, as soon as the owner accepts, finish the PR in the same turn: follow "Finishing a task" in `AGENTS.md`.

## Stop and ask when
- The spec is ambiguous in a way that changes the result, or the work needs an answer from `docs/open-questions.md`.
- The migration review in `/db-migration` finds a destructive or non-backward-compatible change.
- A command changes the owner's data (`pnpm db:migrate`), reaches a server, sends a real WhatsApp message or publishes to a store.
- The work would go beyond the spec: record the idea as a follow-up instead.

## Keep this skill true
If a step here or in `wiring.md` was missing, wrong or out of date, fix the file in the same PR and say so under "Found". After the first feature ships, fill the "Patterns to copy" table in `wiring.md` with its files.
