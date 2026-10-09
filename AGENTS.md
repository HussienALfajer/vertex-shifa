# Vertex Shifa

A multi-product health platform for Syria, starting in Azaz (northern Aleppo). V1 ships the first product, **Vertex Shifa Clinic** (clinic and doctor management with an offline-first desktop app), the **Vertex Shifa** patient app (Android, iOS), public clinic booking pages and the platform console. Hospitals, labs and pharmacies follow as new products on the same platform core. Arabic-first RTL.

V1 goal: the clinic system a doctor in Azaz trusts for a whole working day without internet: bookings never collide silently, patients see their turn live, and medical records are never lost, leaked or overwritten.

This project is independent. Do not read or reuse other folders on this machine unless the owner asks. Standing exceptions (owner, 2026-10-09), both **read, never edit**: `D:\vertex-hub`, to copy and adapt its brand, logo and design system at the brand phase (ADR 0018); `D:\vertex-digital`, as a reference for setup files and the working method. Copied code is adapted to this project's rules; nothing is imported across repositories.

## Source of truth

| File | Purpose |
|---|---|
| `docs/product/vision.md` | The platform, its products, principles. Read when a decision affects future products. |
| `docs/product/v1-scope.md` | What V1 includes and excludes (F01–F40). Anything not in it is out of scope: ask before adding. |
| `docs/decisions/` | Architecture and business decisions (ADRs). Follow them; propose a new ADR to change one. ADR 0020 is the code shape. |
| `docs/architecture.md` | Stack, repository layout, module map, data conventions. |
| `docs/glossary.md` | Domain terms in Arabic and English. Name code after the English term listed there. |
| `docs/ROADMAP.md` | Phase and spec status. Update it when a spec or phase item is done. |
| `docs/specs/<id>-<name>.md` | Detailed spec per feature group, written before implementation. |
| `docs/open-questions.md` | Unresolved decisions. Never guess an answer to one: ask. |
| `docs/workflow.md` | How work is run with Claude Code (feature cycle, models, effort, sessions). |
| `<app or package>/CLAUDE.md` | Local rules and the pattern to copy; each arrives with its folder. |

Read these on demand. For a feature, read its spec, the ADRs it lists, and its section of `v1-scope.md`.

## Stack (ADR 0002, 0003)

pnpm workspaces + Turborepo · TypeScript (strict) · Node 24 · PostgreSQL 17. The workspace, shared configuration, `packages/db`, `packages/contracts`, `apps/api`, `apps/worker` and `apps/whatsapp-gateway` exist; the other apps and packages arrive with their Phase 0 roadmap items.

- `apps/api` NestJS core API · `apps/worker` NestJS jobs (pg-boss, outbox dispatcher) · `apps/whatsapp-gateway` WhatsApp sessions behind a transport interface
- `apps/clinic` React + Vite, packaged with Electron, offline-first · `apps/console` platform back office (React + Vite) · `apps/site` Next.js public clinic pages · `apps/patient` React Native + Expo
- `packages/contracts` Zod schemas and pure rules · `packages/db` Drizzle schema, migrations, RLS · `packages/sync` offline commands and sync rules · `packages/ui`, `packages/ui-native`, `packages/tokens` design system · `packages/i18n` · `packages/config`

## Commands

The PR that adds a command adds it to this table and keeps it true. Run from the repository root.

