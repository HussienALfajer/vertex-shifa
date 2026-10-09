# Spike B — WhatsApp gateway and push (throwaway)

Proves ADR 0012 (Baileys gateway, OTP, rate limits) and push delivery in Syria (ADR 0003, Q10). Findings: [`docs/spikes/B-whatsapp-gateway.md`](../../docs/spikes/B-whatsapp-gateway.md). Not product code; do not import from here.

**Never message anyone but your own test numbers.** The gateway refuses every number outside `ALLOWED_RECIPIENTS` and ignores incoming messages from anyone else.

## Gateway (Windows, Node 24, pnpm)

```bash
pnpm install
```

```bash
pnpm test
```

Copy `.env.example` to `.env`, set `ALLOWED_RECIPIENTS` and a random `OTP_PEPPER`, then:

```bash
pnpm gateway
```

Open `http://127.0.0.1:7311/qr` and scan it from WhatsApp → Linked devices. Control API (localhost only):

| Call | What |
|---|---|
| `GET /status` | Session state, receipts per message, limiter counters, memory |
| `POST /send {to, text}` | Send to an allow-listed number, through the rate limiter |
| `POST /otp/start {to}` | Issue and send an OTP |
| `GET /otp`, `POST /otp/verify {to, code}` | Verify an OTP (page or JSON); a code replied in WhatsApp never verifies (ADR 0022) |
| `POST /shutdown` | Close the socket without logging the device out |

The session's keys live in `.data/` and the event log (masked numbers, no message bodies) in `out/`; both are git-ignored. Unlink the device from the phone and delete `.data/` when done.

## Push

`push-app/` is an Expo SDK 57 probe app that shows the device's Expo and native push tokens and lists received notifications.
- **iOS:** `npx expo start --go` and open it in Expo Go.
- **Android:** a release build is needed (Expo Go has no remote push since SDK 53).
  1. Put the Firebase `google-services.json` in `push-app/`.
  2. Run `npx expo prebuild -p android`, then `android/gradlew assembleRelease`.
  3. Install the APK with `adb install`.

  If the NDK version Expo expects is missing, set `ext.ndkVersion` in `android/build.gradle` to an installed one.

```bash
node push-send.mjs expo "ExponentPushToken[...]"
```

```bash
node push-send.mjs fcm <fcm-device-token> <service-account.json>
```

Firebase and service-account files are git-ignored (`push-app/.gitignore`). Expo sends to Android only after the FCM V1 key is uploaded with `eas credentials -p android`.

## Layout

| Path | What |
|---|---|
| `gateway.mjs` | One Baileys session, lease, disconnect handling, receipts, intake filter, control API |
| `lib/rate-limiter.mjs`, `lib/otp.mjs`, `lib/phone.mjs` | Pure rules: per-number limits with warm-up, OTP issue and verify, number masking and JIDs |
| `test/rules.test.mjs` | Unit tests for the rules (fake clock, no WhatsApp traffic) |
| `push-app/` | Expo probe app |
| `push-send.mjs` | Expo push API and direct FCM HTTP v1 sender |
