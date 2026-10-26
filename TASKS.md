# TASKS — S03 WhatsApp gateway and OTP

Spec: `docs/specs/S03-whatsapp-gateway-and-otp.md` (Approved 2026-10-20). Five PRs; each leaves `main` fully wired.

## PR 1 — crypto, contracts, database (`feat/s03-contracts-db`)
- [x] `packages/crypto`: `seal`, `open`, `keyedHash` moved from `apps/api` (ADR 0025); the API imports them
- [x] contracts: `messaging.ts` (schemas, session and message states, limits and warm-up caps, `sendBudget`, number choice, keyword matcher), `whatsapp-sessions.read` and `.manage` permissions, `WHATSAPP_SESSION_LIMIT`, `whatsapp_session.*` platform audit actions, `otp_challenges.delivery_status` and `opted_out` values; unit tests
- [x] i18n: `messaging` namespace (message texts), the error text, audit labels
- [x] db (`/db-migration`): `messaging.ts` tables (`whatsapp_sessions`, `_credentials`, `_session_events`, `_messages`, `_known_recipients`, `_opt_outs`), grants, `refuse_change()` on events, S02 table value changes; convention test; no drift
- [x] docs: architecture (`packages/crypto`; the module map already had S03's tables), AGENTS, folder `CLAUDE.md`s
- [x] bridge: OpenAPI and the console and clinic API types regenerated (new enum values and schemas)
- [x] checks, reviewer, acceptance, PR with auto-merge

## PR 2 — gateway runtime on the fake transport (`feat/s03-gateway`)
- [ ] config: `DATABASE_APP_URL`, messaging keys
- [ ] sessions: lease (take, renew, release, takeover), state transitions in the database, events, sealed QR, link timeout, duplicate number, `CredentialStore` in PostgreSQL (store keys as `key_hash`, a test that no stored row holds a `+999` phone)
- [ ] sending: claim with priority and `SKIP LOCKED` (only numbers whose gap has passed: `chooseWhatsAppNumber` may pick a known number whose `notBefore` is still ahead while another is ready), `NOTIFY` wake and 2 s poll, limits through `sendBudget`, failover, backoff, deadlines, auto-pause, receipts forward only, retry-request lookup
- [ ] incoming: known-recipient filter, keywords by time, auto-reply once per 24 h; alerts with the 30-minute throttle (`alert_sent` events carry the alert's event as `reason`); `whatsapp.message_finished.v1` into the tenant outbox; the sweep
- [ ] tests (fake transport, test database, two instances, logs carry no phone, body, code or QR)
- [ ] checks, reviewer, acceptance, PR with auto-merge

## PR 3 — Baileys transport (`feat/s03-baileys`)
- [ ] Baileys v7 pinned, `WEB_BROWSER`; mapping of events and disconnect codes; `logout`, `getMessage`, key store through `CredentialStore`; `WHATSAPP_TRANSPORT=baileys`, production refuses `fake`
- [ ] unit tests with recorded synthetic payloads; transport-boundary test
- [ ] checks, reviewer, acceptance (owner links a test number locally), PR with auto-merge

## PR 4 — API and worker (`feat/s03-api-worker`)
- [ ] api: gateway `OtpSender` (healthy-number check, sealed queued message, `NOTIFY`), `send({ challengeId, … })`, challenge status following the message, failed challenge without cooldown; `GET /api/auth/otp/{id}/delivery`; console `whatsapp-sessions` routes with re-auth, limit and audit; health read; tests
- [ ] worker: `messaging.send-invitation`, `access.update-invitation-message-status`; event catalog entries; tests with two tenants
- [ ] bridge: build, OpenAPI export, console and clinic clients regenerated
- [ ] checks, reviewer, acceptance, PR with auto-merge

## PR 5 — screens and E2E (`feat/s03-screens`)
- [ ] console: platform numbers, add-and-link dialog with QR, number detail, confirm dialogs through re-auth, health banner in `AppFrame`
- [ ] clinic: OTP delivery status line on the password sign-in, `opted_out` in the staff list and member detail
- [ ] E2E with mocked API, RTL screenshots light and dark at every size
- [ ] docs: ROADMAP, AGENTS commands table (gateway start)
- [ ] checks, reviewer, owner acceptance (spec "Acceptance"), PR with auto-merge

# TASKS — Test and CI speed (`chore/test-speed`)

The S03 items above belong to S03 and stay open. Model: vertex-hub PR 172, adapted (`docs/testing.md`).

- [x] Measure before: api, worker and db suites; each app's whole E2E suite
- [x] Vitest: `isolate: false` and worker caps measured on api, db and worker (no gain, isolation kept); two unordered audit reads ordered; stale `shifa_test_*` databases dropped
- [x] Playwright: traces on first retry in all four apps; the clinic logo test's wait covers the query's retries
- [x] Matrix: flows in one project and screenshots in all measured; the owner decides
- [x] turbo.json: `test:e2e` cached; remote cache signature
- [x] `pnpm verify`, `.verify/` ignored; test-guard hook and permission
- [x] Agent rules and docs: checker, feature-slice, db-migration, AGENTS, CLAUDE, workflow, folder rules, `docs/testing.md`
- [x] CI: E2E on four shards, TURBO_* env on the turbo jobs, cache comment corrected
- [x] Measure after, `pnpm verify`, reviewer, PR with auto-merge, Auto-fix
