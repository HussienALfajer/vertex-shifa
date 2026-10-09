# 0010 — Templates, specialty packs and bounded custom fields

Status: Accepted · Date: 2026-10-09

## Context
Each specialty records different data; each clinic wants some fields of its own. Hard-coding specialties or letting clinics change the schema would fork the product. V1 ships the general template and the dental pack only; other specialties are added when clinics need them (owner, 2026-10-09).

## Decision
- **Two-level modeling:** the reference model is code (visit, observation, diagnosis, procedure, prescription, document); clinical content is data: versioned **templates** that describe sections, fields, types, units, codes and validation, rendered by one form engine in the clinic app.
- **Inheritance:** global template → specialty pack → tenant override → branch or doctor override. Overrides can add fields, reorder, hide optional fields and change defaults; they cannot remove or redefine core or required fields.
- **Specialty packs** bundle templates, favorite diagnoses, visit types, document templates and, when needed, dedicated components (the dental odontogram and treatment plans). V1 packs: `general`, `dental`.
- **Custom fields:** clinics add fields to the patient file and visit forms. Allowed types: text, long text, number with unit, date, single or multiple choice, yes/no, attachment, coded value from a platform list. Limits per entity come from the entitlement (ADR 0013). A field with data is archived, never deleted; a type never changes once data exists.
- **Storage:** structured values are stored with the template or field definition id and version (JSONB validated against the definition, indexed where searchable). Fields mapped to a standard code (LOINC, ICD-10) remain exchangeable.
- **Versioning:** every record keeps the definition version it was written with; a new version never breaks old records.

## Consequences
- A new specialty is a data package plus, rarely, a component: no schema change for clinics.
- The form engine and its validation are core code with broad tests.
- A medical advisor reviews each specialty pack before release (Q7).
