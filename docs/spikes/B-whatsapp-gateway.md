# Spike B — WhatsApp gateway (Baileys) and push delivery in Syria

Date: 2026-10-09 · Branch: `spike/whatsapp-gateway` · Code: `spikes/whatsapp-gateway/` (throwaway) · Decision: [ADR 0022](../decisions/0022-messaging-confirmed-by-spike-b.md), which confirms and amends [ADR 0012](../decisions/0012-messaging-whatsapp-and-push.md) and confirms push in [ADR 0003](../decisions/0003-patient-app-react-native-expo.md)

## Verdict

**Baileys is confirmed as the first WhatsApp transport, and Expo push over FCM and APNs reaches devices in Syria.** The required scenarios passed on real devices from Azaz:
- QR link, send, receive, reconnect after a graceful restart and after a kill, and an OTP round trip;
- live rate limiting, and a second connection to the same session;
- push to an iPad (Expo) and to an Android phone (direct FCM and Expo), including the Android phone on the **MTN Syria** cellular network with the app closed and the screen locked (direct FCM).

Baileys is maintained, but it is still a release candidate and WhatsApp's server changes break it from time to time. Six behaviors need rules that ADR 0012 did not have; ADR 0022 adds them:
- chats are addressed by LID;
- messages that arrive while the gateway is down come as `append`;
- receipts repeat and arrive out of order;
- a second connection kicks the first (`440`);
- rate-limit state must outlive restarts;
- OTPs need their own budget.

## Baileys maintenance status (checked 2026-10-09)

