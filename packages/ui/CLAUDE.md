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

Run: `pnpm --filter @vertex-shifa/ui test` · `pnpm --filter @vertex-shifa/ui typecheck`.
