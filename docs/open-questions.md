# Open questions

Decisions that belong to the owner. Agents must not guess answers to these. When one is resolved, record the answer (and an ADR if it shapes the system) and move it to the resolved list.

| ID | Question | Needed before | Recommendation |
|---|---|---|---|
| Q1 | Hosting provider and region; the platform domain (public pages, API, patient app links) | Phase 0 deploy skeleton | A VPS provider that serves Syrian users without blocking (as for the owner's other Vertex servers); a dedicated product domain |
| Q2 | Legal review: Law No. 12 of 2024 obligations for health data, record retention periods, consent wording | Pilot | A Syrian lawyer reviews the privacy policy, consent texts and retention before the pilot |
| Q3 | Syrian trade-name drug data: license from an existing drug-guide publisher, or build from official lists and clinic suggestions only | S12 | Start with official lists and suggestions; contact the "دليل الأدوية السورية" publisher for a license |
| Q4 | Platform WhatsApp numbers for OTP: how many, Syrian or Turkish SIMs, who keeps the phones | S03 (one test number for Spike B) | Two numbers at launch for failover, kept by the owner |
| Q5 | Package contents, limits and list prices for Plus, Pro and Max | S22 (and before the first sale) | Spec interview |
| Q6 | Pilot clinics: which two or three clinics in Azaz, which specialties, their working style (queue or times) | S09 | One dental, one general; interview them before S09 |
| Q7 | Medical advisor (a doctor) who reviews templates, documents and prescription forms | S11 | A doctor from the pilot clinics |
| Q8 | Clinic hardware baseline: Windows versions, RAM, printers (A4, A5, thermal), TVs for the waiting-room display | S13, and a sync volume test on pilot hardware (ADR 0021) | Collect from the pilot clinics |
| Q9 | Apple and Google developer accounts for publishing the patient app | S19 | Owner's accounts, opened early (Apple review takes time) |
| Q10 | Push notification delivery (FCM, APNs) to phones in Syria | Spike B | Test on real devices in Azaz |
| Q11 | Arabic and Latin fonts of the Vertex identity: license covers desktop app, mobile app and printed documents | Brand phase | Check Vertex Hub's font licenses; use the same fallbacks |
| Q12 | Exchange rates in clinics: each clinic enters its own rates, or the platform publishes a daily suggestion | S16 | Each clinic enters its rates; the platform may suggest later |
| Q13 | The Syrian pound after the 2026 redenomination: ISO 4217 code and minor-unit exponent used in software and on invoices | S16 | Confirm with the Central Bank of Syria publications; until then `SYP` with exponent 2 (ADR 0014) |
| Q14 | A revoked clinic device has unsynced clinical or money commands (notes, prescriptions, payments made before the revocation): upload them to a quarantine that the clinic reviews, or drop them with the wipe | S02 (devices) | Quarantine: the server accepts them flagged as coming from a revoked device, applies nothing until a clinic owner reviews each one (ADR 0021) |

## Resolved

| Question | Answer | Date |
|---|---|---|
| Name | Vertex Shifa (فيرتكس شفا); "Vertex" always visible (ADR 0018) | 2026-10-09 |
| Folder, repository, package scope | `D:\vertex-shifa`, public GitHub `HussienALfajer/vertex-shifa`, `@vertex-shifa/*` | 2026-10-09 |
| License | Proprietary, all rights reserved; source public for transparency (`LICENSE`) | 2026-10-09 |
| First market | Syria, starting in Azaz | 2026-10-08 |
| External integrations in V1 | None (no ministry, insurance or third-party systems) | 2026-10-08 |
| Architecture | Modular monolith with platform core, health domain and products (ADR 0001) | 2026-10-08 |
| Offline | Clinics must work offline; local-first with server authority (ADR 0008) | 2026-10-08 |
| Commercial model | Packages as presets plus a contract per customer, any billing model (ADR 0013) | 2026-10-09 |
| Specialties in V1 | General and dental only; others added on demand (ADR 0010) | 2026-10-09 |
| Medication list | One platform catalog merging official sources and reviewed clinic suggestions (ADR 0011) | 2026-10-09 |
| Messaging channels | In-app push and WhatsApp only; no SMS, no email (ADR 0012) | 2026-10-09 |
| OTP | WhatsApp only in V1 (ADR 0012) | 2026-10-09 |
| Clinic WhatsApp | Each clinic links its own number by QR (ADR 0012) | 2026-10-09 |
| Patient app | React Native + Expo on both stores, no PWA (ADR 0003) | 2026-10-09 |
| Brand | Vertex Hub identity and logo with SHIFA; components copied and adapted at the brand phase (ADR 0018) | 2026-10-09 |
| Development method | Claude Code (Opus 5.5) with the method in ADR 0019 and `docs/workflow.md` | 2026-10-09 |
