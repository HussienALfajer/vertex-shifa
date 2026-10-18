# packages/ui

The Vertex design system for the web apps (clinic, console, site; ADR 0018): Vertex Hub's `packages/ui` copied and adapted, shadcn/ui patterns on Base UI, Tailwind CSS v4 tokens, Arabic-first RTL. Read `brand/identity.md` before changing anything visual. Exports TypeScript sources: Vite compiles them, and the site lists the package in `transpilePackages`.

## Layout
- `src/styles/theme.css`: the only place colors and design tokens are defined for the web (light and dark; dark follows `prefers-color-scheme`). Its values equal `packages/tokens` (`src/theme.test.ts`). `index.css` (what apps import after `tailwindcss`), `fonts.css` (Montserrat and Noto Kufi Arabic; Madani Arabic is not provisioned), `base.css`.
- `src/components/<name>.tsx`: one component family per file, exported from `src/index.ts`. Pattern to copy: `src/components/button.tsx` (Base UI primitive + `cva` variants + `cn`).
- `src/brand/`: `VertexShifaLogo`, `VertexShifaMark` (path data in `logo-shapes.ts`, pinned to `brand/logo/svg` by `logo.test.ts`) and the 60° `AscentLines` motif.

## Rules the tests enforce (`src/conventions.test.ts`, `src/theme.test.ts`)
- Over `packages/ui/src` and the `src/` of clinic, console and site: logical directions only, in Tailwind classes (no `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`…), stylesheets (no `margin-left`, `width`, `top`…, no physical 3- or 4-value shorthands) and inline styles; `@apply` in stylesheets too; no `translateX`, and `translate-x-*` only as an `ltr:`/`rtl:` pair.
- No hex, `rgb()`, `hsl()`, `oklch()` or `color-mix()` values outside `theme.css`.
- None of the patterns in `brand/identity.md` §8: gradients, backdrop blur, italic, letter spacing, uppercase, monospace.
- Tailwind's default palette, fonts, radii and shadows are reset: only brand tokens generate utilities.

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
