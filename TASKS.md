# TASKS — Phase 0 WhatsApp gateway skeleton

Branch `feat/whatsapp-gateway-skeleton`. The `whatsapp-gateway` part of "App skeletons" (after `feat/worker-skeleton`). Adds `apps/whatsapp-gateway` (NestJS, ADR 0020 layout `transport/`, `sessions/`, `sending/`) with the `WhatsAppTransport` interface and a fake transport (ADR 0012, ADR 0022). No real WhatsApp session or message, no Baileys, no database: sessions, leases, counters and messages are S03's tables.

Design:
- **Process:** a Nest application context (no HTTP), like the worker. Config checked by Zod: `WHATSAPP_TRANSPORT`, only `fake` accepted until S03 adds `baileys`.
- **`transport/`:** `WhatsAppTransport` hides the library (ADR 0012). `connect(sessionId, credentials, events)` returns a `TransportConnection` (`sendText`, `close`). Events: `qr`, `open` (linked: connection open with the account set, ADR 0022), `close` with a transport-neutral `DisconnectReason` (`restart_required`, `logged_out`, `forbidden`, `connection_replaced`, `connection_lost`), `message` (1:1 text from a resolved phone number, live or missed while down, deduplicated by id downstream) and `receipt` (`sent`, `delivered`, `read`, `failed`). Credentials live in a `CredentialStore` the caller supplies (encrypted in the database from S03). Phone numbers are E.164. `FakeWhatsAppTransport` implements it in memory and lets tests drive a QR scan (with the real `515`-style restart), disconnects, incoming messages and receipts; it never logs a body or a number.
- **`sessions/`:** the ADR 0022 disconnect table as a pure rule (reason → state and reconnect now, with backoff 1 s doubling to 60 s, or never) and `SessionsService`, which opens sessions through the transport, tracks their state (`linking`, `connected`, `disconnected`, `needs_relink`, `banned`), applies the rule and closes every connection on shutdown. In memory until S03 adds the database lease and stored state.
- **`sending/`:** `SendingService.sendText` sends only through a connected session. Rate limits, the `messages` table and receipts' forward-only status are S03.
- **Boundary:** only `src/transport/` knows a concrete transport; `sessions/` and `sending/` use the `WHATSAPP_TRANSPORT` token and the interface. Pinned by a source test.

Checklist:
- [x] `apps/whatsapp-gateway`: package, tsconfig, `CLAUDE.md`; `main.ts`; `GatewayModule.forRoot(config)`
- [x] `src/core/config`: `WHATSAPP_TRANSPORT`, checked by Zod
- [x] `src/transport/`: `WhatsAppTransport` interface, `FakeWhatsAppTransport`, `TransportModule`
- [x] `src/sessions/`: disconnect rule, `SessionsService`
- [x] `src/sending/`: `SendingService`
- [x] Tests: config; fake transport contract; disconnect rule; sessions (link by QR with restart, reconnect with backoff, `440` never reconnects, `401`, `403`, shutdown); sending; transport boundary
- [x] Docs: `docs/architecture.md`, `AGENTS.md` (stack line, commands), `docs/ROADMAP.md`
- [x] Review fix: a repeated `515` before the session opens backs off (no tight loop), and a restart leaves `connected` so nothing sends during the reconnect; tests for both
- [x] Review finding recorded for S03: the interface gains the sent-content lookup for retry requests (ADR 0022) when Baileys arrives (interface doc, `CLAUDE.md`)
- [x] Checks through `checker`; `reviewer`; PR with auto-merge