| Task | Command |
|---|---|
| Install | `pnpm install` |
| Lint (Biome) | `pnpm lint` · fix: `pnpm lint:fix` · one path: `pnpm exec biome check --error-on-warnings <path>` |
| Typecheck | `pnpm typecheck` · one package: `pnpm --filter @vertex-shifa/<name> typecheck` |
| Test | `pnpm test` · one package: `pnpm --filter @vertex-shifa/<name> test` |
| Build | `pnpm build` |
| Local database | `pnpm db:setup-local` (roles and dev database; needs `.env` from `.env.example`) · migrate: `pnpm db:migrate` · generate: `pnpm db:generate` |
| API | start (after `pnpm build`): `pnpm --filter @vertex-shifa/api start` (reads `.env`) · regenerate `apps/api/openapi.json`: `pnpm --filter @vertex-shifa/api exec vitest run -u test/openapi.test.ts` |
| Worker | start (after `pnpm build`): `pnpm --filter @vertex-shifa/worker start` (reads `.env`) |
| WhatsApp gateway | start (after `pnpm build`): `pnpm --filter @vertex-shifa/whatsapp-gateway start` (reads `.env`; fake transport only, exits after start until S03 runs sessions) |
| Check record | `node scripts/check-record.mjs status <checks…>` (also `fingerprint`, `record <tree> <checks…>`) |

## Non-negotiable conventions

- **Tenant isolation (ADR 0004):** every tenant-owned table has `tenant_id` and a PostgreSQL row-level security policy; apps connect as a role that cannot bypass RLS (exceptions: the audited platform-jobs role, and the read-only replication role of the sync service, whose streams must filter on `tenant_id` — ADR 0021); tenant context is set per transaction. A cross-tenant read is a security incident.
- **Medical data (ADR 0006, 0016):** never in logs, error messages, Sentry, analytics, WhatsApp messages, fixtures, screenshots or chat. It reaches a patient only through items the clinic shared, and another organization only with consent. Reading a medical record writes an audit entry.
- **Clinical records are append-only (ADR 0007):** notes, diagnoses and prescriptions change by new versions, never by overwriting or deleting; a prescription keeps a snapshot of each medication.
- **Offline-first (ADR 0008):** the clinic app reads and writes its local database; changes travel as commands the server validates and may accept, adjust or reject; ids are UUIDv7 made on the device; human-readable numbers come from pre-allocated ranges; a conflict is never resolved silently.
- **Scheduling (ADR 0009):** capacity belongs to channels and a channel books only from its pool; conflicts go to the conflict inbox and the moved patient is told, with alternatives.
- **Money (ADR 0014):** integer minor units, always with a currency; no floats; the exchange rate is stored on every conversion; payments are append-only and corrected by reversals.
- **One validation source:** Zod schemas in `packages/contracts`, reused by every app including the patient app.
- **Authorization and entitlements are server-side (ADR 0005, 0013):** every endpoint and command declares its access and the feature it needs. UI checks are cosmetic; on clinic devices, the server-side replication scope decides which data a device holds (ADR 0008).
- **Never lock medical data for non-payment (ADR 0013):** suspension means read-only plus export.
- **Messaging (ADR 0012):** in-app push and WhatsApp only. WhatsApp carries OTPs and consented, transactional messages without medical content, throttled per number.
- **Audit; archive, don't delete:** every change to clinical, money, access or contract data writes an audit entry in the same transaction; business records are archived; audit rows are never updated or deleted.
- **Arabic-first RTL UI:** logical CSS only, all text through i18n, Latin digits, design-system components and tokens only (ADR 0018). "Vertex" is always visible to customers.
- **Public repository:** no secrets and no real patient, clinic or phone data anywhere in the repo: synthetic data only. `.env` files are git-ignored; `.env.example` holds fake values.
- **No Cloudflare** (blocked in Syria) (ADR 0015, 0017).

## How to work

- Continue without asking when the next step needs no input from the owner. Put brief status notes in the same message as the next action.
- Stop and ask only when a decision belongs to the owner (scope, business rules, prices, clinical rules, anything in `open-questions.md`), when a spec is ambiguous in a way that changes the result, or before a destructive or outward-facing action (deleting data, dropping tables, force-push, touching a server, sending real WhatsApp messages, publishing to an app store).
- A task is done only when its checks pass: typecheck, lint, the relevant tests; for UI changes, a Playwright screenshot in RTL. Show the evidence (commands run and their results) instead of asserting success.
- Fix root causes. Never silence a failing test, type error or lint rule.
- For multi-step work keep a checklist in `TASKS.md`: tick items and add work you discover.
- Mark anything you could not confirm and say where you looked.
- Match the surrounding code: copy the pattern named in the folder's `CLAUDE.md`. No speculative code: helpers, options and abstractions arrive with their first real use.

