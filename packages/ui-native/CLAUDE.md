# packages/ui-native

The design system base for the patient app (React Native + Expo, ADR 0003, ADR 0018): the Vertex tokens from `packages/tokens` as a theme, and the first components in the shapes of `packages/ui`. Exports TypeScript sources, compiled by Metro.

## Layout
- `src/theme.tsx`: `ThemeProvider` (light or dark: the system's setting until the user presses the theme button, then the choice in `storage`, AsyncStorage in the app; on native nothing renders until the choice is read, so no screen shows the other theme first; on web the scheme applies after mounting, as the export is rendered ahead in light), `useTheme()` (`scheme`, `colors` from `lightColors`/`darkColors`, `space`, `radius`, `fontSize`, `fontWeight`) and `useThemeToggle()`. Pure rules in `src/theme-preference.ts` (same storage key as the web, ADR 0018).
- `src/theme-toggle.tsx` (`ThemeToggle`: the web's toggle, one icon button with a moon in light and a sun in dark from `lucide-react-native`, labels as props, for the header).
- `src/input.tsx` (`Input`; `useFocusChain(count, onSubmit)`: spread `field(index)` on each single-line field, the return key reads "next" and moves on, "done" on the last one runs the primary action; rule in `src/focus-chain.ts`). The web forms follow the same rule with Enter (`packages/ui` `Form`). A multiline field stays out of the chain.
- `src/button.tsx` (`Button`: primary or secondary, 6 px radius, works inside `<Link asChild>`), `src/card.tsx` (`Card`, `CardTitle`, `CardDescription`). Exported from `src/index.ts`.
- `test/rules.test.ts`: the theme states and the focus chain. `test/conventions.test.ts`: over `packages/ui-native/src` and `apps/patient/src`: logical style properties only (`marginInlineStart`, `paddingBlock`, `insetInlineEnd`, `textAlign: 'auto'`, `flexDirection: 'row'`), no `Left`/`Right`/`Top`/`Bottom` properties, `Horizontal`/`Vertical` shorthands or `translateX`; no color literal in a component. Its samples prove each rule still matches.

## Rules
- Colors, spacing, radii and type sizes through `useTheme()`, never literals.
- No user-facing text inside components: labels come in as props.
- Fonts: system fonts for now. Montserrat and Noto Kufi Arabic on native need `expo-font` and the font files in the app (follow-up).
- New components arrive with their first real use (S19 brings the patient screens). Exception: `Input` and `useFocusChain` came ahead of S19 with the shared form rules (owner, 2026-10-18); the first patient form uses them.

Run: `pnpm --filter @vertex-shifa/ui-native test` · `pnpm --filter @vertex-shifa/ui-native typecheck`.
