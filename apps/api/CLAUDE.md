# apps/api

The NestJS API (ADR 0002, ADR 0020): REST under `/api`, Express, ESM, on Node 24. Every route goes through the core: access guard, error filter, response serialization through its contract schema.

## Layout
- `src/main.ts` starts the process; `src/app.module.ts` (`AppModule.forRoot(config)`) imports the core and every module; `src/app.ts` (`configureApp`) holds what production and tests both apply (prefix, shutdown hooks).
- `src/core/config/`: the environment checked by Zod at start-up (`loadConfig`), provided as `CONFIG`.
- `src/core/database/`: `DATABASE`, the one Drizzle database of the process, connected as the app role; the pool closes on shutdown.
- `src/core/access/`: `@Public()`, `@PatientRoute()`, `@StaffRoute(permission)`, `@ConsoleRoute(permission)`, `@RequiresFeature(key)`, `@NoFeature()`, and `AccessGuard`, global and fail-closed.
- `src/core/errors/`: `ErrorFilter` (every error leaves as `{ code, message }` with the status of its code). `describeForLog` (what an unexpected error may write to the log) comes from `@vertex-shifa/db`, shared with the worker.
- `src/core/health/`: `GET /api/health` (in the core because `health` is a layer name).
- `src/core/routes.ts` (`listRoutes`) and `src/core/openapi/` (`buildOpenApiDocument`): the routes with their declarations, and the OpenAPI 3.1 document built from them and the contracts.
- `src/modules/<platform|health|clinic>/<module>/`: one folder per module (ADR 0020 anatomy). The pattern to copy is the first module, S01 tenancy; until then, `core/health/` shows a controller.
- `test/`: integration tests over HTTP against a fresh migrated database per run (`test/global-setup.ts`, `createTestApp` in `test/app.ts`); `test/architecture/` the architecture test; `test/openapi.test.ts` the drift test. Unit tests sit next to the code (`*.test.ts`).
- `openapi.json`: the committed OpenAPI document, generated; never edit it by hand.

## Rules
- Every route declares one access decorator and one entitlement decorator (`@RequiresFeature(key)` or `@NoFeature()`), on the handler or its controller, and its response schema with `@SerializeOptions({ schema })`, a contract schema with `.meta({ id })`. The serializer answers only the schema's fields, so handlers never take `@Res()` or `@Next()`. Console routes, and only they, live under `/api/console/`, in `<module>.console.controller.ts`. The architecture test enforces the declarations, the schema, the console path (including `RouterModule` paths and inherited handlers) and the absence of `@Res()`/`@Next()`.
- Until S02 (sessions) and S05 (entitlements), the guard refuses every non-public route with `UNAUTHENTICATED` and every route needing a feature with `NOT_ENTITLED`. Those specs replace the refusals with real checks; they never loosen the fail-closed default.
- Injection is always explicit: `constructor(@Inject(TOKEN) private readonly x: X)`. No decorator metadata is emitted (`@vertex-shifa/config/tsconfig/nest.json`), so an implicit parameter would be `undefined`; the architecture test catches it in providers, controllers, guards, interceptors, pipes, filters and middleware.
- Tenant data only inside `withTenant(db, tenantId, tx => …)` from `@vertex-shifa/db`, with the tenant from the session or device, never from the request body or query (ADR 0004).
- A business refusal throws `DomainError(code, message)` from `@vertex-shifa/contracts`; the message is English, for logs, and carries ids at most, never medical data. Never log request bodies, query parameters or a database error's message: use `describeForLog`.
- Modules reach each other only through `index.ts`, and only in their own layer or below (clinic → health → platform); the core imports no module. The architecture test enforces this.
- A change to a route or a contract schema changes `openapi.json`: regenerate it with `pnpm --filter @vertex-shifa/api exec vitest run -u test/openapi.test.ts` and review the diff.

Run: `pnpm --filter @vertex-shifa/api test` (needs the local database, `packages/db/CLAUDE.md`).
