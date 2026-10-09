# TASKS — Phase 0 patient skeleton

Branch `feat/patient-skeleton`. The `patient` part of "App skeletons" (after `feat/site-skeleton`). Adds `apps/patient`: the Vertex Shifa patient app as React Native + Expo (ADR 0003), Arabic-first RTL (ADR 0018, ADR 0020). No API calls, sign-in, secure storage or push yet: they arrive with S19 (account, booking, notifications).

Design:
- **Expo SDK 57** (latest stable), managed workflow, Expo Router with thin routes in `src/app/` (`_layout.tsx` with the shell and the route `ErrorBoundary`, `index.tsx` re-exporting `features/home/`, `+not-found.tsx`), app-wide `components/` and `lib/` (ADR 0020), copied from `apps/console` where it fits React Native. Native projects stay generated (`android/`, `ios/` git-ignored); EAS builds arrive with the store release.
- **RTL forced on start:** `extra.supportsRTL` and `extra.forcesRTL` in the app config (native, through `expo-localization`) and `I18nManager.allowRTL`/`forceRTL` at start (`lib/rtl.ts`, unit-tested with a fake manager). On web, `+html.tsx` sets `<html lang="ar" dir="rtl">`.
- **i18n:** a new `patient` namespace in `packages/i18n`; `react-i18next` with the same instance shape as the console; app name from the catalog in `app.config.ts`; Latin digits through `formatLocale`.
- **Errors:** logged by name only: `redactConsoleErrors(console)` and an `ErrorUtils` global handler that logs the label and passes on a redacted error; the route `ErrorBoundary` logs the label and never shows the message. Marker test.
- **Styles:** local light and dark colors (`useColorScheme`) and spacing until `packages/tokens` and `packages/ui-native` (ADR 0018); logical style properties only (`marginInlineStart`, `paddingBlock`, `insetInlineStart`…), pinned by a source test with samples. System fonts.
- **Checks:** typecheck (local React Native tsconfig), Vitest (pure modules and source tests), `build` = `expo export` for Android, iOS and web, so every bundle compiles. The web export exists only for tests (no PWA, ADR 0003): Playwright against `expo serve` on port 4176 (dev server 5176), RTL in Arabic, light and dark screenshots, not-found state.

Checklist:
- [x] `packages/i18n`: `patient` namespace, `CLAUDE.md`
- [x] `apps/patient`: package (Expo SDK 57 versions via `expo install`), app config, tsconfigs, Metro/Babel defaults, Vitest config, `CLAUDE.md`
- [x] App: `_layout.tsx` (shell, error boundary), `index.tsx`, `+not-found.tsx`, `+html.tsx`, `features/home/`, components (shell, states), `lib/i18n.ts`, `lib/error-logging.ts`, `lib/rtl.ts`, `lib/theme.ts`
- [x] Tests: error logging marker test; RTL start test; logical-style source test
- [x] E2E: Playwright config, a static server for the web export (`expo serve` has no not-found page), RTL shell test with light and dark screenshots; look at them
- [x] Docs: `docs/architecture.md`, `AGENTS.md` (stack line, commands), `docs/ROADMAP.md`; `packages/config` (Expo preset)
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
