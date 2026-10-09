# TASKS — Phase 0 console skeleton

Branch `feat/console-skeleton`. The `console` part of "App skeletons" (after `feat/clinic-skeleton`). Adds `apps/console`: the platform back office as a React + Vite + TanStack Router web app, Arabic-first RTL (ADR 0018, ADR 0020). No API calls, sign-in (console accounts with TOTP) or TanStack Query yet: they arrive with S22 and the go-live items.

Design:
- **Layout (ADR 0020):** thin `routes/` (TanStack Router, file-based, `routeTree.gen.ts` generated), `features/<area>/`, app-wide `components/` and `lib/`, copied from `apps/clinic` minus Electron. The root route sets the shell (product name, console label, "Powered by Vertex Shifa" always visible) and the error and not-found states, translated.
- **RTL and i18n:** `<html lang="ar" dir="rtl">`; every text through i18next from `packages/i18n` with a new `console` namespace; Latin digits. Logical CSS only, pinned by a source test with samples. Local light and dark colors until `packages/tokens` and `packages/ui` (ADR 0018); the duplicated shell, styles and source tests move there with the design system.
- **Errors:** logged by name only (React root hooks, router `defaultOnCatch`, `console.error`/`warn` redaction), with a marker test: support access (S22) will show tenant data here.
- **Ports:** dev 5174, preview 4174, so the console and clinic E2E servers run side by side under Turborepo.
- **E2E:** Playwright against `vite preview`: shell RTL in Arabic with Latin digits, title from i18n, not-found state; screenshots light and dark as attachments, uploaded by CI (`apps/*/test-results/`).

Checklist:
- [x] `packages/i18n`: `console` namespace, `CLAUDE.md`
- [x] `apps/console`: package, tsconfigs, Vite and Vitest config, `index.html`, `CLAUDE.md`
- [x] Renderer: `main.tsx`, root route (shell, error, not found), index route, `features/home/`, `lib/i18n.ts`, `lib/error-logging.ts`, styles light and dark
- [x] Tests: error logging marker test; logical-CSS source test
- [x] E2E: Playwright config, RTL shell test with light and dark screenshots
- [x] Look at the screenshots (light, dark)
- [x] Docs: `docs/architecture.md`, `AGENTS.md` (stack line, commands), `docs/ROADMAP.md`, CI comment
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
