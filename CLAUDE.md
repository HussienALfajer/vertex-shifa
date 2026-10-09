@AGENTS.md

# Claude Code specifics

## Model and effort

- Default: Opus 5.5 at `medium` (`.claude/settings.json`). Use `high` for specs and for sync, scheduling, tenancy and RLS, access, clinical records, contracts and entitlements, and the WhatsApp gateway; `xhigh` for the sync protocol core; `low` for mechanical edits (renames, applying a known pattern, translation keys).
- Set model and effort at session start. Don't switch models mid-session: it drops the prompt cache.
- If the same problem fails twice at `xhigh`, say so and suggest Fable 5.1 for that problem only.
- Don't write "think hard" or "step by step" in prompts or skills: effort controls depth.

## Delegation

- `checker` subagent (Haiku 5.5): runs typecheck, lint and tests and returns only the failures. Use it instead of reading long check output in the main session.
- `reviewer` subagent (Opus 5.5, fresh context): reviews the branch against its spec and the rules, with a tenant-isolation, medical-privacy, offline-sync and clinical-integrity checklist; blocking issues only. Use it at the review step of every feature.
- `explorer` subagent (Sonnet 5.5): read-only searches across many files, docs or the web, when only the conclusion is needed. It never writes code.
- Code is written by the main session on Opus 5.5, never by Sonnet or Haiku.

## Skills

- `/spec <id>`: interview the owner, then write `docs/specs/<id>-<name>.md`.
- `/feature-slice <id>`: implement an approved spec layer by layer with a check gate per layer, the reviewer and the owner's acceptance, then open the PR with auto-merge.
- `/db-migration <change>`: change the schema with RLS, generate and review the migration, test it.

## Context hygiene

- One spec PR or task per session. Suggest `/clear` when the owner moves to unrelated work.
- Don't load all of `docs/` up front. Read what the current task needs.
- Folder rules load on their own: each app and package has a `CLAUDE.md` that Claude Code reads when you open a file there.
- Side questions go through `/btw`.

## Feature workflow

`/spec` (own session, `high`, ends with the spec PR) → `/feature-slice` (one session per PR: plan, implement, `reviewer`, owner acceptance, PR with auto-merge, `docs/ROADMAP.md` updated). Deploys happen once per phase, in their own session. Details: `docs/workflow.md`.

## Compaction

When compacting, keep: the current spec and its path, files changed, failing checks with their exact commands, open decisions, and the state of `TASKS.md`.
