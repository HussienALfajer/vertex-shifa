# 0006 — Patient identity: a platform person, a chart per clinic, consent between them

Status: Accepted · Date: 2026-10-09

## Context
If a patient were only a record inside one clinic, the patient app could never show one person's bookings across clinics, and a future lab or pharmacy could not receive a clinic's request for the same person. In Syria national IDs are often missing, phones are shared by families, and Arabic names are spelled in many ways.

## Decision
- **Three levels:**
  - `person`: the human being, platform-level; may have an app account (ADR 0005).
  - `patient_chart`: the person's file inside one tenant, owned by that tenant (RLS, ADR 0004).
  - **Patient index (MPI):** the links between a person and their charts, with match evidence and status.
- **Family:** a person may manage others (children, parents) through `related_person` links with a relationship and permissions. One phone may serve a whole family; the phone identifies an account, not a patient.
- **Matching:** never on national ID alone. Candidates come from phone, normalized full name (first, father, family), mother's name and date of birth. Arabic normalization folds ة/ه, ى/ي, أ/إ/آ/ا, removes tatweel and diacritics, and treats "عبد ال…" with or without a space as equal. Matches above a threshold are proposed, never merged automatically: a person approves (reception for charts, the patient for app links after OTP).
- **Consent:** sharing data outside the owning tenant needs a consent record (who, what scope, until when). In V1 the clinic chooses which items are shared with the patient (prescriptions, reports, results); sharing between organizations arrives with the lab and pharmacy products, through the same consent model.
- **Merge:** a merge is reversible: it links and marks the duplicate, never deletes it.

## Consequences
- The patient app works across every clinic on the platform from V1.
- Labs and pharmacies later receive orders for the same person without a new identity model.
- Duplicate review is a recurring reception task; the UI must make it quick.
