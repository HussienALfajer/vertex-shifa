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
Finish a layer, run its gate through the `checker` subagent, fix root causes, tick the item in `TASKS.md`, then start the next layer. Never start a layer while the previous gate fails.

| # | Layer | Build | Gate |
|---|---|---|---|
| 1 | contracts | Schemas and types, error codes, audit actions, state tables, pure rules (scheduling, queue estimates, money, matching) with unit tests | `contracts` tests, root typecheck |
| 2 | db | Run `/db-migration`: schema, RLS policies, generated migration, SQL review; shared write paths with concurrency tests | `db` tests, migration drift |
| 3 | sync | Command definitions and conflict policies in `packages/sync`; the server handlers re-run rules and authorization | `sync` tests (late, duplicate, conflicting commands) |
| 4 | api | Module, controllers, command handlers, service: access and entitlement declarations, tenant context, audit and outbox in the transaction, idempotency, rate limits, coded errors; `test/<module>.test.ts` | the module's test file, architecture test, `api` typecheck |
| 5 | worker / gateway | Jobs safe to run twice, retries with backoff, classified errors; WhatsApp only through the transport interface with the fake transport in tests | `worker` / `whatsapp-gateway` tests and typecheck |
| 6 | bridge | `pnpm build`, OpenAPI export, generated clients (commands in `AGENTS.md`) | front-end typecheck |
| 7 | front ends | Clinic (local reads, writes through commands, offline states), console, site or patient screens; i18n keys; loading, empty, error and offline states everywhere | the app's typecheck, lint, tests |
| 8 | e2e | The spec's flows, including one offline scenario where relevant; RTL screenshots (light and dark) | `pnpm test:e2e`; open the new screenshots and look at them |

Layers a PR does not include are skipped. Helpers arrive with their first real use, in the shared place ADR 0020 names.

## 3. Close each PR
1. Walk the wiring checklist in `wiring.md` against the diff (`git diff main...HEAD --stat`).
2. Full checks once, through `checker`: lint, typecheck, test, build; E2E when a front end or `packages/ui*` changed; migration drift when `packages/db` changed. The finishing steps reuse passes recorded on the same tree; any later fix invalidates the record.
3. Run the `reviewer` subagent with the spec path. Fix every blocking finding, then re-run the affected gates.
4. Owner acceptance, in Arabic:
   - PR with screens: turn the spec's "Acceptance" section into numbered steps (how to start the apps, which test account, what to click, what to see, how to simulate offline). Ask before `pnpm db:migrate` on the dev database.
   - PR without screens: summarize the endpoints, commands and jobs and their rules; the owner may try them at the API docs page.
   Fix what the owner reports in the same session, then repeat steps 2–3 for what changed.
5. Tick the PR's items in `TASKS.md`, then, as soon as the owner accepts, finish the PR in the same turn: follow "Finishing a task" in `AGENTS.md`.

## Stop and ask when
- The spec is ambiguous in a way that changes the result, or the work needs an answer from `docs/open-questions.md`.
- The migration review in `/db-migration` finds a destructive or non-backward-compatible change.
- A command changes the owner's data (`pnpm db:migrate`), reaches a server, sends a real WhatsApp message or publishes to a store.
- The work would go beyond the spec: record the idea as a follow-up instead.

## Keep this skill true
If a step here or in `wiring.md` was missing, wrong or out of date, fix the file in the same PR and say so under "Found". After the first feature ships, fill the "Patterns to copy" table in `wiring.md` with its files.
