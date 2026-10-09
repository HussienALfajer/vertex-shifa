# 0012 — Messaging: in-app push and WhatsApp only, through our own gateway

Status: Accepted (library to be confirmed by Spike B) · Date: 2026-10-09

## Context
The owner chose in-app notifications and WhatsApp only: no SMS and no email (owner, 2026-10-09). Meta's WhatsApp Business Platform is not available to businesses in Syria, and users in Syria cannot receive its messages. The only path is an unofficial WhatsApp Web client library, which breaks WhatsApp's terms and can get a number banned; the design must keep the system working when that happens. OTPs go through WhatsApp only in V1 (owner, 2026-10-09).

## Decision
- **Channels:** push notifications in the patient app (and in-app notification center), and WhatsApp messages. Nothing else.
- **Gateway:** `apps/whatsapp-gateway`, a separate long-running service. A `WhatsAppTransport` interface hides the library; the first implementation uses **Baileys** (WebSocket client, no browser, light per session; maintenance status checked in Spike B). An official transport can replace it if Meta ever allows Syria.
- **Sessions:**
  - **Clinic sessions:** each clinic links its own number by scanning a QR code in its settings (F21). The session runs on the server, so reminders go out while the clinic is offline.
  - **Platform sessions:** a pool of platform numbers sends OTPs, with health checks and automatic failover between numbers.
  - Session credentials are encrypted in the database; exactly one live connection per session (lease lock); states `linking`, `connected`, `disconnected`, `needs_relink`, `banned`, with alerts to the clinic and the console.
- **Sending:** messages are created by events through the outbox, queued in pg-boss, and sent with per-number rate limits and daily caps; delivery and read receipts update the message; failures retry with backoff; a failed WhatsApp message falls back to push when the person has the app.
- **OTP:** a six-digit code sent by WhatsApp from a platform number, short expiry, attempt limits, resend cooldown. Alternatives considered and kept for later: reverse verification (the user sends the code to us) and verification at the clinic by QR.
- **Ban-risk rules (legitimate use only):** messages only to people with a booking or an explicit opt-in; transactional content only (confirmation, reminder, change, "your turn is near", clinic notices); no bulk marketing; an easy opt-out ("إيقاف"); gradual volume on new numbers; one dedicated number per clinic, never shared between tools.
- **Privacy:** WhatsApp messages carry no medical content (no diagnosis, medication or result): only the clinic, date, time, ticket and a link to open the app. Message bodies are not logged.
- **Templates:** Arabic templates per event; clinics adjust wording within limits (ADR 0013).

## Consequences
- A banned clinic number stops that clinic's WhatsApp messages until it re-links; push keeps working.
- A banned platform OTP number fails over to another; if all fail, new sign-ins wait while existing sessions continue (ADR 0005).
- Library changes by WhatsApp can break sending; the version is pinned, upgrades are tested, and gateway health is monitored (F37).
