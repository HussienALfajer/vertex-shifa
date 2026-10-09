# TASKS — Phase 0 clinic skeleton

Branch `feat/clinic-skeleton`. The `clinic` part of "App skeletons" (after `feat/whatsapp-gateway-skeleton`). Adds `apps/clinic`: React + Vite + TanStack Router renderer in an Electron shell, Arabic-first RTL (ADR 0008, ADR 0018, ADR 0020, ADR 0021). No sync client, local database, preload API or packaging yet: those arrive with S04 and their specs.

Design:
- **Renderer (`src/`):** ADR 0020 front-end layout: thin `routes/` (TanStack Router, file-based, `routeTree.gen.ts` generated), `features/<area>/`, app-wide `components/` and `lib/`. The root route sets the shell (header with the product name, "Powered by Vertex Shifa" always visible) and the error and not-found states, translated. TanStack Query arrives with the first online-only screen (ADR 0020), not now.
- **RTL and i18n:** `<html lang="ar" dir="rtl">`; every text through i18next from `packages/i18n` (new: the Arabic catalog by namespace, the locale `ar-u-nu-latn` for Latin digits). Logical CSS only, pinned by a source test on the app's CSS and TSX. Colors as CSS custom properties with light and dark values, local until the brand phase brings `packages/tokens` and `packages/ui` (ADR 0018).
- **Electron (`electron/`):** main process only, compiled by `tsc` to `dist/electron`. Secure window: `contextIsolation`, `sandbox`, no `nodeIntegration`, no preload yet; navigation and new windows refused; permission requests denied; a strict CSP. The built renderer is served from a privileged `app://clinic/` protocol with path containment and SPA fallback; development loads the Vite dev server. The database and sync live here later (ADR 0021): the renderer reaches them only through IPC.
- **Shared config:** `@vertex-shifa/config/tsconfig/react.json` (bundler resolution, DOM, JSX) with its test case; Biome override for the generated route tree is already in the root `files`.
- **E2E:** Playwright against `vite preview`: the shell renders RTL in Arabic with Latin digits; screenshots light and dark saved as attachments and uploaded by CI. Pixel baselines wait for a Linux reference (they differ per OS).

Checklist:
- [x] `packages/config`: `tsconfig/react.json`, export, test case
- [x] `packages/i18n`: package, `CLAUDE.md`, Arabic catalog (`common`, `clinic`), locale constants, catalog test
- [x] `apps/clinic`: package, tsconfigs (renderer, electron), Vite config, `index.html`, `CLAUDE.md`
- [x] Renderer: `main.tsx`, router, root route (shell, error, not found), index route, `lib/i18n.ts`, styles with light and dark variables
- [x] Electron: `main.ts` (window, protocol, navigation and permission guards, CSP), pure helpers with unit tests
- [x] Tests: logical-CSS source test; app protocol path resolution; navigation guard; i18n (no missing key, Latin digits)
- [x] E2E: Playwright config, RTL shell test with light and dark screenshots; root `test:e2e`; turbo task; CI step and artifact upload
- [x] `pnpm-workspace.yaml`: `allowBuilds` for `electron` (downloads its binary)
- [x] Launch the built Electron app once and probe it (app:// load, RTL, no Node in the renderer, navigation and window.open refused, traversal 404, CSP blocks inline script)
- [x] Docs: `docs/architecture.md`, `AGENTS.md` (stack line, commands), `docs/ROADMAP.md`, `packages/config/CLAUDE.md`
- [x] Review fixes: errors logged by name only (React root hooks, router `defaultOnCatch`, `console.error`/`warn` redaction) with a marker test; logical-CSS test catches physical shorthands, `translateX`, `background-position` and any inline `left:`, with samples proving each rule; window title through i18n (E2E checks it)
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
