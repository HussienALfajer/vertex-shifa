# 0022 — Messaging confirmed by Spike B: Baileys transport and Expo push, with amendments to 0012

Status: Accepted · Date: 2026-10-09 · Amends [0012](0012-messaging-whatsapp-and-push.md); confirms push in [0003](0003-patient-app-react-native-expo.md)

## Context
ADR 0012 chose Baileys for the WhatsApp gateway and ADR 0003 chose Expo notifications over FCM and APNs, both subject to Spike B (Q10 for push in Syria). The spike ran from Azaz on real devices, and everything required passed:
- linking by QR, sending and receiving;
- reconnecting after a restart and after a kill;
- an OTP round trip, and live rate limiting;
- push to an iPad and to an Android phone, including one on MTN Syria cellular with the app closed.

It also found behavior ADR 0012 did not foresee. Report: [`docs/spikes/B-whatsapp-gateway.md`](../spikes/B-whatsapp-gateway.md). Items marked *(not tested)* are design decisions the spike did not exercise.

## Decision

### WhatsApp transport
- **Baileys confirmed** as the first `WhatsAppTransport` implementation, on the v7 line (the spike used `7.0.0-rc14`).
  - The exact version is pinned.
  - An upgrade runs the gateway's tests against a staging number before it reaches production.
  - Upstream issues are watched, because WhatsApp's server changes break clients without notice (the `WIN32` sub-platform has been refused since 2026-06-30).
  - The client advertises a `WEB_BROWSER` sub-platform. The version reported by `fetchLatestWaWebVersion()` is logged at each connect.
- **Disconnect codes map to session states:**

  | Code | Meaning | Action |
  |---|---|---|
  | `515` | Restart required (normal right after a QR link) | Reconnect at once |
  | `401` | Logged out | `needs_relink`; alert the clinic or the console *(not observed)* |
  | `403` | Forbidden | `banned`; pause sending from that number, alert, fail over for platform numbers *(not observed)* |
  | `440` | Connection replaced: another process holds the session | Stop this connection, **never reconnect**; the lease decides |
  | Others | Network or server | `disconnected`; reconnect with backoff (1 s doubling to 60 s) *(not observed)* |

  "Linked" means an open connection with the account set in the credentials; Baileys' `registered` flag is not used.
- **One live connection per session** (ADR 0012) is enforced by a lease row in PostgreSQL with a heartbeat. A second connection makes WhatsApp close the first, so two processes without a lease would kick each other in a loop. A lease whose holder stopped heartbeating can be taken over. *(The spike proved the need and used a pid file; the database lease is not tested.)*

### Receiving
- **Both upsert types are processed:** `notify` (live) and `append` (messages that arrived while the gateway was down, delivered on reconnect). Messages are deduplicated by message id *(deduplication not tested)*.
- **LID addressing:** incoming chats are often addressed by LID (`…@lid`) rather than by phone number. Before any matching, the gateway resolves the phone number, from the alternate JID or Baileys' LID mapping. Matching covers the opt-out keyword and replies to a reminder. The gateway's own LID–phone map keeps only the pairs of its known recipients and opted-in people.
- **Who is processed:** a linked number sees every chat. The gateway turns off history sync and presence, and ignores groups, broadcasts and newsletters. It processes 1:1 messages from:
  - people with a booking or an explicit opt-in on that number;
  - anyone that number has messaged (its known recipients, including OTP recipients).

  From them, the opt-out keyword ("إيقاف") is always honored, even after the booking has passed. The application stores nothing from anyone else, neither sender nor content (ADR 0016). Message bodies are never logged (ADR 0012).
- **What the library keeps anyway:** Baileys decrypts every incoming message before the gateway's filter runs. It keeps per-contact protocol state (Signal sessions, device lists, LID mappings) in the session's credential store, including for senders the gateway ignores. That store is encrypted in the database (ADR 0012), is never exported or read by people, and is deleted when the session is unlinked.
- **OTP stays one-way:** a code received in a chat never verifies a sign-in. If replies counted, someone who started a sign-in with the victim's number would be verified as soon as the victim replied with the code. Reverse verification remains kept for later, as in ADR 0012. The spike had a reply path; it is not part of the design.

