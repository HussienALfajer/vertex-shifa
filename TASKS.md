# TASKS — Phase 0 `apps/api` skeleton

Branch `feat/api-skeleton`. First of three PRs for the API and worker part of "App skeletons" (then `feat/outbox-jobs-role`, then `feat/worker-skeleton`). Decisions approved by the owner: the health check lives in `core/health/` (`health` is a layer name); every route declares `@RequiresFeature(key)` or `@NoFeature()`; the OpenAPI document is generated from the Zod contracts and checked for drift.

- [x] `packages/config`: `tsconfig/nest.json` preset (decorators), export and test case
- [x] `packages/contracts`: `SERVICE_UNAVAILABLE` error code; `health-check.ts` response schema
- [x] `packages/db`: `createTestDatabase()` for apps' integration tests; the db global setup uses it
- [x] `apps/api` core: config (Zod env), database module (`createDatabase`, pool closed on shutdown), error filter (codes from contracts, no data in logs), access and entitlement decorators with a fail-closed guard, response serialization through contract schemas
- [x] `apps/api` health check: `GET /api/health` (database reachable)
- [x] Architecture test: every route declares access and entitlement; console routes under `/api/console/`; module layers and `index.ts` boundaries (static scan), with cases proving each rule catches a violation
- [x] OpenAPI: document generated from the routes and contract schemas; committed `openapi.json` and a drift test
- [x] Integration tests over HTTP: health, guard refusals, error mapping, unknown route
- [x] `apps/api/CLAUDE.md`; docs: `AGENTS.md` commands, `docs/architecture.md`, ADR 0020 paths if stale, `.github` (OpenAPI drift), `docs/ROADMAP.md`

Reviewer findings (blocking):
- [x] Error filter echoed request data (URL, query, JSON parse text) in `message`: fixed messages per code, tests assert no echo
- [x] `listRoutes` skips inherited handlers: walks the prototype chain (as `MetadataScanner.getAllMethodNames`); broken-example case
- [x] `listRoutes` ignores `RouterModule` module paths: now includes them (as `RoutesResolver`); broken-example case
- [x] Architecture rules: flag handlers using `@Res()`/`@Next()` (they skip the serializer); scan `module.injectables` and `module.middlewares` in the `@Inject` check; broken-example cases
