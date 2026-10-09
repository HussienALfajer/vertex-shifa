# 0008 — Offline-first clinic app: local database, commands, server authority

Status: Accepted (sync engine to be confirmed by Spike A) · Date: 2026-10-09

## Context
Power and internet cuts are frequent in Azaz. A clinic must work a full day without internet. While a clinic is offline, two places can change its data: the clinic's devices and the cloud (patient app bookings). No system can keep both writable and guarantee no conflict; the design must prevent conflicts where possible and resolve the rest visibly.

## Decision
- **Local-first clinic app:** each clinic device holds an encrypted local SQLite database with the data its users need (partial replication by tenant, branch and role: upcoming appointments, the branch's patients, recent clinical records, catalogs). The UI reads and writes locally, online or not.
- **Commands, not row writes:** local changes are queued as typed commands (`BookAppointment`, `CheckIn`, `RecordVisitNote`, `TakePayment`…) defined in `packages/sync` with Zod schemas. The server re-executes each command with business rules and authorization, then accepts, adjusts or rejects it; the result streams back to devices. Commands are idempotent by id.
- **Sync engine:** PowerSync (self-hosted, PostgreSQL to SQLite, upload queue to our API) is the candidate. **Spike A** confirms it on Electron with a conflicting booking before Phase 1; if it fails, the fallback is our own command outbox with change streams over the same contracts.
- **Identifiers and numbers:** UUIDv7 created on the device. Human-readable numbers (file number, invoice number, queue ticket) come from ranges pre-allocated to each device, or a provisional number replaced on sync where the law or the clinic needs a strict sequence.
- **Time:** devices record device time and a hybrid logical clock; the server records its own time; a large clock skew raises a warning (power cuts reset PC clocks).
- **Conflicts:**
  - Bookings: prevented by channel pools, resolved in the conflict inbox (ADR 0009).
  - Clinical records: append-only versions per author, never overwritten; a concurrent change produces two versions shown to the doctor (ADR 0007).
  - Administrative fields (phone, address): last writer wins per field, with history.
  - Configuration (templates, permissions, prices, entitlements): changes only online.
- **Works offline:** booking within the device's pools, check-in and queue, patient registration, visits, prescriptions, documents and printing, invoices and payments, cash sessions. **Needs a connection:** patient app bookings, first sign-in on a new device, configuration changes, WhatsApp sending (queued in the cloud), data from other organizations.
- **Safety:** SQLite in WAL mode; commands survive power loss; app updates wait until the upload queue is empty; the sync protocol is versioned and the server accepts the previous version; the sync status and last sync time are always visible.
- **Clinic LAN hub** (devices syncing with each other without internet) is out of V1; the protocol is designed so a local hub can later act as a sync source.

## Consequences
- The clinic app feels instant even online.
- Business rules live on the server and run again for offline commands: a rule must be deterministic and safe to apply late.
- Each spec includes an "Offline behavior and conflicts" section (`docs/specs/_template.md`).
- Inside one clinic, devices see each other's offline changes only after one of them reconnects; an internet backup (4G router with a UPS) is part of the onboarding recommendation.
