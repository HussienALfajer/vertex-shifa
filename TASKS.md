# TASKS — S01 Tenancy and clinic setup

Spec: `docs/specs/S01-tenancy-and-clinic-setup.md` (Approved). Online only: no sync commands, no worker jobs, no outbox events. Three PRs, each leaving `main` whole.

## PR 1 — `feat/s01-tenancy-api`: contracts, database, API, CLI
- [x] Contracts: `phone.ts` (Syrian and Turkish E.164, local forms, mobile vs landline, WhatsApp only on mobile), `tenancy.ts` (tenant, status and transition table, profile, logo, facility, area, working-days codec, coordinates e7 codec and Google Maps URL parser), the six new error codes, the S01 audit actions; unit tests; Arabic error texts in `packages/i18n`
- [x] Database (`/db-migration`): `tenants`, `tenant_logos`, `facilities`, `areas`, `archivedAt` column helper, registry entries (module `tenancy`), forced RLS on tenant tables, grants, areas seed migration (14 governorates, Aleppo governorate cities); convention test and seed test; migration drift
- [x] API module `modules/platform/tenancy/`: controllers (staff, console), service (tenant context, audit in the transaction, `updated_at` conflict, status writes refused when suspended or closed, onboarding rules, `LAST_ACTIVE_FACILITY`, directory listing), logo re-encoding (size limit, pixel limit, PNG only, metadata stripped), map link resolver (host allow list, 3 redirects, 5 s timeout, 20/min per tenant); `@NoFeature()` and access decorators on every route; registered in `app.module.ts`
- [x] API tests: 401 for every route; service tests with a tenant context (success, another tenant → `NOT_FOUND`, suspended/closed refusals, `CONFLICT`, onboarding, last branch, logo cases, resolver against a fake HTTP server, listed-but-suspended reported as not shown); architecture test; `openapi.json` regenerated
- [x] CLI `apps/api/src/cli/`: `tenant:create`, `tenant:list`, `tenant:set-status`, `tenant:set-directory` (actor `system`), tests; command added to the `AGENTS.md` table
- [x] `status_reason` on `tenants` (owner, 2026-10-18), spec updated
- [x] Wiring checklist; docs (`docs/architecture.md` module map, `apps/api/CLAUDE.md` pattern to copy, `packages/db/CLAUDE.md`, `docs/glossary.md` if terms are new, `wiring.md` patterns table)
- [x] External audit fixes: strictly advancing `updatedAt`, CLI hides unexpected errors, short links over TLS only, Syrian area codes, OpenAPI success statuses, list `sort`/`order`, `GET /api/areas/:id`, full `tenant_logos` FK index (migration 0008) and convention test, cumulative-timeout and redirect tests
- [x] Checks (`checker`), `reviewer`, owner acceptance (CLI steps 1–2), PR with auto-merge

## PR 2 — `feat/s01-map-component`: web map in `packages/ui`
- [x] `packages/ui` map component (MapLibre; center, pin, on-change, attribution; tile, style and glyph URLs from config; falls back to the paste field when unset or failing); unit tests
- [x] Clinic CSP widened for the map host only (MapLibre 6 runs its worker from the app, so no blob workers; ADR 0023); local Azaz extract documented in `packages/ui/CLAUDE.md`
- [x] Checks (`checker`), `reviewer`, external audit fixes (CSP host check, short-link races, retry, camera, cleared value, pin name), owner acceptance, PR with auto-merge

## PR 3 — `feat/s01-clinic-setup-screens`: clinic screens and E2E
- [ ] Bridge: `pnpm build`, OpenAPI client for the clinic app; TanStack Query added (first online-only screen)
- [ ] Screens: onboarding wizard (5 steps), setup in progress, clinic settings, branches, branch settings / location, directory status, suspended or closed banner; loading, error and offline states; i18n keys
- [ ] E2E with a mocked API: wizard end to end (paste field), settings, branch list with one and two branches, offline, read-only banner; RTL screenshots light and dark, looked at
- [ ] Map wiring: `VITE_MAP_*` read by the renderer, `maplibre-gl` added to the clinic for the worker URL (`?url`), and a decision on how the ODbL licence page is reachable (the attribution is plain text; Electron blocks outside links)
- [ ] Docs: `apps/clinic/CLAUDE.md`, `docs/ROADMAP.md` (S01 done)
- [ ] Checks (`checker`), `reviewer`, owner acceptance (screenshots), PR with auto-merge
