# Working method

How Vertex Shifa is built with Claude Code (Opus 5.5). `AGENTS.md` holds the rules agents follow; this file explains the method for the owner and for agents that need detail. Decision: ADR 0019.

## Why it works this way

Prices, cache lifetimes, model names and version numbers below are from Anthropic's documentation as checked on 2026-10-09 (References); re-check them when a new model or Claude Code release changes the guidance.

- **Context is the scarcest resource.** Every turn resends the whole conversation, and quality drops as context fills.
- **Cost ≈ turns × context size.** Cache reads cost 5% of fresh input on Opus 5.5 as long as the cache stays warm (one hour on a subscription).
- **Output costs five times input**, and thinking is output: effort is the main cost lever.
- **Verification enables autonomy.** With a check it can run, the agent iterates until the check passes.
- **Knowledge lives in files, not chat.** Sessions, accounts and tools change; the repository stays.

## The feature cycle

The unit of work is a spec from `docs/ROADMAP.md` (`S01`…`S23`). Each session ends with a merged PR (or a finished deploy) and `/clear`, so the next one starts from files and git. Set the model and effort before the first message.

| # | Session | Model and effort | First message | The owner | Ends with |
|---|---|---|---|---|---|
| 1 | Spec | Opus 5.5, `high` | `/spec <id>` | Answers the interview; approves the spec | The spec's PR (`docs/<id>-spec`) |
| 2 | Backend PR | Opus 5.5, `high` for sync, scheduling, tenancy, access, clinical records, contracts and the WhatsApp gateway; else `medium` | `/feature-slice <id>` | Approves the PR split and `TASKS.md`; may try endpoints on the local API (`apps/api/openapi.json` lists them) | PR 1 (contracts, db, sync commands, api, worker) with auto-merge |
| 3 | Front-end PR | Opus 5.5, `medium` | `/feature-slice <id>` | Runs the acceptance steps in the app | PR 2 (clinic, console, site or patient screens, E2E) with auto-merge; `docs/ROADMAP.md` updated |
| 4 | Phase deploy (once per phase) | Opus 5.5, `low` | `Deploy phase <n> to production` | Approves the deploy; checks the live system | Deploy done, ticked in `docs/ROADMAP.md` |

- A large spec needs more than two PRs: `/feature-slice` splits it so each PR stays reviewable and never leaves `main` broken.
- A small spec (about one table and one screen) does sessions 2 and 3 in one PR.
- `/feature-slice` reads `TASKS.md` and continues from the first open PR, so a session can stop between PRs.
- After each merge the owner runs the cleanup line from the report, then `/clear`.
- Inside a session, use `/compact` between layers if the context grows, never in the middle of one.
- **Spikes** (Phase 0) run on `spike/<topic>` branches with throwaway code; they end with a findings report and the ADR amendments they justify, not with production code.

Steps inside a feature:

1. **Spec** (`/spec`): the agent interviews the owner and writes `docs/specs/<id>-<name>.md` from `docs/specs/_template.md`: access, data, states, offline behavior and conflicts, clinical data and privacy, money, API and commands, screens, notifications, abuse, edge cases, acceptance.
2. **Plan** (`/feature-slice`, first step): the PR split and `TASKS.md`; the owner approves before any code.
3. **Implement:** layer by layer, each followed by a check gate on the layer's own tests (`pnpm verify <files>`, `docs/testing.md`).
4. **Review:** the `reviewer` subagent (fresh context) checks the branch against the spec and the rules; blocking issues only.
5. **Accept and open the PR:** the owner tries it; the agent follows "Finishing a task" in `AGENTS.md` in the same turn: `pnpm verify` again if anything changed since its last green run, then the PR with auto-merge and, in the desktop app, Auto-fix. CI runs every check, the whole E2E suites on four shards.

## How the instructions are layered

Each rule lives in one place and loads only when it is needed.

| Layer | Files | Loaded |
|---|---|---|
| Owner's personal preferences | `~/.claude/CLAUDE.md` (language) | Every session, every project |
| Project rules | `AGENTS.md`, `CLAUDE.md` (imports `AGENTS.md`), under 200 lines together | Every session |
| Folder rules | `<app or package>/CLAUDE.md` | When the agent reads a file in that folder |
| Product and decisions | `docs/product/`, `docs/decisions/`, `docs/specs/`, `docs/glossary.md` | On demand, the parts the task needs |
| Workflows | `.claude/skills/`: `spec`, `feature-slice`, `db-migration` | When invoked |
| Subagents | `.claude/agents/`: `checker` (Haiku 5.5, runs `pnpm verify` and returns its summary), `reviewer` (Opus 5.5), `explorer` (Sonnet 5.5) | In their own context; only their summary returns |
| Enforcement | Biome hook on every edit and the test guard on every shell command (`.claude/hooks/`: one test run at a time, no whole E2E suite locally, no `timeout` around tests), architecture and convention tests, CI, gitleaks | Always, without costing context |
| Guard rails | `.claude/settings.json`: model and effort, permissions, denied reads of secrets and generated files | Always |

A rule a machine can check belongs in a test, lint rule or hook, not in prose. A rule for one folder belongs in that folder's `CLAUDE.md`.

## Anatomy of a good request

- **Goal:** what to build.
- **Reference:** which spec or ADR.
- **Scope:** what may change and what must not.
- **Finish line:** a checkable condition ("`pnpm verify` passes; RTL screenshot attached").
- **Stop conditions:** only owner decisions, destructive or outward-facing actions, real WhatsApp messages, store publishing.

