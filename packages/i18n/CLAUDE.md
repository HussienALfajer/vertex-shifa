# packages/i18n

The Arabic text of every front end (ADR 0018, ADR 0020): plain catalogs and locale constants, no i18n library and no I/O, so the clinic, console and site apps and the patient app all read the same files. Each app wires its own i18n library to `ar`.

## Layout
- `src/ar/<namespace>.ts`, collected in `src/ar/index.ts` (`ar`, `Catalog`): `common` (shared by every product), `clinic` (`apps/clinic`), `console` (`apps/console`), `errors` (the text of each error code of `packages/contracts`). A new app or area adds a namespace file.
- `src/locale.ts`: `defaultLanguage` (`ar`), `textDirection` (`rtl`), `formatLocale` (`ar-u-nu-latn`, Arabic with Latin digits) for every `Intl` formatter.
- `src/catalog.test.ts`: no empty text, no Arabic-Indic digit, a text for every error code.

## Rules
- Every text the user sees lives here; components never hold literal text.
- Digits are Latin, in text and through `formatLocale`; never format with a bare `ar` locale.
- Never put medical data, real names or real phone numbers in a text or an example: interpolate them at run time.
- A new error code in `packages/contracts` gets its text in `errors.ts`; the `satisfies Record<ErrorCode, string>` and the test fail until it does.

Run: `pnpm --filter @vertex-shifa/i18n test`.
