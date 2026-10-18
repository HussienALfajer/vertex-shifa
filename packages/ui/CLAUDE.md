# packages/ui

The Vertex design system for the web apps (clinic, console, site; ADR 0018): Vertex Hub's `packages/ui` copied and adapted, shadcn/ui patterns on Base UI, Tailwind CSS v4 tokens, Arabic-first RTL. Read `brand/identity.md` before changing anything visual. Exports TypeScript sources: Vite compiles them, and the site lists the package in `transpilePackages`.

## Layout
- `src/styles/theme.css`: the only place colors and design tokens are defined for the web (light and dark). Its values equal `packages/tokens` (`src/theme.test.ts`). `index.css` (what apps import after `tailwindcss` and their typefaces), `base.css`.
- Typefaces: `fonts-desktop.css` (clinic, console: `font-display: block`, the files preloaded, so text is drawn once in its font) and `fonts.css` (the site: `swap`, text never waits on a slow connection). Both declare the same nine faces of Montserrat and Noto Kufi Arabic from `@fontsource`, each with its `unicode-range` (`src/fonts.test.ts`); Madani Arabic is not provisioned. An app imports one: `@import "tailwindcss"; @import "@vertex-shifa/ui/fonts-desktop.css"; @import "@vertex-shifa/ui/styles.css";`.
- `src/theme/`: `theme.ts` (the storage key and `themeInitScript`; exported alone as `@vertex-shifa/ui/theme` for server code) and `use-theme.ts` (`useTheme`: `theme`, `setTheme`, `toggle`). `src/vite.ts` (`@vertex-shifa/ui/vite`, `vertexShifaWeb()`): serves and emits `theme-init.js`, adds it to `<head>`, and preloads the first screen's fonts in the build. It runs in Node as TypeScript when Vite loads the config, so its relative imports name `.ts` files (`allowImportingTsExtensions` in the tsconfigs that check it).
- `src/components/<name>.tsx`: one component family per file, exported from `src/index.ts`. Pattern to copy: `src/components/button.tsx` (Base UI primitive + `cva` variants + `cn`).
- `src/brand/`: `VertexShifaLogo`, `VertexShifaMark` (path data in `logo-shapes.ts`, pinned to `brand/logo/svg` by `logo.test.ts`) and the 60° `AscentLines` motif.

## Rules the tests enforce (`src/conventions.test.ts`, `src/theme.test.ts`)
- Over `packages/ui/src` and the `src/` of clinic, console and site: logical directions only, in Tailwind classes (no `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`…), stylesheets (no `margin-left`, `width`, `top`…, no physical 3- or 4-value shorthands) and inline styles; `@apply` in stylesheets too; no `translateX`, and `translate-x-*` only as an `ltr:`/`rtl:` pair.
- No hex, `rgb()`, `hsl()`, `oklch()` or `color-mix()` values outside `theme.css`.
- None of the patterns in `brand/identity.md` §8: gradients, backdrop blur, italic, letter spacing, uppercase, monospace.
- Tailwind's default palette, fonts, radii and shadows are reset: only brand tokens generate utilities.

## Theme (ADR 0018, amended 2026-10-18)
- Vertex Hub's toggle, copied as is: light or dark, the system's setting until the user presses the button, then the choice in `localStorage` (`vertex-theme`, the key the patient app uses too). `theme-init.js` puts the `dark` class on `<html>` before the first paint; the dark tokens (`.dark` in `theme.css`) and the `dark:` variant (`@custom-variant dark`) key on it.
- Vite apps add `vertexShifaWeb()` to their plugins; the site serves the script from `src/app/theme-init.js/route.ts` and loads it in `layout.tsx` (`<html suppressHydrationWarning>`). Never inline the script: the clinic's CSP allows scripts from `'self'` only.
- `ThemeToggle` (`labels={{ toDark, toLight }}`): one ghost icon button, a moon in light and a sun in dark, with a tooltip naming the theme it switches to; at the inline end of every app header.

