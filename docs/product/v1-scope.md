# Vertex Shifa — V1 Scope

Status: Approved by the owner on 2026-10-09 (from the analysis of 2026-10-08 and 2026-10-09). Changes to this file need the owner's approval.

## 1. Business context

V1 sells **Vertex Shifa Clinic** to doctors and clinics in Azaz, with the **Vertex Shifa** patient app as its strongest selling point. A clinic replaces its paper book, Excel sheets and personal WhatsApp with one system that works without internet.

Clinic journey:

```
Onboarding (structure, staff, hours, visit types, prices, import patients from Excel)
→ Bookings from reception and from the app → Arrival and live queue → Visit (template, diagnosis,
prescription, requests, documents) → Invoice and payment → Reminders and notifications → Reports
```

Patient journey:

```
Install the app → Verify the phone by WhatsApp OTP → Add family members → Find a clinic
→ Book a time or a queue ticket → Follow the queue live → Visit → Prescription and documents in the app
```

### Problems V1 must solve

1. Internet and power cuts stop clinic work and lose bookings.
2. Patients wait hours in waiting rooms without knowing their turn.
3. Paper records get lost; patient history is scattered across books and phones.
4. Double bookings between the phone, the reception desk and walk-ins.
5. Unpaid balances and cash in three currencies tracked by memory.
6. Generic foreign software that ignores Arabic, local practice (queues, family phones) and local currencies.

## 2. People

| Who | Uses the system for |
|---|---|
| **Clinic owner** | Everything in their clinic: structure, staff, prices, settings, reports, WhatsApp link |
| **Doctor** | Their schedule and queue, visits, prescriptions, documents, their patients |
| **Reception** | Bookings, arrivals, queue, patient registration, payments, cash session |
| **Nurse** | Arrivals, vitals, queue |
| **Accountant** | Invoices, payments, balances, expenses, financial reports |
| **Patient** (and family manager) | Booking, queue tracking, shared records, notifications |
| **Platform staff** (Vertex) | Console: clinics, contracts, entitlements, billing, templates, medication catalog, monitoring, support |

Roles are presets with adjustable permissions within limits (F02).

## 3. Design principles for V1

1. **Medical records are sacred.** Append-only clinical data, audit of every read, no medical content outside the platform.
2. **Offline is normal.** Every clinic workflow in this scope works offline except those listed in ADR 0008.
3. **Nothing collides silently.** Channel capacity pools, conflict inbox, the moved patient is always told.
4. **Fast on weak connections.** Small payloads, delta sync, compressed images.
5. **Arabic-first and local.** RTL, Arabic name matching, Syrian and Turkish phones, three currencies, queue-based clinics.
6. **Sellable from day one.** Each feature below is something a clinic in Azaz would pay for or would not buy without.

## 4. Features

★ marks a feature that sells the system.

### Clinic system (desktop app and web)

**F01 — Clinic setup and structure.** Onboarding wizard: name, logo, address, default currency, working days. One model for a solo doctor, a clinic with several doctors and several branches (ADR 0004). Branch settings: address, map location, contact phone, queue display options.

**F02 — Staff, roles and permissions.** Invite staff by phone. Preset roles (owner, doctor, reception, nurse, accountant) with adjustable permissions inside limits. A person can work in several clinics with different roles (ADR 0005). Staff are scoped to branches.

**F03 — Devices and offline sign-in.** Device registration, PIN sign-in while offline, limited offline session length, remote revoke and wipe on next connection, device list per clinic (ADR 0005, 0008).

**F04 — Working hours and visit types.** Hours per doctor per branch, breaks, leave and holidays, one-off exceptions (closed day, extended session). Visit types (consultation, follow-up, procedure…) with duration and price per currency.

**F05 — Appointments and booking.** Two booking modes per doctor and branch: timed slots and queue sessions with capacity (ADR 0009). Channel pools (online, reception, shared). Day and week calendars per doctor. Create, move, cancel, mark no-show. Appointment states from booked to completed. Walk-ins join the queue directly.

