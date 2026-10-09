# TASKS — Phase 0 foundation documents

Branch `docs/foundation`. One PR, documents and Claude Code setup only; no code. The owner reviews and approves before merge (it adds the ADRs and the V1 scope).

- [x] Repository: `D:\vertex-shifa`, public GitHub `HussienALfajer/vertex-shifa`, initial commit (README, LICENSE, git ignore and attributes)
- [x] `AGENTS.md` and `CLAUDE.md` (under 200 lines together)
- [x] `docs/product/vision.md` and `docs/product/v1-scope.md` (F01–F40)
- [x] `docs/decisions/` 0001–0020 and index
- [x] `docs/architecture.md`, `docs/glossary.md`, `docs/ROADMAP.md`, `docs/open-questions.md`, `docs/workflow.md`, `docs/specs/_template.md`
- [x] `.claude/settings.json`; subagents `checker`, `reviewer`, `explorer`; skills `spec`, `feature-slice` (with `wiring.md`), `db-migration`
- [x] Fresh-context review by the `reviewer` subagent; its 14 findings fixed (patient link confirmation, local read audit, correction versions, work queues vs append-only tables, reception conflicts between offline devices, suspension wording, F22 exceptions, currency exponents, references, settings deny rules, dated facts)

After the PR: the owner approves, then the PR is merged.