### Sending
- **Receipts only move a message forward** (`queued → sent → delivered → read`, or `failed`). Repeated or late receipts, for example `SERVER_ACK` after `READ`, are ignored.
- **Outgoing content for retries:** the gateway keeps each sent message's content, encrypted, for one hour, to answer the recipient device's retry requests; then it is deleted. The content is transactional and non-medical (ADR 0012). *(Not tested: the spike kept it in memory unencrypted, and no retry request occurred.)*
- **Rate limits are durable and per sending number:** counters, the number's link date (for warm-up) and its known recipients are stored in PostgreSQL, so restarts and failover do not reset them *(the spike's in-memory limiter showed the need; the durable store is not tested)*. Starting values, to be tuned in S03 on the platform numbers:
  - 6–12 s between sends from one number;
  - 60 an hour;
  - a daily cap of 30, 75, 150 and then 300 by the number's age (days 1–3, 4–7, 8–21, then on);
  - first contacts at most half of the daily cap;
  - per recipient: one message a minute, 5 an hour, 10 a day.

  A `403` or a run of failed sends pauses the number *(not tested)*.
- **OTPs have their own budget:** ADR 0012's OTP rules apply. This ADR sets their starting values:
  - six digits;
  - 5-minute expiry;
  - 5 attempts;
  - 60 s resend cooldown;
  - 3 codes an hour per phone;
  - only a keyed hash of the code is stored.

  The proof-of-work challenge of ADR 0016 guards the OTP request. OTPs skip the per-recipient notification rules, but they count toward the number's hourly and daily caps and its first-contact share. During warm-up, that share limits a new platform number to about 15 first-time OTP recipients a day, which S03 takes into account.

### Push
- **Confirmed:** push through FCM and APNs reaches devices in Syria:
  - **iPad, Turkish-egress Wi-Fi in Azaz:** Expo push, delivered at once with the app open and with the screen locked.
  - **Android phone on MTN Syria cellular, app closed and screen locked:** direct FCM, delivered at once.
  - **The same Android phone through Expo** (relayed through FCM): delivered at once, but the spike did not record its network and app state.

  Q10 is resolved.
- **Two tokens per device:** the patient app registers the Expo push token and the native token (FCM on Android, APNs on iOS). The server sends through Expo; it can send directly through FCM HTTP v1 and APNs if Expo's push service becomes unreachable *(direct FCM proven; direct APNs not tested)*.
- **Builds:** remote push needs a development or release build on Android (Expo Go dropped it in SDK 53), so the patient app is tested with development builds. Each Android app's FCM V1 service-account key is uploaded to EAS. The key never enters the repository. iOS release builds need the Apple developer account (Q9).
- **Latency** is measured from server timestamps or observed delivery, never by subtracting two devices' clocks.

## Consequences
- The rest of ADR 0012 stands: channels, clinic and platform sessions, ban-risk rules, privacy, templates, and fallback from a failed WhatsApp message to push.
- `docs/architecture.md` lists the new messaging tables (session lease, per-number send counters and known recipients, LID–phone map, native push tokens); S03 specifies their columns and the short-lived encrypted store of sent content.
- Baileys stays a release candidate with irregular releases (a 5.5-month gap in 2025–2026). The transport interface and the push fallback limit the damage when it breaks; gateway health monitoring (F37) alerts on it.
- Open after the spike, for S03 and S18:
  - real ban thresholds and number warm-up;
  - failover between platform numbers (Q4);
  - several sessions in one process and memory per session (one session used about 100 MiB);
  - an iPhone and iOS on a non-Turkish Syrian network;
  - the gateway on the production host (Q1).
