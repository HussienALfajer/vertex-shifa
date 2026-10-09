# packages/contracts

Zod schemas and pure rules shared by every app, the patient app included (ADR 0002, ADR 0020). No I/O, no Node APIs (`tsconfig.json` loads no Node types), fully unit-tested.

## Layout
- `src/<module>.ts` with `src/<module>.test.ts` next to it; `src/index.ts` re-exports every file.
- `errors.ts`: stable error codes with their HTTP status, `errorResponseSchema`, `DomainError`. The pattern to copy for a schema: `errorResponseSchema`.
- `money.ts`: currencies, `moneySchema`, `exchangeRateSchema`, arithmetic, conversion, parsing and formatting (ADR 0014).
- `arabic-names.ts`: `normalizeArabicName`, the key for name search and duplicate matching (ADR 0006).
- `health-check.ts`: the answer of `GET /api/health`.

## Rules
- Schemas `<thing>Schema`, types `Thing = z.infer<…>`, inputs `create<Thing>Schema`; every schema the API exposes has a stable `.meta({ id })`.
- Error codes are upper snake case and never renamed or removed: offline devices on older versions still read them. A new code gets its HTTP status in `errorStatus` and its Arabic text in `packages/i18n`.
- Money is whole minor units in a JavaScript safe integer with a currency (stored as `bigint`). Never floats, never `Number` division on amounts: use the functions in `money.ts`, which refuse what they cannot represent instead of rounding. Conversion rounds half away from zero; the caller stores the rate it used.
- A refusal by a business rule throws `DomainError` with a code; input that fails a schema throws Zod's error.
- The name key is for comparison only; what the person typed is what gets stored and shown.

Run: `pnpm --filter @vertex-shifa/contracts test`.
