# packages/i18n

The Arabic text of every front end (ADR 0018, ADR 0020): plain catalogs and locale constants, no i18n library and no I/O, so the clinic, console and site apps and the patient app all read the same files. Each app wires its own i18n library to `ar`.

## Layout
- `src/ar/<namespace>.ts`, collected in `src/ar/index.ts` (`ar`, `Catalog`): `common` (shared by every product), `clinic` (`apps/clinic`), `console` (`apps/console`), `site` (`apps/site`), `patient` (`apps/patient`), `errors` (the text of each error code of `packages/contracts`), `messaging` (the WhatsApp texts the platform numbers send, S03, filled by the server apps). A new app or area adds a namespace file.
- `src/locale.ts`: `defaultLanguage` (`ar`), `textDirection` (`rtl`), `formatLocale` (`ar-SY-u-nu-latn`, Syrian Arabic month names with Latin digits) for every `Intl` formatter, `displayTimeZone` (`Asia/Damascus`), and `formatDateTime`, the one date-and-time style ("20 أيلول 2026، 1:00 م").
- `src/catalog.test.ts`: no empty text, no Arabic-Indic digit, a text for every error code, all six plural forms of every counted text, the exact date style.

## Rules
- Every text the user sees lives here; components never hold literal text.
- Digits are Latin, in text and through `formatLocale`; never format with a bare `ar` locale. Dates and times go through `formatDateTime`.
- A text with a counted noun takes `count` and has the six keys `<key>_zero`, `_one`, `_two`, `_few`, `_many`, `_other` (brand/identity.md §9), or a phrasing without a counted noun.
- Dialog dismiss buttons say "تراجع", never "إلغاء" or "رجوع".
- Never put medical data, real names or real phone numbers in a text or an example: interpolate them at run time.
- A new error code in `packages/contracts` gets its text in `errors.ts`; the `satisfies Record<ErrorCode, string>` and the test fail until it does.

Run: `pnpm --filter @vertex-shifa/i18n test`.
