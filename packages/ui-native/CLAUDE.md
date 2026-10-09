# packages/ui-native

The design system base for the patient app (React Native + Expo, ADR 0003, ADR 0018): the Vertex tokens from `packages/tokens` as a theme, and the first components in the shapes of `packages/ui`. Exports TypeScript sources, compiled by Metro.

## Layout
- `src/theme.tsx`: `ThemeProvider` (light or dark from the device's scheme; on web after mounting, as the export is rendered ahead in light) and `useTheme()` (`colors` from `lightColors`/`darkColors`, `space`, `radius`, `fontSize`, `fontWeight`).
- `src/button.tsx` (`Button`: primary or secondary, 6 px radius, works inside `<Link asChild>`), `src/card.tsx` (`Card`, `CardTitle`, `CardDescription`). Exported from `src/index.ts`.
- `test/conventions.test.ts`: over `packages/ui-native/src` and `apps/patient/src`: logical style properties only (`marginInlineStart`, `paddingBlock`, `insetInlineEnd`, `textAlign: 'auto'`, `flexDirection: 'row'`), no `Left`/`Right`/`Top`/`Bottom` properties, `Horizontal`/`Vertical` shorthands or `translateX`; no color literal in a component. Its samples prove each rule still matches.

## Rules
- Colors, spacing, radii and type sizes through `useTheme()`, never literals.
- No user-facing text inside components: labels come in as props.
- Fonts: system fonts for now. Montserrat and Noto Kufi Arabic on native need `expo-font` and the font files in the app (follow-up).
- New components arrive with their first real use (S19 brings the patient screens).

Run: `pnpm --filter @vertex-shifa/ui-native test` · `pnpm --filter @vertex-shifa/ui-native typecheck`.
