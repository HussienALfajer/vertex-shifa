# TASKS — Phase 0 brand and design system

Branch `feat/brand-design-system`. The "Brand and design system" item of Phase 0 (ADR 0018). Copies the Vertex Hub identity, logo and design system (`D:\vertex-hub`, read only) and adapts them; nothing is imported across repositories. Moves the four front ends off their local styles.

Design:
- **`brand/`**: `identity.md` copied from Vertex Hub and adapted (Vertex Shifa naming and logo use, "Powered by Vertex Shifa", the agency workflow colors and glossary removed: status tones per domain state come with each spec), `README.md`, `logo/svg/` and `logo/png/`. The logo is the Vertex Hub logo with the knockout word **MEDIA** on the left stroke replaced by **SHIFA**: Montserrat Medium (the traced MEDIA matches it), same cap height, baseline, 60° angle, letter gap and center. Variants follow Vertex Hub's set: `currentColor`, green, gold, white; logo, mark, favicon, PWA/app icons. The original MEDIA rasters are not copied.
- **`packages/tokens`** (built to `dist/`, like `packages/i18n`): the identity in TypeScript: `palette` (tonal and status scales), `lightColors`/`darkColors` (the roles both platforms share), `space` (4 px grid), `radius`, `fontSize` with line heights, `fontWeight`, `fontFamily`, `motion`. Tests: palette equals the tables in `brand/identity.md`, brand colors at green-800 and gold-400, the measured contrast ratios.
- **`packages/ui`** (web, source exports like Vertex Hub, Tailwind CSS v4 + Base UI + `cva`): `styles/` (theme, base, fonts) and the Vertex Hub components copied and adapted: dark theme follows `prefers-color-scheme` (no theme toggle yet; Electron follows the OS), `'use client'` on interactive files so the Next.js site can render them, no Hub workflow `StatusBadge` and no Hub-only `platform-mark`/`color-swatch`, `VertexShifaLogo`/`VertexShifaMark` from a path module pinned to `brand/logo/svg` by a test. Tests: `theme.css` equals `packages/tokens`; Tailwind generates only brand utilities; the convention test (logical CSS and Tailwind classes, no colors outside the theme, the patterns to avoid) over `packages/ui/src` and the `src/` of clinic, console and site, replacing each app's `test/logical-css.test.ts`.
- **`packages/ui-native`** (base, source exports): `ThemeProvider`/`useTheme` (tokens' light and dark roles, `space`, `radius`, `fontSize`) replacing `apps/patient/src/lib/theme.tsx`, `Button` and `Card` for the screen states; the logical-styles convention test over `packages/ui-native/src` and `apps/patient/src`, replacing the patient's. System fonts for now (Montserrat/Noto Kufi on native need `expo-font`: follow-up).
- **Apps**: clinic and console add `@tailwindcss/vite`, site adds `@tailwindcss/postcss` and `transpilePackages`; each `styles.css` becomes `@import "tailwindcss"; @import "@vertex-shifa/ui/styles.css";`; the shell shows the Vertex Shifa mark, the product name and "Powered by Vertex Shifa"; states use `Card` and `Button`; favicon from `brand/`. Electron's CSP stays strict (styles and fonts are files from `'self'`). E2E screenshots light and dark updated and looked at.

Checklist:
- [x] `brand/`: identity, README, SHIFA logo SVGs, PNGs, favicon
- [x] `packages/tokens`: package, tokens, tests, `CLAUDE.md`
- [x] `packages/ui`: package, styles, components, brand (logo, ascent lines), tests, `CLAUDE.md`
- [x] `packages/ui-native`: package, theme provider, `Button`, `Card`, convention test, `CLAUDE.md`
- [x] `apps/clinic`, `apps/console`, `apps/site`: Tailwind, tokens and components, favicon; remove local styles and the app logical-CSS tests; folder `CLAUDE.md`
- [x] `apps/patient`: `packages/ui-native`; remove `lib/theme.tsx` and its logical-styles test; `CLAUDE.md`
- [x] E2E screenshots light and dark for the four apps; look at them
- [x] Docs: `docs/architecture.md`, `AGENTS.md` (stack line), `docs/ROADMAP.md`, `packages/config` if needed
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