Don't write "think hard" or "step by step": effort controls depth. To add something while the agent works, type it and press Enter; don't restart.

## Models and effort by task

| Task | Model | Effort |
|---|---|---|
| Sync protocol core | Opus 5.5 | `xhigh` |
| Scheduling and conflicts, tenancy and RLS, access, clinical records, contracts and entitlements, WhatsApp gateway | Opus 5.5 | `high` |
| Spec interviews, spikes | Opus 5.5 | `high` |
| A clearly specified feature outside those areas, screens | Opus 5.5 | `medium` |
| Phase deploys, mechanical edits (renames, translation keys, applying a known pattern) | Opus 5.5 | `low` |
| Searching code, docs or the web | `explorer` subagent (Sonnet 5.5) | — |
| Running checks, reading logs and test output | `pnpm verify` (a short summary, logs in `.verify/`); the `checker` subagent (Haiku 5.5) for a long run beside other work | — |
| A problem that failed twice at `xhigh` | Fable 5.1, for that problem only | — |

Sonnet and Haiku never write code. Avoid `max` unless a gain is measured. Agent teams, fast mode and `opusplan` are not used by default. Haiku 5.5 costs five times more above 100K tokens of context: keep `checker` runs narrow.

## Session habits

1. Set model, effort and connectors at session start; don't change them mid-session (each change rebuilds the cache).
2. Don't pause longer than the cache lifetime (one hour on a subscription) in the middle of a task; finish or compact before a break.
3. `/clear` between unrelated tasks (`/rename` first if you may come back).
4. `/compact <what to keep>` at natural breaks; `/rewind` to abandon a failed path.
5. After two failed corrections on the same issue, `/clear` and start again with a better request.
6. Side questions: `/btw`, so they don't enter the context.
7. Disconnect connectors the task doesn't need (Hostinger only for DNS or hosting work); keep the `ui-ux-pro-max` plugin off, since the identity is fixed (ADR 0018).
8. Run checks with `pnpm verify`: it prints a short summary and keeps the whole output in `.verify/`, so long output never enters the context. Delegate a long run to the `checker` when something else can go on meanwhile (the reviewer), never edits.
9. Check `/usage` after each feature: cache share should be high; output should be small relative to the change.
10. Run `/doctor prompt-audit` (Claude Code memory docs, "Audit your instruction files") once per phase to prune instruction files.
11. Keep Claude Code updated (Haiku 5.5 subagents need v2.1.293 or later).

## Accounts and tools

- Switch Claude accounts between tasks, never in the middle of one: the prompt cache does not carry over.
- Other agents read `AGENTS.md` directly and can continue work when Claude limits are reached.
- Everything needed to resume lives in `docs/`, `TASKS.md` and git history.

## Cloud sessions

Cloud sessions (Claude Code on the web) get skills, subagents, hooks and settings from the repository. Run them in the shared cloud environment `vertex`; this repository does not edit that environment.

**What the environment provides.** Node 24 (default on `PATH`), Corepack with pnpm, Docker with the `postgres:17` image, Playwright Chromium in `PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright`, full network, and telemetry turned off (Next.js, Turborepo, Expo), `ELECTRON_SKIP_BINARY_DOWNLOAD=1` and `NODE_OPTIONS=--max-old-space-size=6144`. Its command `vertex-session [repo-dir]` starts PostgreSQL 17 on `127.0.0.1:5432` (or reuses one already answering there), runs `pnpm install --frozen-lockfile`, creates `.env` from `.env.example` when missing (with the `postgres` admin password; the all-zero example keys are fine for dev and test), runs `pnpm db:setup-local` and `pnpm db:migrate`, and installs the clinic's Playwright Chromium. It prints `Vertex cloud session ready: ...` plus any problems, logs to `/tmp/vertex-session.log` and always exits 0.

**Session start.** The `SessionStart` hook in `.claude/settings.json` runs `scripts/cloud-session.sh`. It does nothing unless `CLAUDE_CODE_REMOTE=true`, so it stays silent locally; in the cloud it runs `vertex-session`, or prints a one-line hint when the session is not in the `vertex` environment. A session with several repositories does not run repository hooks: run `vertex-session <repo-dir>` by hand before the first check.

**What works.** `pnpm verify` and everything in it: lint, typecheck, the database-backed tests, build, migration drift and the E2E specs. The Electron clinic window cannot open (there is no display); the clinic runs in the browser (`dev`) and in the E2E.

**Commands.** The shell is bash, so set variables inline: `VITE_API_URL=http://localhost:3000 pnpm --filter @vertex-shifa/clinic dev`. OTP codes of the fake sender appear in the API's output, as locally.

**Pull requests.** `gh pr create` is refused in the cloud (GitHub's GraphQL API is blocked): push the branch and use the Create PR button instead.

**What stays local.** Real keys and secrets, the owner's manual acceptance test, production deploys, the Electron app on Windows and real WhatsApp sessions.

**Medical data.** The rules of `AGENTS.md` apply unchanged: synthetic data only, phone numbers under `+999`, no real patient, clinic or phone data in the session, its logs or its screenshots.

## References

- Getting the most out of Opus 5.5 — https://claude.dev/blog/getting-the-most-out-of-opus-5-5/
- What a task costs on Opus 5.5 — https://claude.dev/blog/what-a-task-costs-on-opus-5-5/
- Prompting Claude Opus 5.5 — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- Claude Code best practices — https://code.claude.com/docs/en/best-practices
- Claude Code memory — https://code.claude.com/docs/en/memory
- Claude Code costs — https://code.claude.com/docs/en/costs
- Model configuration — https://code.claude.com/docs/en/model-config
