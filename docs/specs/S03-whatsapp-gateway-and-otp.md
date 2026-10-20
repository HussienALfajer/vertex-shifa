# S03 — WhatsApp gateway and OTP

Status: Approved · Date: 2026-10-20 · Features: platform core for `docs/product/v1-scope.md` F02 (staff sign-in OTP), F24 and F30 (patient OTP, used from S19 and S21), F37 (WhatsApp session status) · ADRs: 0001, 0004, 0005, 0012, 0016, 0017, 0020, 0022, 0024, 0025, 0026

## Summary
Staff sign-in already asks for a one-time code, but S02 only prints it to the API's output. S03 makes the WhatsApp gateway real: Vertex links its own platform numbers (two Syrian numbers at launch, Q4) from the console by QR, the gateway runs them with Baileys under a database lease, and every OTP and staff invitation message goes out from a healthy platform number within durable rate limits, with failover between numbers, opt-out, a once-a-day auto-reply and alerts to Vertex admins when a number fails. Clinic numbers and patient notifications stay in S18; S03 builds the shared gateway they will use.

## In scope / out of scope
- In:
  - The Baileys transport behind `WhatsAppTransport` (ADR 0022), pinned to an exact v7 version, with the `WEB_BROWSER` sub-platform; the fake transport stays for tests and development.
  - Platform WhatsApp sessions: created, linked by QR, paused, resumed, re-linked and unlinked from the console; their state, warm-up age and today's usage; the database lease with heartbeat; credentials and Baileys' key store sealed in PostgreSQL; several sessions in one gateway process.
  - The send queue (`whatsapp_messages`), claimed by the gateway; durable rate limits per number computed from it; known recipients; the sealed copy of sent content for retry requests, deleted after one hour (ADR 0022).
  - OTP delivery: the gateway `OtpSender` of the API replacing the fake in production; delivery status of a device sign-in OTP shown in the clinic app.
  - The staff invitation message (S02 rule 4) sent by a worker job from `staff.invitation_created.v1`, and `invitation_message_status` kept up to date.
  - Incoming messages on platform numbers: the opt-out and opt-in keywords and the once-a-day auto-reply, from known recipients only.
  - Alerts to Vertex admins (console banner and WhatsApp from a healthy platform number) when a number fails or none is left.
  - Console screens: platform numbers (list, add and link, QR dialog, detail with recent events, pause, resume, re-link, unlink) and the messaging health banner.
- Out (later or never):
  - Clinic WhatsApp sessions linked by each clinic, patient notifications, templates editable per clinic, the push fallback, push tokens: S18 (on the gateway, queue, limits and opt-out tables built here).
  - Patient OTP sign-in (S19) and web-booking OTP (S21): they call the same `OtpSender` with their own purposes.
  - Global message templates in the console and full health monitoring (sync, app versions): S23. S03's templates are fixed Arabic texts in `packages/i18n`.
  - Reverse verification (the user sends us a code) and verification at the clinic by QR: kept for later (ADR 0012). A code received in a chat never verifies anything (ADR 0022).
  - Media messages, groups, pairing-code linking, history sync: never planned.
  - Running the gateway on the production host: the deploy skeleton (Q1).

## Access and entitlements
Every route declares `@NoFeature()`: platform numbers and OTPs serve every package.

| Action | Surface | Who (permission) | Feature key |
|---|---|---|---|
| Read the delivery status of a device sign-in OTP | Clinic app | Public, by challenge id | none |
| List platform numbers, read one with its recent events, read the messaging health | Console | `admin`, `support` (`whatsapp-sessions.read`) | none |
| Add a platform number, read its QR while linking, re-link, pause, resume, unlink | Console | `admin` (`whatsapp-sessions.manage`), re-authentication within 5 minutes (S02 rule 38) for every action except reading the QR | none |

Two new console permissions in `packages/contracts/src/console-identity.ts`: `whatsapp-sessions.read` (admin and support) and `whatsapp-sessions.manage` (admin only).

## Data
All tables are platform scope (no `tenant_id`, no tenant RLS): they hold Vertex's own numbers and keyed hashes of recipients, never tenant data. Each table's custom migration revokes `PUBLIC` and grants `shifa_app` only what is listed. Owning module: `messaging` (`packages/db/src/schema/messaging.ts`). Phones of recipients are stored only sealed (AES-256-GCM, ADR 0025) or as a keyed hash (`MESSAGING_HASH_KEY`), never in clear; message bodies only sealed (`MESSAGING_ENCRYPTION_KEY`).

