# 0026 — Platform messaging: two Syrian numbers, a database send queue, limits from sent messages

Status: Accepted · Date: 2026-10-20 · Amends [0022](0022-messaging-confirmed-by-spike-b.md) · Spec: [S03](../specs/S03-whatsapp-gateway-and-otp.md)

## Context
ADR 0012 and 0022 fix the gateway, its session states, the lease and the starting rate limits, but leave open how many platform numbers Vertex runs (Q4), how an OTP made in the API reaches the gateway (a separate process), and the exact tables. S02 sends OTPs synchronously through an `OtpSender` port so the code is never stored in clear, and answers `OTP_DELIVERY_UNAVAILABLE` when sending is impossible. The gateway must pace sends per number (6–12 s apart), so a synchronous call into it would make a sign-in wait for another person's gap.

## Decision
- **Numbers (Q4, owner 2026-10-20):** two Syrian platform numbers at launch, phones kept by the owner, linked from a console screen by admins. OTPs and other platform messages are spread over every healthy number, preferring the number that already knows the recipient, so both numbers stay warm and either can take the whole load.
- **Send queue in PostgreSQL:** every outgoing WhatsApp message is a row of `whatsapp_messages`, with the recipient sealed and hashed and the body sealed (ADR 0025). The API (OTPs) and the worker (invitations) insert rows; the gateway claims them by priority with `FOR UPDATE SKIP LOCKED`, woken by `NOTIFY`. No HTTP between the API and the gateway, and the gateway does not run pg-boss. The API checks synchronously that a healthy number could send to this phone now, so S02's `OTP_DELIVERY_UNAVAILABLE` stays meaningful; the code exists only sealed in the queue, for at most 60 s unsent or one hour after sending (ADR 0022's retry store), then is cleared.
- **Limits from sent messages:** the rate limits of ADR 0022 are counted over `whatsapp_messages.sent_at` in rolling windows, using the database clock. The `send_counters` table listed in the architecture is not built.
- **LID–phone pairs stay in the sealed credential store** (Baileys' own mappings). The `whatsapp_lid_map` table is not built; the gateway matches incoming senders by a keyed hash of the phone the transport resolves.
- **Opt-out on platform numbers** stops invitations and any platform message the person did not request, never OTPs the person asked for (owner, 2026-10-20). Strangers' messages are dropped unstored; known recipients get one auto-reply a day (owner, 2026-10-20).
- **Alerts:** a failing number, or no healthy number left, shows a console banner and sends a WhatsApp alert from a healthy platform number to every active admin (owner, 2026-10-20).
- **Shared crypto:** the sealing and keyed-hash helpers of ADR 0025 move to `packages/crypto`, with messaging keys (`MESSAGING_ENCRYPTION_KEY`, `MESSAGING_HASH_KEY`) shared by the API, the worker and the gateway.

## Consequences
- OTP delivery is asynchronous after the availability check; the clinic app reads the delivery status of a device sign-in OTP, and a failed delivery can be resent at once.
- Throughput is bounded by the pacing: with two numbers about 10–20 messages a minute. Enough for staff sign-ins; S19 (patient sign-up) revisits the number count with the volumes measured in S03.
- A new number starts at a 30-a-day cap with about 15 first contacts: both numbers are linked well before the pilot.
- S18 adds clinic sessions to the same tables (`kind`, `pool`, opt-out `scope`).
