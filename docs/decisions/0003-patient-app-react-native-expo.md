# 0003 — Patient app: React Native with Expo, published to both stores

Status: Accepted · Date: 2026-10-09

## Context
The patient app ships on Google Play and the App Store; the owner can publish on both, so no PWA version is needed. Flutter and React Native were compared: performance and RTL support are comparable in 2026. The deciding factor is the rest of the system, which is TypeScript (ADR 0002).

## Decision
- **React Native with Expo** (managed workflow, prebuild when a native module needs it).
- **Builds and releases:** EAS Build and EAS Submit for both stores; EAS Update for over-the-air fixes to JavaScript code between store releases.
- **Shared with the rest of the system:** contracts and validation, error codes, the API client, i18n catalogs, queue time estimation and money formatting, design tokens (`packages/tokens`). Components are built natively in `packages/ui-native` with the same tokens and spirit as the web components (ADR 0018).
- **Arabic RTL** forced at start; Latin digits.
- **Push:** Expo notifications over FCM and APNs (to be confirmed for Syria in Spike B, Q10).
- **Storage:** tokens in the device's secure storage; a read cache of the patient's appointments and shared records for weak connections. The patient app is not offline-first for writes: booking requires a connection.
- **Store requirements:** privacy policy, in-app account deletion, health-app and data-safety declarations.
- No PWA. Booking from a browser stays available through the clinic's public page (F30), which is a web page, not an app.

## Consequences
- The patient app follows the same contracts as the clinic app; a change in a contract is caught by type checks in both.
- A future doctor's mobile app can reuse `ui-native` and the shared logic.
- Flutter's single rendering engine is given up in exchange for one language and shared code.