### `whatsapp_sessions` (business, archived)
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid v7 | yes | |
| `kind` | text | yes | `platform` (S18 adds `clinic` with a tenant reference) |
| `label` | text | yes | 2–40 characters, unique among unarchived sessions ("رقم 1") |
| `phone` | text | no | E.164, set at the first link from the transport's `open`; our own number, shown to admins; unique among unarchived sessions |
| `state` | text | yes | `linking`, `connected`, `disconnected`, `needs_relink`, `banned`, `unlinked` (States) |
| `paused_at`, `pause_reason` | timestamptz, text | no | `manual` or `send_failures`; sending stops while set |
| `linked_at` | timestamptz | no | the first `open` after a QR scan; the warm-up age counts from it and a re-link of the same phone keeps it |
| `qr_sealed`, `qr_expires_at` | text, timestamptz | no | the current QR while `linking`, sealed; cleared on `open` or timeout |
| `link_deadline_at` | timestamptz | no | 3 minutes after linking starts |
| `last_connected_at`, `last_disconnect_reason` | timestamptz, text | no | reason is the library-neutral `DisconnectReason` |
| `consecutive_failures` | smallint | yes | failed sends in a row, reset by a success |
| `lease_holder`, `lease_expires_at` | uuid, timestamptz | no | the gateway instance id; renewed every 10 s for 30 s |
| `archived_at`, `created_at`, `updated_at` | timestamptz | | `unlinked` sessions are archived |

Grants: `SELECT, INSERT, UPDATE`. Index on `(state)` where not archived.

### `whatsapp_session_credentials` (queue: deleted on unlink)
`session_id` → `whatsapp_sessions`, `key` (text), `value_sealed` (text), `updated_at`; unique `(session_id, key)`. Baileys' credentials and key store (Signal sessions, device lists, its LID–phone mappings) as opaque sealed values. Grants: `SELECT, INSERT, UPDATE, DELETE`. Never exported, never read by people.

### `whatsapp_session_events` (append-only)
`id`, `session_id`, `type` (`created`, `linked`, `connected`, `disconnected`, `needs_relink`, `banned`, `link_timeout`, `duplicate_number`, `paused`, `resumed`, `relink_started`, `unlinked`, `alert_sent`), `reason` (text, nullable), `platform_user_id` (nullable: null for the gateway), `created_at`. Index `(session_id, created_at)`. Grants: `SELECT, INSERT`; `refuse_change()` triggers.

