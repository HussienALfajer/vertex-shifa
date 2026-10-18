# TASKS — UX foundations (`feat/ux-foundations`)

Cross-cutting PR before S02, from the owner's manual test of the S01 clinic screens (2026-10-18). No spec: the owner's decisions are in the brief. Amends ADR 0018 (theme toggle), so auto-merge waits for the owner's approval.

## packages/ui (first, with unit tests)
- [x] Theme (owner, 2026-10-18: Vertex Hub's toggle exactly, replacing the three states): the `dark` class on `<html>` from the saved choice or the system; `themeInitScript` (synchronous, from `'self'`); `useTheme`; `ThemeToggle` (one moon/sun icon button with a tooltip)
- [x] Vite plugin `@vertex-shifa/ui/vite`: serves and emits `theme-init.js`, adds it to `<head>`, preloads the first screen's fonts in the build
- [x] Fonts: own `@font-face` with `unicode-range`; `fonts-desktop.css` with `font-display: block` (clinic, console), `fonts.css` with `swap` (site); test keeps them the same faces
- [x] `Form` (Enter → next field, Shift+Enter → previous, last field → primary action; textareas, open popups and handled keys keep their Enter; locks its fields with `inert` while busy, focus kept on the submit button), `FormFields`, `FormActions`
- [x] `useDraft` (dirty against a baseline, discard, rebase after save)
- [x] `Button` `loading` (spinner, same width)
- [x] `UnsavedChangesDialog` (Stay / Leave without saving)
- [x] `Stepper` (segments aligned with labels; completed, current, upcoming; completed clickable)
- [x] `PageContainer`; `PageHeader` `back` slot; `BackButton` (arrow points to the inline start)
- [x] `Toaster` mounted by the apps; success through the toast
- [x] `packages/ui/CLAUDE.md`: theme, fonts, forms (Enter rule, save and discard, unsaved changes, feedback), layout, stepper

## packages/ui-native
- [x] `ThemeProvider`: the system's setting until the button is pressed, the choice persisted through a `storage` prop, applied before the first render on native; `useThemeToggle`; `ThemeToggle` (moon/sun icon button, `lucide-react-native`)
- [x] `Input` and `useFocusChain` (`returnKeyType` next/done, focus chaining); pure rules tested
- [x] `packages/ui-native/CLAUDE.md`

## Apps
- [x] i18n: theme, unsaved changes, discard, back, toast close (common); clinic texts
- [x] Clinic: Vite plugin, `fonts-desktop.css`, `ThemeToggle` in the header, `PageContainer` in the shell (header, nav, content share edges), `StateCard` start-aligned, `Toaster`
- [x] Clinic forms on `Form` + `useDraft`: clinic settings, branch / location, new branch, wizard; toast on save; notices below the actions; first invalid field focused
- [x] Clinic: unsaved-changes guard (router blocker + `beforeunload`), Electron `will-prevent-unload` dialog, Alt+Left / Alt+Right
- [x] Clinic: back action on sub-pages (branch → branches, new branch → list, settings → home); wizard `Stepper`
- [x] Console: Vite plugin, fonts, toggle, `PageContainer`
- [x] Site: `theme-init.js` route, script in `<head>`, toggle, `PageContainer`
- [x] Patient: AsyncStorage, `ThemeProvider` storage, toggle in the header
- [x] ADR 0018 amendment; `docs/ROADMAP.md`; app `CLAUDE.md` files; `docs/architecture.md` if stale

## Verification
- [x] E2E: Enter navigation, save toast and no layout shift, discard, unsaved-changes dialog, back actions, stepper, theme toggle following the system then persisted across reload; RTL screenshots light and dark, looked at
- [x] Fonts: the built renderer reloaded in Chromium (E2E `fonts`): six preloads, all used, faces loaded; the Electron window itself is checked at owner acceptance
- [x] Shell at 960 px (window minimum) and 1920 px: no overflow, header, nav and page edges aligned (E2E)
- [x] Checks (`checker`), `reviewer`, owner acceptance (screenshots; the owner asked for Vertex Hub's toggle, then the PR with auto-merge), PR; auto-merge after the owner approves the ADR 0018 amendment
