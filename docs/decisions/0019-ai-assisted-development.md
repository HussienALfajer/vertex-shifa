# 0019 — Claude Code (Opus 5.5) as the primary developer

Status: Accepted · Date: 2026-10-09

## Context
The whole system is built by the owner working with Claude Code (Opus 5.5). Knowledge must survive session resets, compaction, account switches and tool switches. Cost is driven by turns × context size; per Anthropic's published Opus 5.5 pricing (checked 2026-10-09), output tokens cost five times input and cache reads cost 5% of input. The method follows Anthropic's published guidance for Opus 5.5 and Claude Code and the method proven in the owner's Vertex Digital project.

## Decision
- **Knowledge lives in files, not chat:** scope, ADRs, specs, roadmap, open questions, glossary and `TASKS.md`. A new session starts from files and git.
- **Instruction layers:** `AGENTS.md` (shared with other agents) and `CLAUDE.md` (imports it, Claude specifics), together under 200 lines; one `CLAUDE.md` per app and package for local rules; procedures live in skills, not in `CLAUDE.md`.
- **Skills:** `spec` (interview, then write the spec), `feature-slice` (implement layer by layer with gates, reviewer, acceptance, PR), `db-migration` (schema with RLS, migration review, tests).
- **Subagents:** `checker` on Haiku 5.5 (runs checks, returns failures only), `reviewer` on Opus 5.5 (fresh context, blocking issues only, isolation, privacy, sync and clinical checklist), `explorer` on Sonnet 5.5 (read-only research). Code is written only by the main Opus 5.5 session.
- **Enforcement over prose:** rules a machine can check are tests, lint rules, hooks or CI; prose rules are reviewed by the reviewer.
- **Model and effort:** Opus 5.5 at `medium` by default, `high` for specs and the sensitive areas listed in `CLAUDE.md`, `xhigh` for the sync protocol core, `low` for mechanical work; Fable 5.1 only for a problem that failed twice at `xhigh`. Agent teams, fast mode and `opusplan` are not used by default.
- **Session habits:** one task per session; model, effort and connectors set at the start and left alone; `/clear` between tasks; `/compact <what to keep>` at natural breaks; no pause longer than the cache lifetime mid-task; after two failed corrections, start again with a better request; `/usage` checked after each feature.
- **Requests** state the goal, the reference spec, the scope, a checkable finish line and the stop conditions; no "think hard" lines.
- **Every task ends** with its PR and a report whose last section gives the next session's model, effort and exact first message.
- **Safety:** agents never read secrets or real data; destructive, outward-facing and production actions need the owner's approval in the conversation.
- **Spikes first:** the two highest technical risks (offline sync, WhatsApp gateway) are tested in throwaway spikes before the code they shape.

## Consequences
- Switching sessions, accounts or tools costs little: the next session reads the files.
- Instruction files are pruned when behavior shows a rule is not needed; instruction audits (`/doctor prompt-audit`) run once per phase.
