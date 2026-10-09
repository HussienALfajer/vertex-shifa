# apps/whatsapp-gateway

The WhatsApp gateway (ADR 0012, ADR 0022, layout ADR 0020): a long-running NestJS service that runs WhatsApp sessions and sends through them. ESM, Node 24, no HTTP: a Nest application context. Today it has the fake transport only and nothing opens a session at start; S03 adds Baileys, the database (session lease, stored state, rate limits, `messages`) and the jobs that send.

## Layout
- `src/main.ts` starts the process; `src/gateway.module.ts` (`GatewayModule.forRoot(config)`) imports the rest.
- `src/core/config/`: the environment checked by Zod at start-up (`loadConfig`), provided as `CONFIG`. `WHATSAPP_TRANSPORT` accepts `fake` only until S03.
- `src/transport/`: `WhatsAppTransport` (`whatsapp-transport.ts`), the only seam to WhatsApp: `connect(sessionId, credentials, events)` returns a `TransportConnection`; events `qr`, `open`, `close` with a library-neutral `DisconnectReason`, `message` (1:1 text, sender's phone resolved from LID by the transport) and `receipt`. `FakeWhatsAppTransport` sends nothing and lets tests drive a QR scan, disconnects, messages and receipts. `TransportModule` provides `WHATSAPP_TRANSPORT` from the config. A new transport (Baileys in S03) is one more file here and one more config value. S03 also adds to the interface the lookup of a sent message's content for retry requests (kept encrypted for one hour by the caller, never by the transport; ADR 0022) and checks that `CredentialStore` carries Baileys' key store.
- `src/sessions/`: `session-state.ts`, the ADR 0022 disconnect table (`disconnectAction`) and backoff (`reconnectDelay`, 1 s doubling to 60 s); `SessionsService`, which runs sessions through the transport and applies them. State is in memory until S03.
- `src/sending/`: `SendingService.sendText`, through a connected session only (`SessionNotConnectedError` otherwise).
- `test/`: the gateway booted with the fake transport and fake timers (`startGateway`), and the transport-boundary test. Unit tests sit next to the code. No database yet.

## Rules
- Only `src/transport/` imports a WhatsApp library or a concrete transport; everything else uses the interface and `@Inject(WHATSAPP_TRANSPORT)`. Pinned by `test/transport-boundary.test.ts`.
- One live connection per session: the caller holds the session's lease before `connect` (ADR 0022; the lease is S03). After `connection_replaced` (`440`) a session is let go, never reconnected.
- A restart (`515`) reconnects at once only once until the session opens; a repeated one backs off like a lost connection. A session sends only while `connected`, never during a reconnect.
- A connection's late events are ignored once it is closed or replaced; a session only reacts to its current connection.
- Never log a message body, a phone number or a QR code: logs hold session ids and disconnect reasons. Error logs name the error, not its message (a library's message can carry a number). WhatsApp text is transactional and never medical (ADR 0012, ADR 0016).
- Tests use synthetic numbers in the unassigned country code `+999` (`test/credentials.ts`) and never connect to WhatsApp.
- Injection is always explicit, `@Inject(TOKEN)`, as in `apps/api` and `apps/worker`.

Run: `pnpm --filter @vertex-shifa/whatsapp-gateway test`.
