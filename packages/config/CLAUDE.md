# packages/config

Shared TypeScript and Biome configuration for every app and package (ADR 0002, ADR 0020).

## Layout
- `biome.json`: formatter and lint rules, extended by the root `biome.json` (which only sets the files to check: `docs/` and `spikes/` are left out).
- `tsconfig/base.json`: strict compiler options for all code. `tsconfig/node.json`: Node ESM (`NodeNext`), for packages and Node apps.
- `test/tsconfig.test.ts`: guards the settings that must never be loosened.

## Rules
- A package's `tsconfig.json` extends one of these (`@vertex-shifa/config/tsconfig/node.json`) and adds only paths and output options.
- Never loosen `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` or a lint rule to make a check pass: fix the code. A rule that must differ for one app goes in an `overrides` entry in `biome.json`, with the reason.
- New presets arrive with the first app that needs them (`nest.json` with `apps/api`, `react.json` with the first front end, Expo's with `apps/patient`), each with an export in `package.json` and a test case.

Run: `pnpm --filter @vertex-shifa/config test`.
