# TASKS — Phase 0 monorepo scaffold

Branch `chore/monorepo-scaffold`. One PR: the workspace, shared configuration, checks and CI; no app or domain package yet (they arrive with their roadmap items).

- [x] pnpm workspace (`apps/*`, `packages/*`; `spikes/` stay outside), Turborepo tasks, `.node-version`
- [x] `packages/config`: strict `tsconfig` presets (base, node), Biome preset, a test guarding them, `CLAUDE.md`
- [x] Root Biome config (leaves out `docs/` and `spikes/`) and the Claude Code `PostToolUse` hook (`.claude/hooks/biome-format.mjs`)
- [x] `scripts/check-record.mjs` with `scripts/CLAUDE.md`
- [x] CI: typecheck, lint, test, build, production audit, migration drift (passes with a notice until `packages/db` exists), gitleaks over the full history; Dependabot for actions; `.github/CLAUDE.md`
- [x] Docs: commands table in `AGENTS.md`, `docs/architecture.md`, `docs/ROADMAP.md`

Left to the owner (the session's permission rules blocked repository settings changes); tracked as its own line in `docs/ROADMAP.md`:

- GitHub settings: auto-merge allowed, merge commits only, `main` protected with `Typecheck, lint, test, build` and `Secret scan` as required checks
