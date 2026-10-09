# Vertex Shifa — Vision

Status: Approved by the owner on 2026-10-09.

## The platform

Vertex Shifa is a health platform, not a single clinic system. One platform core (identity, organizations, access, entitlements, configuration, messaging, audit, sync) and one shared health domain (people and patients, practitioners, scheduling, clinical records, orders and results, medications, consent) carry a family of products:

| Order | Product | Who it serves | Status |
|---|---|---|---|
| 1 | **Vertex Shifa Clinic** | Solo doctors, clinics with several doctors, multi-branch medical centers | V1 |
| 1 | **Vertex Shifa** patient app | Patients and families | V1 |
| 2 | Vertex Shifa Lab | Medical laboratories | Later |
| 3 | Vertex Shifa Pharmacy | Pharmacies | Later |
| 4 | Vertex Shifa Hospital | Hospitals | Later |

A new product is a new module on the same core: it reuses the patient, the practitioner, scheduling, orders and the event stream, and adds only its own workflow. A clinic's lab request becomes the lab's work item; a prescription becomes the pharmacy's dispense. Adding a product must not require changes to the products that came before it (ADR 0001).

## The market

Syria, starting in Azaz (northern Aleppo). Conditions that shape the product:

- Power and internet cut often: clinics must work a full day offline (ADR 0008).
- Three currencies in daily use (USD, Turkish lira, Syrian pound) and cash-first payment (ADR 0014).
- Many clinics run on a queue ("الدور") rather than exact appointment times (ADR 0009).
- National IDs are not always available; families share phones; Syrian and Turkish numbers coexist (ADR 0006).
- Several global services are blocked or restricted for Syria: no Cloudflare, no official WhatsApp Business Platform, no Stripe (ADR 0012, 0015, 0017).
- Almost no established clinic software in the local market: the first trustworthy, offline-capable, Arabic-first product can lead it.

## Principles

1. **Patient safety and privacy first.** Medical records are never lost, leaked or silently overwritten.
2. **Works without internet.** Offline is the normal case, not an error state.
3. **One platform, many products.** Shared core and health domain; products only add workflows.
4. **Configuration, not forks.** One codebase for every customer. A feature requested by one clinic is built as a normal feature, enabled for that clinic, and later offered to others (ADR 0013).
5. **Customizable within clear limits.** Specialty templates and bounded custom fields; core and legally required data stay protected (ADR 0010).
6. **Standards inside.** FHIR-aligned model and standard terminologies, so future products and future integrations speak one language (ADR 0007).
7. **Vertex is always visible.** Every product carries the Vertex Shifa name and the Vertex identity (ADR 0018).
8. **The clinic pays; the patient app sells the clinic.** The patient app serves the patients of subscribed clinics and is the clinic's strongest reason to buy.