### `whatsapp_messages` (queue: the send queue; rows deleted after 30 days)
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid v7 | yes | |
| `kind` | text | yes | `otp`, `alert`, `invitation`, `opt_reply`, `auto_reply` (also the claim priority, in that order) |
| `pool` | text | yes | `platform` (S18 adds clinic sessions) |
| `session_id` | uuid | no | the number that claimed it; for `opt_reply` and `auto_reply`, fixed at creation to the number that received the message |
| `recipient_hash` | text | yes | keyed hash of the E.164 phone |
| `recipient_sealed` | text | no | the phone, sealed; cleared one hour after a final status |
| `body_sealed` | text | no | the text, sealed; cleared one hour after `sent` (kept for retry requests, ADR 0022) or at once on `failed` or `expired` |
| `status` | text | yes | `queued`, `sending`, `sent`, `delivered`, `read`, `failed`, `expired` |
| `failure_reason` | text | no | `transport_error`, `no_number`, `opted_out`, `deadline` |
| `attempts` | smallint | yes | send attempts |
| `first_contact` | boolean | no | set when sent: the number had never messaged this recipient |
| `deadline_at` | timestamptz | yes | after it a queued message becomes `expired`: 60 s for `otp`, 24 h for `invitation`, 1 h for the others |
| `next_attempt_at` | timestamptz | yes | backoff between attempts |
| `transport_message_id` | text | no | WhatsApp's id; unique with `session_id`; receipts and retry requests find the row by it |
| `otp_challenge_id` | uuid | no | → `otp_challenges`; unique |
| `source_event_id` | uuid | no | the outbox event that made it; unique (an event's job runs twice, one message) |
| `subject_tenant_id`, `subject_id` | uuid | no | for `invitation`: the tenant and membership whose status follows this message (no foreign key: platform table) |
| `sent_at`, `delivered_at`, `read_at` | timestamptz | no | |
| `created_at`, `updated_at` | timestamptz | | |

Indexes: `(status, kind, next_attempt_at)` where `status = 'queued'` (the claim); `(session_id, sent_at)` (the rate limits); `(recipient_hash, sent_at)` (per-recipient limits). Grants: `SELECT, INSERT, UPDATE, DELETE` (the purge). Every transaction that queues a message also runs `NOTIFY whatsapp_messages`, which wakes the gateway.

### `whatsapp_known_recipients` (business)
`session_id`, `recipient_hash`, `first_sent_at`, `last_sent_at`, `last_auto_reply_at`; unique `(session_id, recipient_hash)`. A recipient becomes known to a number when that number sends them a message. Kept until the session is unlinked, then deleted with it (grants `SELECT, INSERT, UPDATE, DELETE`).

### `whatsapp_opt_outs` (business)
`id`, `scope` (`platform`; S18 adds clinic sessions), `recipient_hash`, `opted_out_at` (nullable), `opted_in_at` (nullable), `last_keyword_at` (the incoming message's time, for ordering), `created_at`, `updated_at`; unique `(scope, recipient_hash)`. Grants: `SELECT, INSERT, UPDATE`.

### Changes to S02 tables
- `otp_challenges.delivery_status`: values become `queued`, `sent`, `delivered`, `failed` (existing `sent` rows stay valid). Set to `queued` at creation; the gateway moves it forward with the message (forward only).
- `staff_memberships.invitation_message_status`: adds `opted_out`.

### Removed from the architecture's list
`send_counters` and `whatsapp_lid_map` are not built (ADR 0026): the counts come from `whatsapp_messages`, and the LID–phone pairs stay inside the sealed credential store.

## States and rules

### Session states
| From | To | Trigger |
|---|---|---|
| — | `linking` | An admin adds a number |
| `linking` | `connected` | The QR is scanned and the connection opens with the account set (`linked`, then `connected` events) |
| `linking` | `needs_relink` | No scan before `link_deadline_at` (`link_timeout`), or the scanned phone already belongs to another unarchived session (`duplicate_number`: the gateway logs that link out at once) |
| `connected` | `disconnected` | Connection lost (`connection_lost`); the gateway reconnects with backoff (1 s doubling to 60 s) |
| `disconnected` | `connected` | Reconnected |
| `connected`, `disconnected` | `needs_relink` | Logged out (`401`) |
| `connected`, `disconnected` | `banned` | Forbidden (`403`) |
| `needs_relink`, `banned`, `disconnected` | `linking` | An admin re-links (new QR); credentials of the old link are deleted first |
| any but `unlinked` | `unlinked` | An admin unlinks: logout through the transport when connected, credentials, known recipients and pending messages of the session deleted, session archived |

`restart_required` (`515`) reconnects at once without a state change; `connection_replaced` (`440`) stops that connection and leaves the session to whoever holds the lease (ADR 0022). Pause is not a state: it is a flag on any non-archived session.

### Message states
`queued → sending → sent → delivered → read`, and `failed` or `expired`. Receipts only move a message forward; late or repeated ones are ignored (ADR 0022).

### Rules

**Sessions and lease**
1. A gateway instance gets a random id at start. It runs every non-archived session in `linking`, `connected` or `disconnected` whose lease is free or expired: it takes the lease (`lease_holder`, `lease_expires_at = now + 30 s`) in one conditional update, renews it every 10 s, and connects only while it holds it. A failed renewal closes that connection at once. On shutdown it releases its leases so a new instance takes them without waiting.
2. "Healthy" means: state `connected`, not paused, lease unexpired. Only healthy numbers send.
3. Credentials and the key store are read and written through `CredentialStore`, sealed with context `whatsapp-credentials:<session id>`. Writes of several keys happen in one transaction.
4. While `linking`, each QR the transport emits is stored sealed with its expiry (about 20 s); the console polls it. After 3 minutes without a scan the gateway closes the link (`needs_relink`, `link_timeout`).
5. At `open` after a scan, the gateway records `phone` and `linked_at` (kept if the same phone was linked to this session before), unless another unarchived session holds that phone (rule in States).
6. Three failed sends in a row (`transport_error`) pause a number automatically (`send_failures`). An admin resumes it. A ban (`403`) also stops sending; a banned number is re-linked or unlinked by an admin.

**Rate limits (per number, durable; starting values of ADR 0022, kept in `packages/contracts/src/messaging.ts` with the pure rule that applies them)**
7. Between two sends from one number: a random 6–12 s.
8. At most 60 sends in the last 60 minutes, and in the last 24 hours at most 30, 75, 150 or 300 by the number's age (days 1–3, 4–7, 8–21, then on, counted from `linked_at`).
9. First contacts at most half of the 24-hour cap.
10. Per recipient, for every kind except `otp`: one message a minute, 5 an hour, 10 a day, across all platform numbers. OTPs follow the OTP limits of S02 rule 13 instead, but count toward rules 7–9.
11. Counts are computed from `whatsapp_messages.sent_at` over rolling windows, so a restart or a failover never resets them. Auto-replies and opt-out replies count like any message and are skipped (not queued) when the receiving number has no budget left.

**Choosing a number (failover)**
12. A message may go from any healthy platform number within its limits. The number that already knows the recipient is preferred while it is healthy and within limits; otherwise the healthy number with the most 24-hour budget left takes it (a first contact for it). Two numbers therefore share the load and both stay warm.
13. `opt_reply` and `auto_reply` go only from the number that received the message.
14. The gateway claims queued messages in priority order (`otp`, `alert`, `invitation`, `opt_reply`, `auto_reply`, then oldest) with `FOR UPDATE SKIP LOCKED`, for a number whose gap (rule 7) has passed. It wakes on `NOTIFY whatsapp_messages` and every 2 s.
15. A send that fails with `transport_error` is retried with backoff (10 s, 1 min, 5 min) until its deadline; the next attempt may use another number. A message still queued at its deadline becomes `expired`.

**OTP delivery**
16. `OtpSender.send` gains the challenge id: `send({ challengeId, accountId, phone, code, purpose })`. The gateway sender checks, in the challenge's transaction, that at least one healthy number could send to this phone now (rules 2 and 7–9, using the recipient's known-number and first-contact status); if none can, it throws and S02's existing paths answer (`OTP_DELIVERY_UNAVAILABLE` for a password sign-in, the quiet answer otherwise). Otherwise it queues an `otp` message with the sealed text and `otp_challenge_id`, and returns without waiting for WhatsApp.
17. The challenge's `delivery_status` follows the message: `queued`, then `sent`, `delivered`, or `failed` (on `failed` or `expired`). A failed challenge expires at once (no code can be tried against it), does not start the 60-second resend cooldown, and still counts toward the 3 codes an hour per phone.
18. An OTP not sent within 60 s of being queued expires (`deadline`).
19. The delivery status is readable only for `device_sign_in` challenges (the password was already checked). For any other id, a first sign-in or reset challenge, a decoy, or an unknown id, the route answers `{ status: 'unknown' }`, so it never tells an account from a decoy (S02 rule 15).
20. OTPs are sent even to a phone that opted out (the person asked for the code).

**Invitation message**
21. The worker job `messaging.send-invitation` takes `staff.invitation_created.v1`: inside `withTenant`, it reads the membership; if it is no longer `invited`, it does nothing; if the phone opted out, it sets `invitation_message_status = opted_out`; otherwise it queues an `invitation` message (S02 rule 4 text, `source_event_id` = the event id, subject = tenant and membership). Twice for one event makes one message.
22. When an invitation message reaches `sent`, `failed` or `expired`, the gateway writes `whatsapp.message_finished.v1` `{ tenantId, messageId, subjectId, status }` in the subject tenant's outbox (inside `withTenant`); the worker job `access.update-invitation-message-status` sets `invitation_message_status` to `sent` or `failed` if the membership is still `invited` and this message is the latest for it.
23. A resend (S02, 10-minute cooldown) publishes a new event and makes a new message; the status returns to `pending` until it finishes.

**Incoming messages**
24. The transport reports 1:1 text messages with the sender's phone resolved (ADR 0022). The gateway hashes the phone and processes the message only if the sender is a known recipient of the receiving number; anything else is dropped without storing anything (sender, content or id).
25. Keywords, after trimming and Arabic normalization (`normalizeArabicName`), case-insensitive: opt-out `إيقاف` or `STOP`; opt-in `تشغيل` or `START`. A keyword sets `opted_out_at` or `opted_in_at` only if its message time is later than `last_keyword_at` (a message delivered twice or late after a restart cannot undo a newer choice), and queues one `opt_reply` from that number.
26. Opt-out in the platform scope stops invitation messages and every future platform message the person did not request; it never stops OTPs (rule 20) and never affects clinic numbers (S18).
27. Any other text from a known recipient gets one `auto_reply` from that number at most once every 24 hours per person (`last_auto_reply_at`). Message bodies are never stored or logged.

**Alerts**
28. When a platform number enters `needs_relink`, `banned`, `disconnected` for more than 5 minutes, or is paused by `send_failures`, and when the number of healthy platform numbers falls to zero or rises back from zero, the gateway queues an `alert` message to every active `admin` platform user from a healthy number, at most once per session and event type every 30 minutes, and writes `alert_sent`. With no healthy number left, the alert waits in the queue until its deadline (1 h) and the console banner remains the signal.
29. Alert texts name the number's label and the event, never a phone or a person.

**Retention**
30. The gateway's sweep, every minute: clears `body_sealed` one hour after `sent` and `recipient_sealed` one hour after a final status; expires overdue queued messages; deletes `whatsapp_messages` rows older than 30 days.

### Message texts (Arabic, in `packages/i18n` namespace `messaging`; Latin digits)
- `otp`: «رمز التحقق في فيرتكس شفا: {code}\nصالح لمدة 5 دقائق. لا تشاركه مع أحد، ففريق فيرتكس لا يطلبه منك أبداً.»
- `invitation`: «دعتك عيادة «{clinicName}» للانضمام إليها بصفة {role} على فيرتكس شفا. سجّل الدخول من حاسوب العيادة باستخدام رقمك هذا. لإيقاف رسائل الدعوات أرسل: إيقاف»
- `opt_reply` (out): «تم إيقاف رسائل الدعوات من فيرتكس شفا. ستصلك رموز التحقق فقط عندما تطلبها بنفسك. لإعادة الرسائل أرسل: تشغيل»
- `opt_reply` (in): «تمت إعادة رسائل فيرتكس شفا. لإيقافها أرسل: إيقاف»
- `auto_reply`: «هذا رقم فيرتكس شفا لإرسال رموز التحقق والدعوات فقط، ولا تُقرأ الرسائل الواردة إليه. للمساعدة تواصل مع عيادتك.»
- `alert`: «تنبيه فيرتكس شفا: رقم المنصة «{label}» {event}.» with events «يحتاج إعادة ربط», «محظور من واتساب», «منقطع منذ أكثر من 5 دقائق», «أُوقف تلقائياً بعد فشل الإرسال», «لم يبقَ أي رقم يعمل — رموز التحقق متوقفة», «عاد رقم واحد على الأقل للعمل».

## Offline behavior and conflicts
Online only. Sign-ins that need an OTP and console actions already need a connection (S02, ADR 0008). The gateway itself survives its own outages: messages wait in the queue until their deadline, incoming messages that arrived while it was down come as `append` and are processed like live ones (ADR 0022), and limits survive restarts (rule 11). When no platform number is healthy, new sign-ins that need an OTP wait (`OTP_DELIVERY_UNAVAILABLE`) and PIN sign-ins on enrolled devices keep working (ADR 0012). No sync commands, no conflicts.

## Clinical data and privacy
None: no medical data is created, read or sent. Rules that apply (ADR 0012, 0016):
- Message texts are transactional: an OTP, an invitation with the clinic's name and role, replies and admin alerts. No patient, appointment or clinical content.
- Recipient phones are stored only sealed (cleared after an hour) or hashed; bodies only sealed (cleared after an hour); QR codes only sealed. Nothing from senders who are not known recipients is stored.
- Logs hold session ids, message ids, kinds, states and reason codes: never a phone, a body, a code, a QR or a library error message (`describeForLog`).
- Fixtures and tests use the unassigned country code `+999` and never connect to WhatsApp.

## Money
None.

## API and commands
Module `apps/api/src/modules/platform/messaging/` (console routes, the health read, the queue insert used by the gateway `OtpSender` in `platform/identity`).

| Method and path | Access | Request | Response | Error codes |
|---|---|---|---|---|
| `GET /api/auth/otp/{challengeId}/delivery` | Public (rate-limited per IP, 120 per 10 minutes) | — | `otpDeliverySchema` `{ status: 'queued' \| 'sent' \| 'delivered' \| 'failed' \| 'unknown' }` | `RATE_LIMITED` |
| `GET /api/console/whatsapp-sessions` | `whatsapp-sessions.read` | — | `platformWhatsAppSessionSchema[]`: id, label, phone, state, paused and reason, warm-up day, 24-hour sends and cap, first contacts and share, hourly sends, last connected, lease held | — |
| `GET /api/console/whatsapp-sessions/{id}` | `whatsapp-sessions.read` | — | the session and its last 50 events | `NOT_FOUND` |
| `GET /api/console/messaging/health` | `whatsapp-sessions.read` | — | `{ healthy, total, otpAvailable }` | — |
| `POST /api/console/whatsapp-sessions` | `whatsapp-sessions.manage`, re-auth | `createPlatformWhatsAppSessionSchema` `{ label }` | the session (`linking`) | `REAUTH_REQUIRED`, `CONFLICT` (label taken), `WHATSAPP_SESSION_LIMIT` (10 unarchived) |
| `GET /api/console/whatsapp-sessions/{id}/qr` | `whatsapp-sessions.manage` | — | `{ state, qr \| null, expiresAt \| null, linkDeadlineAt }` | `NOT_FOUND` |
| `POST /api/console/whatsapp-sessions/{id}/relink` | `whatsapp-sessions.manage`, re-auth | — | the session (`linking`) | `REAUTH_REQUIRED`, `INVALID_STATUS_TRANSITION` |
| `POST /api/console/whatsapp-sessions/{id}/pause` · `/resume` | `whatsapp-sessions.manage`, re-auth | — | the session | `REAUTH_REQUIRED`, `INVALID_STATUS_TRANSITION` |
| `POST /api/console/whatsapp-sessions/{id}/unlink` | `whatsapp-sessions.manage`, re-auth | — | — | `REAUTH_REQUIRED`, `INVALID_STATUS_TRANSITION` |

New error code: `WHATSAPP_SESSION_LIMIT` (409), with its Arabic text. Schemas in `packages/contracts/src/messaging.ts`, which also holds the limits, the warm-up caps, the keyword matcher and the pure `sendBudget(stats, recipient, kind, now)` rule shared by the API and the gateway.

Configuration (Zod, refused at start when missing):
- `MESSAGING_ENCRYPTION_KEY` and `MESSAGING_HASH_KEY` (base64, 32 bytes each), read by the API, the worker and the gateway. The sealing and keyed-hash helpers of ADR 0025 move from `apps/api` to a new package `packages/crypto` (`seal`, `open`, `keyedHash`) that the three apps import.
- API `OTP_SENDER`: `fake` or `gateway`; production refuses `fake` (unchanged).
- Gateway `WHATSAPP_TRANSPORT`: `fake` or `baileys`; production refuses `fake`. The gateway connects with `DATABASE_APP_URL`.

`WhatsAppTransport` additions: `logout()` on a connection (unlink), the caller-supplied `getMessage(transportMessageId)` for retry requests, and atomic multi-key writes in `CredentialStore` if Baileys needs them.

## Jobs, events and notifications
- Event consumed: `staff.invitation_created.v1` (S02) → worker queue `messaging.send-invitation` (rule 21). Safe twice: `source_event_id` is unique.
- Event published by the gateway: `whatsapp.message_finished.v1` `{ tenantId, messageId, subjectId, status }` (ids and codes only) → worker queue `access.update-invitation-message-status` (rule 22). Safe twice: it sets the status from the message's final state.
- The gateway's loops (not pg-boss): the lease renewal (10 s), the sender (on `NOTIFY` and every 2 s), the sweep (1 minute).
- WhatsApp messages: the texts above. No push in S03.

## Screens

### Console (`apps/console`, inside `AppFrame`, Arabic RTL, every size from 320 px)
1. **Platform numbers** (`/whatsapp`, sidebar item «أرقام واتساب»): a card per number with label, phone, a state badge (متصل، منقطع، يحتاج إعادة ربط، محظور، جارٍ الربط) and «متوقف مؤقتاً» with its reason, warm-up day, 24-hour sends against the cap with a bar, first contacts against their share, last connected time (`formatDateTime`). Admins see «إضافة رقم» and each card's actions (pause or resume, re-link, unlink); support sees no actions. States: loading skeleton; empty («لا توجد أرقام بعد» with «إضافة رقم» for admins); error with retry.
2. **Add and link dialog**: label field, then the QR (rendered from the sealed value the API returns, renewed by polling every 2 s), the countdown to `link_deadline_at`, the steps to scan («واتساب ← الأجهزة المرتبطة ← ربط جهاز»), then success with the linked phone, or `link_timeout` and `duplicate_number` with «إعادة المحاولة». Re-link opens the same dialog.
3. **Number detail** (`/whatsapp/$sessionId`): the card's data and the last 50 events with time, type, reason and the admin's name.
4. **Messaging health banner**: across every console page in `AppFrame`, danger when no number is healthy («رموز التحقق متوقفة: لا يوجد رقم واتساب يعمل»), warning when only one is («يعمل رقم واحد فقط، لا يوجد بديل عند تعطله»), linking to `/whatsapp`. Polls every 30 s.
5. Confirm dialogs for unlink (says the number's known recipients and pending messages are deleted) and pause, through the re-authentication dialog of S02.

### Clinic app
6. **OTP step of a password sign-in** (`/sign-in`, S02): under the code field, a status line polled every 2 s until final or 60 s: «جارٍ إرسال الرمز…», «أُرسل الرمز عبر واتساب», «وصل الرمز إلى واتساب», or «تعذّر إرسال الرمز» with «إعادة الإرسال» enabled at once. First sign-in and password reset keep S02's fixed text.
7. **Staff list and member detail** (S02): the message status shows `opted_out` as «رسالة الدعوة: أوقف الشخص رسائل فيرتكس».

## Audit
- Console actions on numbers write `platform_audit_entries` (S02 rule 41) with actions `whatsapp_session.created`, `.relinked`, `.paused`, `.resumed`, `.unlinked`, and a `whatsapp_session_events` row with the admin.
- The gateway's own transitions and alerts write `whatsapp_session_events` only.
- Invitation status changes are system updates and write no tenant audit entry (S02 already audited the invitation).
- Opt-out and opt-in are recorded in `whatsapp_opt_outs` (times kept), not in the audit.

## Abuse and failure cases
- **OTP flooding to burn a number's budget:** real OTPs go only to accounts that passed S02's checks (a correct password, a pending invitation, an authorized reset); proof of work, per-IP and per-phone limits apply; a first sign-in or reset for any other phone is a decoy and sends nothing.
- **Enumeration through the delivery route:** only `device_sign_in` challenges answer a real status (rule 19).
- **Number banned or logged out:** failover to the other number (rule 12), alerts (rule 28), PIN sign-ins unaffected. With two numbers, each warming up from its link date, Vertex links both well before the pilot so their first-contact budgets have grown.
- **Two gateway processes:** the lease (rule 1) lets one run a session; a `440` never reconnects.
- **Replayed or late keywords:** ordered by message time (rule 25).
- **Strangers writing to a platform number:** dropped unstored; auto-replies only to known recipients, once a day, within limits.
- **Stolen database dump:** credentials, QR codes, bodies and phones are sealed with keys outside the database; recipients are keyed hashes.
- **Primary phone offline:** WhatsApp ends linked devices when the phone that owns the account stays offline for about 14 days; the owner keeps both phones charged and online, and `needs_relink` raises an alert.
- **Baileys broken by a WhatsApp change:** the version is pinned and upgrades are tested on a staging number first (ADR 0022); the fake transport keeps tests independent of WhatsApp.
- **Queue growth while no number works:** deadlines expire OTPs in 60 s and invitations in 24 h; the sweep deletes old rows.

## Edge cases
1. Both numbers healthy but the recipient's known number is at its cap: the other number sends it as a first contact if its share allows; otherwise the OTP is refused at request time (rule 16).
2. A number disconnects between the API's check and the claim: the other number takes the OTP; if none does within 60 s it expires and the sign-in screen shows «تعذّر إرسال الرمز».
3. The resend of a failed OTP is allowed at once (rule 17), until the third code of the hour.
4. An invitation is cancelled after its message is queued: the message may still go; a sign-in with that phone answers as for any phone (S02 edge case 3).
5. An invitation is resent while the previous message is still queued: both may go; the status follows the latest message (rule 22).
6. An account's phone changes (S02 rule 17) after an OTP is queued: the queued message goes to the phone sealed at queue time, within its 60 s deadline; the next OTP goes to the new phone.
7. The same phone scanned into a second session: `duplicate_number`, the new link is logged out, the first session is untouched.
8. A number re-linked after a ban with a different phone: `linked_at` restarts (a new number warms up from day 1); its known recipients from the old phone are deleted with the old credentials.
9. An admin unlinks the last healthy number: allowed; the danger banner and the zero-numbers alert follow.
10. Receipts for a message whose body was already cleared: the status still moves forward; a retry request after one hour finds no content and is not answered.
11. A keyword from a person the number never messaged: ignored (rule 24).
12. Clock jump on the gateway host: rate windows use the database's `now()`, never the gateway's clock.
13. The gateway down for hours: OTPs expire, invitations wait up to 24 h, and messages received meanwhile are processed on reconnect.
14. A disabled admin: receives no alerts; an admin without a phone does not exist (S02).

## Open questions
None blocking. To be measured during S03 and recorded in ADR 0022's follow-up, not guessed:
- Real ban thresholds: start with ADR 0022's values (rules 7–10) and raise them only after weeks without `403`, failed sends or missing delivery receipts on the platform numbers.
- Memory per session with two sessions in one process (about 100 MiB each in Spike B).

## Acceptance
- **Owner checks** (local API, worker and gateway with `WHATSAPP_TRANSPORT=baileys` and `OTP_SENDER=gateway`; messages only to the owner's own test phones):
  1. In the console as an admin, open «أرقام واتساب», add «رقم 1», re-authenticate, scan the QR with the first Syrian number's phone; see it «متصل» with warm-up day 1 and the linked phone. Add «رقم 2» the same way.
  2. Restart the gateway: both numbers reconnect without a QR.
  3. In the clinic app, sign in with a password on an unregistered computer: see «جارٍ إرسال الرمز…» then «وصل الرمز إلى واتساب», receive the OTP text from a platform number, enter it.
  4. Invite a staff member with a test phone: the invitation message arrives; the staff list shows «رسالة الدعوة: أُرسلت». Reply «من أنت؟» from that phone: the auto-reply arrives once; a second message the same day gets none.
  5. Send «إيقاف» from that phone: the confirmation arrives; resend the invitation: the staff list shows «رسالة الدعوة: أوقف الشخص رسائل فيرتكس». Sign in with that phone: the OTP still arrives. Send «تشغيل».
  6. Pause «رقم 1»: the next OTP comes from «رقم 2». Pause both: the console shows the danger banner, the admin's phone receives no alert (no number left), and a password sign-in answers «تعذّر إرسال رمز التحقق الآن. أعد المحاولة لاحقًا.» (`OTP_DELIVERY_UNAVAILABLE`). Resume both.
  7. Unlink «رقم 2» from the console: it disappears from WhatsApp's linked devices on that phone.
- **Tests:**
  - Contracts: the limits and warm-up caps, first-contact share, per-recipient rules and the OTP exception, `sendBudget`, number choice, the keyword matcher with Arabic variants.
  - Gateway (fake transport, test database): lease take, renew, release and takeover after expiry; two instances never run one session; `440` stops without reconnecting; state transitions for each disconnect reason; QR stored sealed and cleared; link timeout; duplicate number; claim priority and `SKIP LOCKED` with two instances; gaps and caps across a restart; failover when a number disconnects; backoff and deadlines; auto-pause after three failures; receipts forward only; retry lookup within and after one hour; incoming filter (unknown sender stores nothing), keywords ordered by time, auto-reply once per 24 h; alerts with their 30-minute throttle; the sweep; no phone, body, code or QR in logs; the transport boundary test.
  - Baileys transport: unit tests of the mapping from Baileys events and codes to the interface with recorded synthetic payloads; never a live connection in CI.
  - API: the gateway `OtpSender` (refusal when no number could send, queued message sealed, challenge status following the message, failed challenge without cooldown); the delivery route for each purpose and for decoys and unknown ids; console routes with success, 401, 403 for support on manage routes, re-authentication, state transition errors, the session limit; the platform audit rows.
  - Worker: `messaging.send-invitation` (sends once per event, skips non-invited, `opted_out`), `access.update-invitation-message-status` (latest message only, still invited only), with rows in two tenants.
  - Database: convention test (grants, append-only triggers on `whatsapp_session_events`, registry entries).
  - E2E with a mocked API and RTL screenshots light and dark at desktop, tablet, 375 px and 320 px: platform numbers (empty, list in every state, support view), add-and-link dialog (QR, timeout, duplicate), number detail, the health banner in both levels; the clinic OTP step in each delivery status; the staff list with `opted_out`.
