# 0011 — Medication catalog: one platform list from official sources and reviewed suggestions

Status: Accepted · Date: 2026-10-09

## Context
Prescriptions need a medication list. A list per clinic would duplicate the same drug under many spellings and could not serve the future pharmacy product. Medicines in Azaz are both Syrian and Turkish. The owner chose a list built by the platform, merged with any Syrian drug database that can be used (owner, 2026-10-09).

## Decision
- **One platform catalog,** curated in the console, read by every clinic:
  - **Substance:** active ingredient (INN), ATC code.
  - **Product:** trade name, manufacturer, dosage form, strength, pack, country of origin (`SY`, `TR`, other), barcode when known, status (active, withdrawn).
  - **Favorites:** per-doctor favorite products and prescription sets (tenant data).
- **Sources:**
  1. The Syrian National Drug List (Ministry of Health, published through the Syrian Pharmacists Syndicate): substances and approved forms.
  2. The Turkish TİTCK detailed drug price list (official, updated weekly): Turkish trade names, barcodes, active substances, ATC codes.
  3. Syrian trade names from third-party drug guides only with the publisher's written permission (Q3); never scraped.
  4. Clinic suggestions: a doctor adds a missing medication; it is usable at once in that clinic as a pending item and enters the console review queue, where platform staff merge it into the catalog or map it to an existing product.
- **Imports** are repeatable jobs with a source, a version and a diff report; nothing is deleted, withdrawn products are marked.
- **Prescriptions keep a snapshot** of each medication (ADR 0007), so catalog changes never alter past prescriptions.
- Drug interaction checks are out of V1.

## Consequences
- The catalog becomes a shared asset for the future pharmacy product (barcodes, products, substances).
- Curation is a recurring platform task with a console screen (F38).
- Licensing of Syrian trade-name data is an open business question (Q3).
