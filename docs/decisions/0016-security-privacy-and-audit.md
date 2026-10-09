# 0016 — Security, privacy and audit

Status: Accepted · Date: 2026-10-09

## Context
The platform holds medical records. Syria's Law No. 12 of 2024 on electronic personal data gives access, correction, erasure and objection rights; there is no Syrian rule specific to health data yet, and amendments are discussed. The repository is public. The standard is set above the current law.

## Decision
- **Encryption:** TLS everywhere; database and backups encrypted at rest; local clinic databases encrypted (SQLCipher or equivalent) with keys bound to the device and user session; WhatsApp session credentials and secrets encrypted in the database.
- **Audit:** append-only audit log for changes to clinical, money, access, configuration and contract data, and for **every read of a medical record** (who, what, when, from which device, under which reason for break-glass). The audit row is written in the same transaction as the change. Audit rows cannot be updated or deleted (trigger and grants).
- **Minimum exposure:** medical data never appears in logs, error trackers, analytics, WhatsApp messages, URLs or push notification text; error reports carry ids only.
- **Data rights:** a clinic can export all its data; a patient can see what clinics shared and delete their app account (charts stay with the clinics as medical records, per law and retention rules); correction requests go through the clinic.
- **Retention:** clinical records are never deleted by users; retention periods are set after the legal review (Q2).
- **Public repository:** no secrets, no real data of any person or clinic, synthetic fixtures only; gitleaks in CI; agents are denied reads of `.env` files.
- **Application security:** server-side authorization on every endpoint and command (ADR 0005); input validated by contract schemas; rate limits and a proof-of-work challenge on OTP, sign-in and public booking; uploads checked and re-encoded; secure headers and CSP; dependency updates monitored.
- **Backups:** daily encrypted backups stored off the server, with a tested restore before the pilot.
- **Support access:** platform staff open a clinic's data only with the clinic's permission, time-limited and audited (F39).
- A legal review of Law 12/2024 and health-data obligations happens before the pilot (Q2).

## Consequences
- Every spec has a "Clinical data and privacy" section.
- The reviewer subagent checks privacy and isolation on every feature (ADR 0019).
