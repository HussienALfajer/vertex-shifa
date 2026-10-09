# Wiring checklist

Walk this list against the diff before closing a PR. Paths are completed by the Phase 0 scaffold; keep the list true as the code grows.

## Contracts
- [ ] Schemas exported from `packages/contracts/src/index.ts`, each API schema with `.meta({ id })`
- [ ] New error codes added with their Arabic text in `packages/i18n`
- [ ] New audit actions added with their labels
- [ ] State tables and pure rules fully unit-tested

## Database
- [ ] Schema file exported from `packages/db/src/schema/index.ts` and owned by one module (architecture test owner map)
- [ ] `tenant_id`, forced RLS policy, `tenant_id`-first indexes on tenant tables; append-only trigger and grants where the ADR says
- [ ] Migration generated, SQL reviewed (`/db-migration`), no drift

## Sync
- [ ] Commands defined in `packages/sync/src/commands/<module>.ts` and registered
- [ ] Server handlers registered; each declares access and entitlement
- [ ] The clinic's local schema and sync rules include the new tables (partial replication by tenant, branch, role)
- [ ] Number ranges allocated for any new human-readable number

## API and worker
- [ ] Module registered in the app module; public surface in `index.ts`
- [ ] Every route declares access and entitlement; console routes under `/api/console/`
- [ ] Events added to the event catalog with a version; consumers idempotent
- [ ] Jobs registered with their queue policy
- [ ] OpenAPI exported and clients regenerated

## Front ends
- [ ] Routes and navigation entries added; permission and entitlement checks for visibility
- [ ] i18n keys for every string; logical CSS; design-system components only
- [ ] Loading, empty, error and offline states
- [ ] E2E flow and RTL screenshots (light and dark)

## Docs
- [ ] `docs/ROADMAP.md`, `docs/architecture.md` (module map), folder `CLAUDE.md`, `docs/glossary.md`, commands table in `AGENTS.md` when changed

## Patterns to copy

Filled after the first feature ships.

| Layer | File to copy from |
|---|---|
