# 0009 — Scheduling: timed slots and queue sessions, capacity pools per channel

Status: Accepted · Date: 2026-10-09

## Context
Many clinics in Syria work by queue ("الدور") within a session, others by exact times. Bookings arrive from reception (often offline) and from the patient app and public page (always through the cloud). Double bookings must never happen silently.

## Decision
- **Two booking modes,** chosen per practitioner role and branch, possibly per session:
  - **Timed slots:** a `schedule` produces `slot`s of a visit type's duration.
  - **Queue sessions:** a session (e.g. evening) has a capacity; a booking takes a ticket; the order is settled at arrival.
- **Capacity pools per channel:** each session or slot range splits its capacity into `online` (patient app and public page), `reception`, and `shared`. A channel books only from its own pool and the shared pool.
- **Clinic connectivity:** clinic devices send heartbeats; the cloud knows whether a clinic is online. While it is offline, the cloud freezes the shared pool.
- **Offline policy per clinic** (F06): strict partition (no shared pool), shared pool frozen in the cloud while offline (default), or app bookings become requests awaiting the clinic's confirmation.
- **Conflict resolution on sync:** the server detects overlaps; the default winner is the booking made with the patient present at the clinic, otherwise the one that reached the server first. The other booking is never cancelled silently: the system proposes the nearest alternatives, notifies the patient, and lists the case in the conflict inbox at reception.
- **Appointment states:** `requested`, `booked`, `confirmed`, `arrived`, `in_consultation`, `completed`, `no_show`, `cancelled`, with an allowed transition table in `packages/contracts`.
- **Queue estimate:** the expected wait uses the practitioner's recent real visit durations; shown to reception and in the patient app.

## Consequences
- Between channels, conflicts are impossible by construction except in the shared pool, in the minutes before the cloud notices a clinic is offline.
- Inside the reception channel, two clinic devices that are both offline can book the same timed slot or the last reception capacity, because they don't see each other's changes until one reconnects (ADR 0008). Such overlaps go to the conflict inbox with the same rules. A clinic with several reception devices can split its reception pool per device (an option set in the clinic settings) to make even these conflicts impossible.
- Clinics configure pool sizes; sensible defaults come from the onboarding wizard.