| Item | Finding |
|---|---|
| Package | `baileys` on npm (MIT). `latest` = **7.0.0-rc14** (2026-07-29); a `legacy` 6.7.x line is still patched (6.7.24, same day). Three npm maintainers; 11.3k GitHub stars; repository not archived |
| Release rhythm | v7 has been a release candidate since 2025-09-08 (14 RCs in 13 months). **No release between 2025-11-21 and 2026-05-06** (about 5.5 months). Last commit on `master` 2026-08-04; `develop` 2026-08-05; a dozen PRs opened or updated in 2026-10-04…08, none merged yet |
| Breakage by WhatsApp | From about 2026-06-30 WhatsApp refuses clients that advertise the `WIN32` desktop sub-platform (close `428` before any QR). Fixed on `develop` (#2741) but **not released**: `Browsers.windows(...)` fails on rc14. An open issue (#2832) reports pairing-code linking failing with `401` on rc13 |
| Ban reports | Open issue #2850 (2026-10-07): bulk sending gets the account banned. The README disclaims bulk or automated messaging |
| Footprint | Pure JavaScript plus a WebAssembly bridge (`whatsapp-rust-bridge`); no native build, so it installs anywhere Node 24 runs. One process with one session: about **90–110 MiB RSS** |

Consequence: pin an exact version, keep the `WhatsAppTransport` interface (ADR 0012), choose a `WEB_BROWSER` sub-platform (`Browsers.ubuntu('Chrome')`, used in the spike), and test every upgrade on a staging number first.

## What was built

| Part | What | Version |
|---|---|---|
| Gateway | One Node process, one Baileys session, multi-file auth state in `.data/` (git-ignored); a control API on `127.0.0.1`; a QR page; an OTP verify page | `baileys` 7.0.0-rc14, Node 24.21 |
| Lease | A pid file per session: a second process refuses to start while the first is alive (the product uses a database lease) | — |
| Rate limiter | Per sending number: gap with jitter, hourly cap, warm-up daily cap, first-contact share, per-recipient rules; pure, clock injected; 10 unit tests (`pnpm test`) | — |
| OTP | Six digits, HMAC-SHA256 with a pepper (code never stored), 5 min expiry, 5 attempts, 60 s resend cooldown, 3 per hour | — |
| Push probe app | Expo SDK 57 app: requests permission, shows the native token (FCM or APNs) and the Expo token, lists received notifications | `expo` 57.0.27, `expo-notifications` 57.0.22 |
| Push sender | Sends one synthetic notification through the Expo push API (then reads the receipt) or **directly through FCM HTTP v1** with a service account | — |

**Privacy, because the linked number was the owner's personal number:**
- only allow-listed test numbers could be messaged or were looked at; every other message was dropped without logging;
- no history sync, no presence (`markOnlineOnConnect: false`), groups, broadcasts and newsletters ignored;
- the event log masks numbers and never stores a message body.

Five messages were sent in total, all to one test number, each approved by the owner.

## Results

All on 2026-10-09 from the owner's PC in Azaz. Its internet exit is a **Turkish** ISP (`ipinfo` country `TR`), as is usual in northern Syria.

| Scenario | What was shown | Result |
|---|---|---|
| Reachability from Azaz | `web.whatsapp.com`, `exp.host`, `expo.dev`, `fcm.googleapis.com`, `firebaseinstallations.googleapis.com`, `console.firebase.google.com` answered; `mtalk.google.com:5228` (FCM's device port) open | Pass |
| QR link | First QR 1.5 s after start (first QR lives 60 s, then a new one every 20 s). After the scan: close `515 restartRequired`, reconnect, `open` **2.5 s after the scan**. `creds.registered` stays `false` after a QR link, so it cannot be the "linked" signal | Pass (finding) |
| Send and receipts | Text to a new contact: server ack 1.4 s, delivered 3.1 s, read 9.1 s. Later sends: server ack 0.24–0.7 s, delivered 0.34–0.57 s. The first send to a new contact took 0.84 s to return (session setup); later ones 5–7 ms | Pass |
| Receipt order | `SERVER_ACK` arrived again **after** `DELIVERY_ACK` and `READ` (twice), once 2 minutes later | Pass (finding) |
| Receive | A message from the test phone arrived with `remoteJid` **`@lid`**, not the phone number; the phone number came from `remoteJidAlt` / the LID mapping, and the allow-list check worked on it | Pass (finding) |
| Restart | Graceful stop and start: `open` 1.8 s after process start, no QR | Pass |
| Kill | `taskkill /F` (no clean close), then start: `open` 1.56 s after start, no QR; the stale lease of the dead process was taken over | Pass |
| Messages while down | A message sent to the gateway's number while it was killed arrived on reconnect, **as upsert type `append`, not `notify`**, before the `open` event | Pass (finding) |
| Send after restart | Server ack 0.7 s, read 0.71 s | Pass |
| OTP round trip | Code sent by WhatsApp, delivered in **0.57 s**, entered on the verify page and accepted (78 s including the person reading it). A second code was also accepted from the page | Pass |
| OTP vs rate limit | The first OTP attempt was **refused** by the per-recipient gap (a notification had gone to the same number 15 s earlier); nothing was sent. Fixed: OTPs skip per-recipient rules and use the OTP limits | Pass (finding) |
| Live rate limit | Three sends in a row to one number: the first went out, the next two were refused (`recipient_gap`) | Pass |
| Second process, lease on | Refused to start (`lease_refused`, exit 3) | Pass |
| Second process, lease ignored | The second connection opened in 2.0 s; WhatsApp closed the first with **`440 connectionReplaced`** about 1 s later. The first did not reconnect (by design). After both stopped, the session reopened normally (no corruption) | Pass (finding) |
| Push, iPad (iOS 18.7.8, Expo Go, Wi-Fi, VPN off) | APNs token 0.53 s; Expo token 0.95 s; Expo push accepted in 0.5 s, receipt `ok`; shown **at once** in the foreground and on the lock screen | Pass |
| Push, Android (Galaxy A56, Android 16, release build) | FCM token 0.30 s; Expo token 0.64 s. Direct FCM v1: shown at once on Wi-Fi with the app open, and **on MTN Syria cellular with the app swiped away and the screen locked** | Pass |
| Push, Android through Expo | Before the FCM V1 key was uploaded to EAS: ticket error `InvalidCredentials`. After: ticket and receipt `ok`, shown at once. The phone's network and app state at that moment were not recorded (it had last been on MTN with the app closed) | Pass (finding) |

## Findings

1. **Chats are addressed by LID.** WhatsApp's v7 protocol addresses many 1:1 chats by an opaque LID (`…@lid`); the phone number arrives in `remoteJidAlt` or through Baileys' LID mapping. Opt-out matching, "is this a patient with a booking" checks and reply handling must resolve the LID to a phone number. The gateway stores the LID–phone pairs it learns.
2. **Missed messages come as `append`.** Messages received while the gateway was down arrive on reconnect as `messages.upsert` of type `append`. Most examples handle only `notify`; doing so would lose an "إيقاف" opt-out or a reply sent during a restart. Handle both and deduplicate by message id.
3. **Receipts are not ordered.** `SERVER_ACK` can come again after `READ`. A message's status only moves forward (`sent → delivered → read`); late or repeated receipts are ignored.
4. **`440` means another process holds the session.** Reconnecting after `440` would make two processes kick each other in a loop. On `440` the gateway stops that session, and the lease decides who runs it. Disconnect codes map to the session states of ADR 0012: `401` → `needs_relink`, `403` → `banned` (pause sending, alert), `440` → stop, `515` → reconnect at once, others → reconnect with backoff (1 s doubling to 60 s).
5. **Rate-limit state must be durable.** The spike's limiter lived in memory: after a restart it treated a known recipient as a first contact and forgot the hourly count. In the product, counters and "known recipients" are per number in PostgreSQL.
6. **OTPs need their own budget.** A booking confirmation followed by an OTP to the same person is normal; the per-recipient gap must not delay the OTP. OTPs are limited by the OTP rules (cooldown, hourly cap, attempts) and still count toward the number's hourly and daily caps.
7. **Real ban thresholds are unknown and were not probed.** Testing limits on the owner's personal number would risk a ban, so only the limiter's logic was proven (unit tests and three live sends). The values in `lib/rate-limiter.mjs` are starting points from community reports, not WhatsApp limits:
   - 6–12 s between sends;
   - 60 an hour;
   - a warm-up of 30, 75, 150 and then 300 a day by the number's age;
   - first contacts at most half the daily cap;
   - one message a minute, 5 an hour and 10 a day per recipient.
   S03 tunes them on the platform numbers with gradual volume and watches for `403`, failed sends and missing delivery receipts.
8. **A linked device sees every chat.** The gateway receives all of the number's incoming messages, and could request history. The gateway therefore:
   - turns off history sync and presence;
   - ignores groups, broadcasts and newsletters;
   - processes only messages from people with a booking or opt-in and from the number's known recipients, so an "إيقاف" sent after a booking has passed is still honored;
   - stores nothing from anyone else.

   Baileys itself still decrypts every message and keeps per-contact protocol state (Signal sessions, device lists, LID mappings) in its credential store, including for ignored senders. The spike's auth folder showed such files; only their names were checked. That store is encrypted and deleted on unlink. This is another reason for the dedicated number per clinic in ADR 0012.
9. **Retry receipts need the sent message.** When a recipient's device cannot decrypt a message, it asks for a resend, and Baileys calls `getMessage` for the content. The gateway keeps the outgoing message content for a short time (one hour in the spike) for that purpose only. The content carries no medical data, by ADR 0012.
10. **Linking state.** `creds.registered` stays `false` after a QR link; "linked" is `connection: open` with `creds.me` set. `fetchLatestWaWebVersion()` returned two different versions within a minute; the version used is logged at each connect.
11. **Push needs a development or release build on Android.** Expo Go on Android dropped remote push in SDK 53; Expo Go on iOS still received remote push (with a warning). The patient app is tested with development builds.
12. **Expo needs the FCM V1 key per Android app.** Without it, Expo returns `InvalidCredentials`. The key is uploaded once per app to EAS. `eas credentials` is interactive only; on Windows it refused typed paths ("File does not exist") until the file was placed at the default name it suggests.
13. **Keep the native token too.** Both the Expo token and the native token (FCM or APNs) were obtained in under a second. Storing both lets the server send directly through FCM and APNs if Expo's push service ever becomes unreachable from our server or blocked. The direct FCM path was proven.
14. **Device clocks differ.** The iPad reported a delivery latency of −129 ms: its clock and the PC's disagree. Push latency is measured as "seen at once" by a person or from server timestamps, never by subtracting clocks of two devices.
15. **Build tooling from Syria.** The Firebase console, Expo (sign-in and project creation) and the Gradle and Maven downloads worked from Azaz. Android's `sdkmanager` could not fetch its package list, so the NDK version Expo expects (27.1) could not be installed; the spike pinned an installed NDK (27.0) instead. The first local release build took about 10 minutes. EAS Build (cloud) was not tried.

## Not covered (next steps or open)

- **Reply-with-code OTP:** the spike had a path that verified a code replied in the chat; it was not exercised (both codes were entered on the verify page), and it is **not part of the design**. Someone who starts a sign-in with a victim's number would be verified when the victim replies with the code. ADR 0012 keeps reverse verification for later; ADR 0022 keeps OTP one-way.
- **An iPhone:** the iOS device was an iPad, which uses the same APNs path.
- **Push from a non-Turkish Syrian network on iOS:** the iPad was on the Turkish-egress Wi-Fi; only the Android phone was tested on MTN Syria.
- **Several sessions in one process, and memory per session:** S03 and S18.
- **Ban behavior, number warm-up and failover between platform numbers:** S03, needs Q4.
- **The gateway running on the production host:** hosting is open (Q1).
- **Media messages, groups and pairing codes:** none are planned.

## Owner clean-up after the spike

- Unlink the spike's linked device from the personal WhatsApp: Linked devices → "Ubuntu / Chrome" → Log out. Then delete `spikes/whatsapp-gateway/.data/`.
- Uninstall the spike app from the Android phone and remove Expo Go if not needed.
- Delete the service account key in Firebase (Project settings → Service accounts) and the local key file `spikes/whatsapp-gateway/push-app/api-*.json`, or delete the Firebase project `vertex-shifa-push-spike` and the Expo project `vertex-shifa-push-spike`. All are git-ignored and synthetic, but the key grants sending rights.
