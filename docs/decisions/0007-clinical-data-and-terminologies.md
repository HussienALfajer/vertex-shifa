# 0007 — Clinical data: FHIR-aligned model, standard terminologies, append-only records

Status: Accepted · Date: 2026-10-09

## Context
Future products (lab, pharmacy, hospital) and possible future integrations need one clinical language. FHIR is the international exchange standard; R4 is what partners use today, R6 is not final. A raw FHIR server would limit customization and offline work.

## Decision
- **Own relational model, FHIR-aligned:** tables and contract names follow FHIR concepts (Patient, Practitioner, PractitionerRole, Organization, Location, Schedule, Slot, Appointment, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest, ServiceRequest, DiagnosticReport, DocumentReference, Consent), without being tied to a FHIR version. A FHIR facade (R4 first) can be added at the boundary when an integration needs it.
- **Terminologies:** ICD-10 for diagnoses (Arabic display names maintained by the platform), LOINC for lab tests, ATC for medicines (ADR 0011), UCUM for units. SNOMED CT is not used in V1 (licensing). Codes are stored as `system + code + display` so another system can be added later.
- **Append-only clinical records:** a visit note, diagnosis, prescription or document is never updated in place or deleted. Changes create a new version with author, time and reason; corrections mark the previous version as entered in error. Each item has one author; concurrent edits create versions, never overwrites (ADR 0008).
- **Snapshots:** a prescription stores the medication's name, strength and form at the time of writing; a document stores its rendered content; later catalog or template changes never alter past records.
- **Template-driven content** stores structured values with the template id and version (ADR 0010).

## Consequences
- Every clinical record is reconstructible as it was at any time, which matters for medical-legal disputes.
- Storage grows with versions; acceptable at clinic scale.
- Arabic ICD-10 display names are platform data maintained in the console.
