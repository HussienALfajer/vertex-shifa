# packages/tokens

The Vertex design tokens in TypeScript (ADR 0018), shared by `packages/ui` (web) and `packages/ui-native` (patient app). Values come from `brand/identity.md`; if they disagree, the identity wins and the tests fail.

## Layout
- `src/palette.ts`: the tonal scales (green, gold, neutral) and the status scales (success, warning, danger, info). Vertex Green is `green[800]`, Vertex Sand `gold[400]`.
- `src/semantic.ts`: `lightColors` and `darkColors`, the semantic roles both platforms share (background, surface, primary, accent, destructive, ring…), each a palette color.
- `src/scale.ts`: `space` (4 px grid), `radius`, `fontSize` with line heights, `fontWeight`, `fontFamily`, `motion` (px and ms).
- `src/tokens.test.ts`: the palette equals the identity's tables; brand colors in place; the measured contrast ratios; semantic roles use palette colors and keep text readable in both themes; the type scale and radii match.

## Rules
- Change the identity first (`brand/identity.md`, and Vertex Hub's when the change is shared), then these values, then `packages/ui/src/styles/theme.css`; the tests of this package and of `packages/ui` hold them together.
- Apps never import palette steps for UI: they use semantic roles (`colors.primary`, `bg-primary`).
- Plain values only: no React, no platform code. Built to `dist/` like `packages/i18n`.

Run: `pnpm --filter @vertex-shifa/tokens test`.
