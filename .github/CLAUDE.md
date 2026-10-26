# .github

CI for every pull request and for `main` (`workflows/ci.yml`), and Dependabot for the pinned actions.

## Rules
- Third-party actions are pinned to a full commit SHA with the tag in a comment; Dependabot proposes updates.
- The job names (`Typecheck, lint, test, build` and `Secret scan`) are the required status checks of `main`. Renaming or splitting a job means updating the branch protection in the same PR, with the owner's approval.
- A step arrives with its first subject: the E2E job with the first front end. It runs on four shards (`pnpm turbo run test:e2e -- --shard=N/4`, the root `test:e2e` with Playwright's shard argument), each a job `E2E shard N` behind the required gate, and installs Chromium without `--with-deps` (the runner image has its libraries). OpenAPI drift needs no step: `apps/api/test/openapi.test.ts` compares the generated document with the committed `apps/api/openapi.json` inside `pnpm test`.
- The checks job runs a throwaway PostgreSQL 17 service with fake passwords in the job's `env`; `pnpm db:setup-local` creates the roles, `pnpm db:migrate` applies the migrations, the `packages/db` tests make their own database, and the drift step regenerates the migrations and fails on any change.
- CI runs the same root commands as the `AGENTS.md` commands table; a new check gets a root script first, then a step here.
- No secrets in workflows beyond `GITHUB_TOKEN` and the Turborepo remote cache's `TURBO_TOKEN` and `TURBO_REMOTE_CACHE_SIGNATURE_KEY`, read only by the jobs that run turbo and unset until the owner turns the cache on (`docs/testing.md`); deploys never run from CI without an ADR.
