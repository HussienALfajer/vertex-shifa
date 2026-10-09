# Working method

How Vertex Shifa is built with Claude Code (Opus 5.5). `AGENTS.md` holds the rules agents follow; this file explains the method for the owner and for agents that need detail. Decision: ADR 0019.

## Why it works this way

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
| 2 | Backend PR | Opus 5.5, `high` for sync, scheduling, tenancy, access, clinical records, contracts and the WhatsApp gateway; else `medium` | `/feature-slice <id>` | Approves the PR split and `TASKS.md`; may try endpoints at `/api/docs` | PR 1 (contracts, db, sync commands, api, worker) with auto-merge |
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
3. **Implement:** layer by layer with a check gate through the `checker` subagent after each layer.
4. **Review:** the `reviewer` subagent (fresh context) checks the branch against the spec and the rules; blocking issues only.
5. **Accept and open the PR:** the owner tries it; the agent follows "Finishing a task" in `AGENTS.md` in the same turn.

## How the instructions are layered

Each rule lives in one place and loads only when it is needed.

| Layer | Files | Loaded |
|---|---|---|
| Owner's personal preferences | `~/.claude/CLAUDE.md` (language) | Every session, every project |
| Project rules | `AGENTS.md`, `CLAUDE.md` (imports `AGENTS.md`), under 200 lines together | Every session |
| Folder rules | `<app or package>/CLAUDE.md` | When the agent reads a file in that folder |
| Product and decisions | `docs/product/`, `docs/decisions/`, `docs/specs/`, `docs/glossary.md` | On demand, the parts the task needs |
| Workflows | `.claude/skills/`: `spec`, `feature-slice`, `db-migration` | When invoked |
| Subagents | `.claude/agents/`: `checker` (Haiku 5.5), `reviewer` (Opus 5.5), `explorer` (Sonnet 5.5) | In their own context; only their summary returns |
| Enforcement | Biome hook, architecture and convention tests, CI, gitleaks *(Phase 0)* | Always, without costing context |
| Guard rails | `.claude/settings.json`: model and effort, permissions, denied reads of secrets and generated files | Always |

A rule a machine can check belongs in a test, lint rule or hook, not in prose. A rule for one folder belongs in that folder's `CLAUDE.md`.

## Anatomy of a good request

- **Goal:** what to build.
- **Reference:** which spec or ADR.
- **Scope:** what may change and what must not.
- **Finish line:** a checkable condition ("typecheck, lint and the module's tests pass; RTL screenshot attached").
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
| Running checks, reading logs and test output | `checker` subagent (Haiku 5.5) | — |
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
8. Let the `checker` subagent run long checks, so their output never enters the main context.
9. Check `/usage` after each feature: cache share should be high; output should be small relative to the change.
10. Run `/doctor prompt-audit` once per phase to prune instruction files.
11. Keep Claude Code updated (Haiku 5.5 subagents need v2.1.293 or later).

## Accounts and tools

- Switch Claude accounts between tasks, never in the middle of one: the prompt cache does not carry over.
- Other agents read `AGENTS.md` directly and can continue work when Claude limits are reached.
- Everything needed to resume lives in `docs/`, `TASKS.md` and git history.

## Cloud sessions

Cloud sessions (Claude Code on the web) get skills, subagents, hooks and settings from the repository. Phase 0 adds the setup and session scripts that give a cloud session the same toolchain and a disposable database, as in the owner's Vertex Digital project. What always stays local: production deploys, the owner's acceptance tests, the Electron app on Windows, real WhatsApp sessions and anything with real secrets.

## References

- Getting the most out of Opus 5.5 — https://claude.dev/blog/getting-the-most-out-of-opus-5-5/
- What a task costs on Opus 5.5 — https://claude.dev/blog/what-a-task-costs-on-opus-5-5/
- Prompting Claude Opus 5.5 — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- Claude Code best practices — https://code.claude.com/docs/en/best-practices
- Claude Code memory — https://code.claude.com/docs/en/memory
- Claude Code costs — https://code.claude.com/docs/en/costs
- Model configuration — https://code.claude.com/docs/en/model-config
