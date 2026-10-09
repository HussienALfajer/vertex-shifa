# <ID> — <Spec name>

Status: Draft | Approved · Date: YYYY-MM-DD · Features: `docs/product/v1-scope.md` F<nn>, F<nn> · ADRs: <list>

## Summary
Two or three sentences: the problem this solves for clinics, patients or the platform, and what V1 of it does.

## In scope / out of scope
- In: …
- Out (later or never): …

## Access and entitlements
| Action | Surface | Who (permission) | Feature key |
|---|---|---|---|
| Book an appointment | Clinic app, sync command | Reception, doctor (`appointments.create`) | `scheduling.core` |
| Book from the app | Patient app | Verified patient | `patient-app.booking` |

## Data
For each entity: table, fields (name, type, required, constraints), relations, indexes, unique keys (command ids, external references), tenant ownership and RLS, whether it is archived or append-only. Money fields name their currency (ADR 0014). Codes name their system (ADR 0007).

## States and rules
States and allowed transitions (who or what triggers each, what happens). Business rules as numbered, testable statements.

## Offline behavior and conflicts
Which actions work offline and as which sync commands; what each command's server-side re-execution checks; number ranges used; what conflicts can occur, how each is resolved, who is told, and what the user sees while offline (ADR 0008, 0009). "Online only" with the reason if the feature does not work offline.

## Clinical data and privacy
Which medical data is created, read or shared; versioning and snapshots (ADR 0007); audit of reads; what reaches the patient app; what must never appear in WhatsApp, logs or errors (ADR 0016). "None" if the feature touches no medical data.

## Money
Every amount: currency, rounding, rates stored, append-only rows and reversals (ADR 0014). "None" if the feature moves no money.

## API and commands
| Method and path / command | Access | Request | Response | Error codes |
|---|---|---|---|---|
| `POST /api/appointments` | Staff, `appointments.create` | `createAppointmentSchema` | `appointmentSchema` | `SLOT_TAKEN`, `POOL_EXHAUSTED`, `NOT_ENTITLED` |

## Jobs, events and notifications
Events published and consumed (versioned names); worker jobs (queue, trigger, retries, why they are safe twice); push and WhatsApp messages (template, trigger, recipient; no medical content in WhatsApp).

## Screens
For each screen: app (clinic, console, site, patient), route, purpose, content and actions, and its loading, empty, error and offline states. Note what each role sees differently.

## Audit
Which changes and reads write audit entries.

## Abuse and failure cases
How the feature can be abused or fail (bots, replays, double submits, races, stolen devices, cross-tenant access, WhatsApp bans, long offline periods) and the control for each.

## Edge cases
Numbered list: concurrency, clock skew, archived references, empty data, limits reached, entitlement removed mid-use, very long offline periods.

## Open questions
Anything not yet decided, with a recommendation. Nothing here may be guessed during implementation.

## Acceptance
- End-to-end check the owner runs, step by step (accounts to use, what to click, what to see), including one offline scenario where relevant.
- Tests: API (success, 401, 403, another tenant, missing entitlement per endpoint), unit (rules), sync (late commands, duplicates, conflicts), clinical (versions, audit), E2E and RTL screenshots (screens).