**F06 — Offline booking policy and conflict inbox.** Per-clinic policy while offline: strict partition, shared pool frozen in the cloud, or app bookings as requests awaiting confirmation (ADR 0009). The conflict inbox at reception, automatic alternative suggestions, and notification of the moved patient.

**F07 — Reception and live queue.** ★ Check-in, call next, recall, move up or down, skip with reason, send in to the doctor, finish. Expected waiting time from the doctor's real average duration. Works offline.

**F08 — Waiting-room display.** ★ A TV screen per branch or doctor: current and next numbers, short names only, optional sound on call.

**F09 — Patients.** Patient file with Syrian naming (first, father, family, mother's name), Syrian and Turkish phones, date of birth, sex. Fast Arabic search with name normalization. Duplicate detection and human-approved merge. Family links (guardian, children, parents). Attachments (photos of paper results, imaging, reports), compressed on the device (ADR 0006).

**F10 — Import patients from Excel.** ★ Column mapping, preview, validation report, duplicate check, re-runnable import. Required to onboard clinics with years of records.

**F11 — Visit record.** Template-driven note (complaint, history, examination, assessment, plan), vitals with standard units, diagnoses searched in ICD-10 (Arabic and English) with per-doctor favorites, the patient summary (allergies, chronic conditions, current medications, blood group), the visit timeline. Append-only with version history (ADR 0007).

**F12 — Prescriptions.** Search the platform medication catalog (F38, ADR 0011), dose, frequency, duration, instructions; per-doctor favorite prescriptions; repeat a previous prescription; print on the clinic letterhead; share to the patient app. Each prescription keeps a snapshot of its medications.

**F13 — Lab and imaging requests.** Printed request forms from a test catalog, results attached back to the request when the patient returns (prepares Vertex Shifa Lab).

**F14 — Medical documents and printing.** Medical report, sick leave, referral letter and request forms from templates, printed on the clinic letterhead, shareable to the patient app.

**F15 — Specialty templates: general and dental.** The general template for every clinic. ★ The dental pack: odontogram, per-tooth findings and procedures, multi-session treatment plans with cost and installments. Other specialties are added on demand later (ADR 0010).

**F16 — Custom fields.** Bounded custom fields on the patient file and the visit form: allowed types, order, required or optional, hide optional standard fields; core and required fields are protected; a field with data is archived, never deleted (ADR 0010).

**F17 — Billing, payments and cash.** Prices per visit type and procedure, discounts by permission, invoices with partial payments, patient balances due, payments in USD, TRY or SYP with the rate stored, a cash session per staff member and branch with opening and closing counts (ADR 0014).

**F18 — Clinic expenses.** Simple expense entries by category and currency, so the owner sees net income.

**F19 — Reports.** Daily and monthly: patients seen, income by doctor and currency, balances due, no-show rate, top diagnoses, cash sessions. Reports show the time of the last sync.

**F20 — Patient notifications.** Automatic messages (booking confirmation, reminder, change, "your turn is near") and manual messages from the clinic, through in-app push and the clinic's WhatsApp. No medical content in WhatsApp (ADR 0012).

**F21 — Clinic WhatsApp link.** The clinic links its own WhatsApp number by scanning a QR code; connection status, re-link, per-clinic message templates within limits, sending limits, opt-out handling (ADR 0012).

**F22 — Offline operation and sync status.** ★ Every clinic workflow above works offline (ADR 0008). A permanent sync indicator (last sync time, pending changes), a sync problems view, safe app updates.

**F23 — Audit, backup and data export.** Audit log of changes and of medical-record reads, viewable by the owner; daily server backups; the clinic can export all its data (ADR 0016).

### Patient app (Vertex Shifa, Android and iOS)

**F24 — Account and family.** Sign-up and sign-in by phone with a WhatsApp OTP (ADR 0012); automatic link to files that clinics created for the same phone after verification; family members managed by one account; account deletion inside the app.

**F25 — Find clinics and doctors.** Clinics and doctors on the platform by specialty, area and name; clinic page with doctors, hours and location.

**F26 — Booking.** Book a time or a queue ticket from the online pool; clear states (confirmed or awaiting confirmation); cancel or move within the clinic's policy.

**F27 — Live queue tracking.** ★ "4 patients before you, about 35 minutes"; a push when the turn is near; works while the clinic is online and states clearly when it is not.

**F28 — My health record.** Items the clinic shared (prescriptions, reports, results), and a personal health profile the patient keeps (allergies, chronic conditions, blood group).

**F29 — Notifications center.** In-app history of every notification, with push for new ones.

### Public clinic site

**F30 — Clinic public page and web booking.** A page per clinic on a platform subdomain: doctors, hours, location, booking from the browser after a WhatsApp OTP. "Powered by Vertex Shifa" always shown (ADR 0015, 0018).

**F31 — Custom domain.** The clinic's own domain for its public page: CNAME, verification, automatic TLS (ADR 0015). Sold as an add-on or included in a package.

### Platform console (Vertex staff)

**F32 — Tenants and onboarding.** Clinics, their branches and owners, onboarding checklist, status.

**F33 — Catalog, packages, quotes and contracts.** The feature and limit catalog, packages Plus, Pro and Max as presets, custom quotes, contracts with line items, list and actual price, discount reason, currency, billing model (monthly, annual, perpetual license, hosting and domain only, setup fee, installments) (ADR 0013).

**F34 — Entitlements and overrides.** Entitlements derived from the contract, manual overrides, private features enabled for one clinic, trials (ADR 0013).

**F35 — Subscription billing.** Invoices and manually recorded payments (cash, Sham Cash, USDT, transfer) in several currencies, reminders, grace period, read-only suspension with export, never locking medical data.

**F36 — Domains.** Subdomains and custom domains, verification and certificate status.

**F37 — Clinic health monitoring.** Last sync per device, app versions, sync errors, WhatsApp session status, alerts.

**F38 — Global templates and medication catalog.** Specialty packs and global templates; the platform medication catalog with official-source imports and the review queue for clinic suggestions (ADR 0010, 0011).

**F39 — Support access.** Platform staff open a clinic's account only with the clinic's permission, for a limited time, fully audited.

**F40 — Platform staff accounts.** Console accounts with mandatory TOTP and an audit log of every console action.

## 5. Packages (presets, prices per contract)

| | Plus | Pro | Max |
|---|---|---|---|
| For | Solo doctor | Clinic with several doctors | Medical center, several branches |
| Limits | 1 doctor, 1 branch | Several doctors, 1 branch | Several doctors and branches |
| Adds | Full core, offline, patient app, WhatsApp | Waiting-room display, custom fields, more roles and reports | Branches, custom domain included, cross-branch reports |

Package contents and limits are finalized in the commercial spec (`docs/open-questions.md` Q5). Any contract can add or remove items: "Custom" is a contract that starts empty.

## 6. Out of scope for V1

Lab, pharmacy and hospital products · online payment · insurance · video consultations · drug interaction checks · stock and supplies · payroll and full accounting · ratings and reviews · AI features · the clinic LAN hub (ADR 0008) · a public marketplace beyond clinics on the platform · SMS and email · UI languages other than Arabic · a third specialty pack.

## 7. Non-functional requirements

- **Offline:** a full clinic day offline without data loss; sync of a day's work in under a minute on a weak connection.
- **Devices:** Windows 10 and later on modest PCs for the clinic app; Android 8+ and iOS 16+ for the patient app.
- **Performance:** search and queue actions feel instant (local reads); public pages light enough for slow mobile data.
- **Security and privacy:** ADR 0016; Syrian Law No. 12 of 2024 respected; legal review before the pilot (Q2).
- **App stores:** privacy policy, in-app account deletion, health-app declarations, data-safety forms.
- **Language:** Arabic UI only, i18n-ready; Latin digits.
