# TASKS — Phase 0 site skeleton

Branch `feat/site-skeleton`. The `site` part of "App skeletons" (after `feat/console-skeleton`). Adds `apps/site`: the public clinic pages as a Next.js (App Router) app, Arabic-first RTL (ADR 0018, ADR 0020). No API calls, tenant subdomains or custom domains yet: they arrive with the public booking pages (Phase 5).

Design:
- **Layout (ADR 0020):** thin `src/app/` routes (App Router: root layout, home page, not-found and error files), `features/<area>/`, app-wide `components/` and `lib/`, copied from `apps/console` where it fits Next.js. Server components by default; client components only where Next.js needs them (the error boundary).
- **RTL and i18n:** `<html lang="ar" dir="rtl">` in the root layout; every text through i18next from `packages/i18n` with a new `site` namespace, used directly (no `react-i18next`: server components have no React context); page title from the catalog through Next.js metadata; Latin digits. Logical CSS only, pinned by the same source test with samples. Local light and dark colors until `packages/tokens` and `packages/ui` (ADR 0018). System fonts only (`next/font/google` would fetch at build time).
- **Errors:** logged by name only, on the server (`instrumentation.ts` redacts `console.error`/`warn` before Next.js logs a request error) and in the browser (`instrumentation-client.ts`, and the error boundary logs the label), with a marker test.
- **Headers:** no `X-Powered-By`; security headers are set by the host at the first deploy (as for the console).
- **Ports:** dev 5175, `next start` 4175, so the clinic, console and site E2E servers run side by side under Turborepo.
- **E2E:** Playwright against `next start` after `next build`: shell RTL in Arabic with Latin digits, title from i18n, not-found state (HTTP 404); screenshots light and dark as attachments, uploaded by CI (`apps/*/test-results/`).

Checklist:
- [x] `packages/i18n`: `site` namespace, `CLAUDE.md`
- [x] `apps/site`: package, tsconfigs, Next.js and Vitest config, `CLAUDE.md`
- [x] App: root layout (shell, metadata), home page, `features/home/`, not-found and error files, `lib/i18n.ts`, `lib/error-logging.ts`, instrumentation (server and client), styles light and dark
- [x] Tests: error logging marker test; logical-CSS source test
- [x] E2E: Playwright config, RTL shell test with light and dark screenshots
- [x] Look at the screenshots (light, dark)
- [x] Docs: `docs/architecture.md`, `AGENTS.md` (stack line, commands), `docs/ROADMAP.md`; CI and Turborepo pass `NEXT_TELEMETRY_DISABLED`; `next-env.d.ts` git-ignored
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