## Context economy

- Search before reading, then read only the relevant range. For `v1-scope.md`, read the feature's section, not the whole file.
- Never read generated or lock files: `pnpm-lock.yaml`, `**/migrations/meta/`, `routeTree.gen.ts`, `.next/`, `dist/`, `.turbo/`, `.expo/`.
- Run the narrowest check first (one package, one test file) and the full set once before the PR. With Turborepo, add `--output-logs=errors-only`.
- In replies, point to `path:line` instead of pasting files or diffs.

## Git

- Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`).
- One branch per change, named by type (`feat/<topic>`, `fix/<topic>`, `docs/<topic>`, `chore/<topic>`, `refactor/<topic>`, `spike/<topic>`); a cloud session keeps the `claude/…` branch it was given. Never commit to or push `main` directly.
- Merge commits only: never squash or rebase-merge (the owner's cleanup uses `git branch -d`).

## Finishing a task: open the PR at once

When a task's work is done (a spec approved, a `/feature-slice` PR accepted, a fix, a docs change), finish it in the same turn. Stop and report at the first step that fails.

1. **Branch:** not `main`. `TASKS.md` has no open items for this PR.
2. **Docs:** update `docs/ROADMAP.md` and every doc the change made stale (`docs/architecture.md`, a folder `CLAUDE.md`, `docs/open-questions.md`, the commands table above).
3. **Secrets and data:** `git status` and `git diff --stat` show no `.env`, key, WhatsApp session file, real phone number or medical data; fixtures are synthetic.
4. **Checks:** lint, typecheck, test and build, plus E2E when a front end or `packages/ui*` changed and migration drift when `packages/db` changed, run through the `checker` subagent. Run `node scripts/check-record.mjs status <checks…>` first and run only the checks marked `needed`. Documentation-only changes run no local checks.
5. **Review:** for feature, sync, security and clinical work, the `reviewer` subagent has run and its blocking findings are fixed.
6. **Commit:** stage the intended files only; Conventional Commit subject, a body with what and why, ending with the session's attribution line.
7. **Pull request:** `git push -u origin <branch>`, `gh pr create --base main` with `## Summary` and `## Test plan` (ticked checks, each marked run now or reused from the record), ending with the session's attribution line; then `gh pr merge <number> --auto --merge`. Exception: a PR that changes `v1-scope.md` or adds or changes an ADR waits for the owner's approval before auto-merge is enabled.
8. **Report** in the format below.

## Reporting

End every substantial task with these sections, in this order:

1. **Needs from you** — decisions or approvals blocking progress, or "nothing". When the task opened or merged a PR, end with the local cleanup line for its branch, in a code block: `cd D:\vertex-shifa; git switch main; git pull --ff-only; git branch -d <branch>`
2. **Changed** — what was built or modified.
3. **Verified** — checks run and their results.
4. **Found** — issues, risks or follow-ups noticed.
5. **Next step** — always last: the next task (from `docs/ROADMAP.md` or what this task uncovered), why it comes next, what it needs from the owner; whether it needs a new session and can run in the cloud (`docs/workflow.md`); the model and effort to set; and the exact first message, in its own code block.

## Language

Talk to the owner in Arabic, including the report and its headings. Write everything stored in the repo in English: code, comments, docs, prompts for agents, commit messages, PR descriptions. UI text is Arabic, through i18n.

## Servers

No server exists yet; hosting is open (`docs/open-questions.md` Q1, ADR 0017). Never run commands on a server without explicit approval in the current conversation.

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