## Forms (owner, 2026-10-18)
- Every form is a `Form`: `onSubmit` returns whether the values passed their checks (on `false` the focus goes to the first invalid control: `aria-invalid`, a `Field`'s `data-invalid`, or a group's `data-form-invalid`). Enter in a text field moves to the next field (inputs, textareas, select and combobox triggers, skipping disabled, inert and hidden ones); on the last field it clicks the one `type="submit"` button, so a disabled Save does nothing; Shift+Enter moves back. A textarea keeps its newline; buttons, toggles, select triggers, an open combobox (`aria-expanded="true"`) and any control that prevents Enter itself (the location picker's paste field) keep their Enter.
- Controls go in `FormFields`: while `busy` they are `inert`, without dimming or moving, and the focus waits on the submit button, which shows `loading` (a spinner over its label, same width, still focusable). `FormActions` holds the primary action first and its companions after it.
- Values through `useDraft`: Save is `disabled={!dirty || …}`; "Discard changes" (ghost) appears after Save only while `dirty`; after a save or a reload on conflict, `reset(saved values)`.
- Feedback: success is a `toast` (`Toaster` mounted once per app, `closeLabel` from i18n); a notice that needs attention (conflict, refusal) shows under the actions, never above the form, so nothing under the cursor moves.
- Leaving with unsaved changes asks through `UnsavedChangesDialog` ("Stay" focused, Escape stays): the app wires it to its router's blocker and to `beforeunload` (clinic: `components/unsaved-changes.tsx`).

## Layout and navigation
- `PageContainer` is the one column of an app: the header row, the navigation and every page sit in it, so their edges line up in RTL. Pages and state cards start at its start edge, never centered on their own.
- `PageHeader` takes `back`: a `BackButton` (`render={<Link …/>}`, labelled with where it goes, arrow to the inline start) on every sub-page.
- Wizards show a `Stepper`: one segment per step over its label; completed steps go back with `onSelect`, upcoming ones are not clickable.

## Rules to apply yourself
- Every app mounts `<DirectionProvider direction={textDirection}>` (from this package, `textDirection` from `@vertex-shifa/i18n`) around its tree: Base UI reads the direction from it, not from `<html dir>`, for keyboard navigation and logical placement.
- Build on Base UI primitives, keep their accessibility (focus rings, keyboard, ARIA), and use the `render` prop instead of wrapper elements (`<Button render={<Link to="/" />}>`).
- A file that uses hooks or a Base UI primitive starts with `'use client';` so the Next.js site can render it from server components.
- Every component sets `data-slot` (directly, or through `useRender` state as in `badge.tsx`), merges `className` with `cn`, and passes other props through.
- Variants through `cva` with semantic names (`tone`, `variant`, `size`), mapped to semantic tokens (`bg-primary`, `text-muted-foreground`), never to raw palette steps in app code.
- No user-facing text inside components: labels come in as props, so the app translates them.
- New components arrive with their first real use; the clinic-specific ones of ADR 0018 (queue board, odontogram, form fields, print templates, patient card, visit timeline, sync status) come with their specs. UI changes update the apps' E2E screenshots.

## Map (`src/components/location-picker.tsx`, ADR 0023)
- `LocationPicker` is the only map screens use: coordinates in (`center`, `value`), coordinates out (`onChange`), short links resolved by the app (`resolveShortLink`, `POST /api/maps/resolve-link`), labels as props. MapLibre and PMTiles never appear outside this file, so another provider is a new implementation of it.
- `map` (`MapConfig`) holds the style, PMTiles, glyph and worker URLs. Unset, or when the map errors before `load` or does not load within 10 s, only the paste field shows: saving never depends on the map. The "© OpenStreetMap" attribution is drawn by the component, not by MapLibre.
- MapLibre (with its stylesheet) loads lazily on the first map. MapLibre 6 shapes Arabic itself: no RTL text plugin. Its worker is a file the app serves (`import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'` in Vite), so the clinic CSP needs no blob worker; the app adds `maplibre-gl` to its dependencies for that import.
- Configuration: `VITE_MAP_STYLE_URL`, `VITE_MAP_TILES_URL`, `VITE_MAP_GLYPHS_URL`. The clinic's Electron main process allows their origins in `connect-src` (`apps/clinic/electron/app-protocol.ts`): HTTPS, or HTTP on `localhost`/`127.0.0.1`.
- Tests mock `maplibre-gl` (jsdom has no WebGL): `location-picker.test.tsx`.

### Local Azaz extract (development)
Not needed for tests or CI (they use the paste field). Run end to end on 2026-10-18 (go-pmtiles 1.31.2, `@protomaps/basemaps` 5.7.2, build 20261017, a 1.5 MB extract): Arabic street and place names render in the clinic's Electron app. Keep every file outside the repository.
1. Install the `pmtiles` CLI (github.com/protomaps/go-pmtiles releases). Take a recent daily build date from maps.protomaps.com/builds (only the last week is kept) and cut the Azaz area (bbox is min lon, min lat, max lon, max lat):
   `pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles azaz.pmtiles --bbox=36.9,36.5,37.2,36.7 --maxzoom=15`
2. Write `style.json` with `@protomaps/basemaps` (in a scratch folder, outside the repo): `layers('protomaps', namedFlavor('light'), { lang: 'ar' })` as `layers`, one source `protomaps: { type: 'vector', url: 'pmtiles://…' }` (the component replaces its URL with `VITE_MAP_TILES_URL`), and `sprite` pointing at a copy of `basemaps-assets/sprites/v4/light`.
3. Copy the glyphs from github.com/protomaps/basemaps-assets (`fonts/Noto Sans Regular`, `Noto Sans Medium`, `Noto Sans Italic`, `Noto Sans Devanagari Regular v1`; Arabic is in `1536-1791.pbf`), or let the local server fetch each glyph range from `https://protomaps.github.io/basemaps-assets/fonts/` once and keep it.
4. Serve the folder with a static server that answers range requests (`206`) and CORS: `Access-Control-Allow-Origin`, `Access-Control-Allow-Headers: range, if-match`, `Access-Control-Expose-Headers: etag`, OPTIONS answered. `pmtiles serve` does not serve the raw file. Check with `curl -i -H "Range: bytes=0-99" http://localhost:8080/azaz.pmtiles`.
5. Set, for `build` and `start` (or `dev`), `VITE_MAP_STYLE_URL=http://localhost:8080/style.json`, `VITE_MAP_TILES_URL=http://localhost:8080/azaz.pmtiles`, `VITE_MAP_GLYPHS_URL=http://localhost:8080/fonts/{fontstack}/{range}.pbf`. The extract, style and glyphs stay out of git.

Run: `pnpm --filter @vertex-shifa/ui test` · `pnpm --filter @vertex-shifa/ui typecheck`.
