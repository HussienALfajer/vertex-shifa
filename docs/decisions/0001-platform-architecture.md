# 0001 — Platform architecture: one core, a shared health domain, products as modules

Status: Accepted · Date: 2026-10-09

## Context
The owner will build several systems on one platform: clinics first, then labs, pharmacies and hospitals. Adding a product must be easy and must not disturb the products already running. The system is built by Claude Code across many sessions (ADR 0019), so boundaries must be explicit and machine-checked. Traffic is small at first; operational simplicity matters more than independent scaling.

## Decision
- **A modular monolith** in one repository: one API process and one worker process, split into modules with strict boundaries. Services are extracted only for a measured reason (a different scaling or reliability profile, or a separate compliance scope). The WhatsApp gateway is separate from the start because it holds long-lived connections (ADR 0012).
- **Three layers of modules:**
  1. **Platform core:** identity and access, tenancy and organizations, entitlements and contracts, configuration and templates, messaging, files, audit, domains, sync.
  2. **Shared health domain:** person and patient index, practitioners, scheduling, clinical record, orders and results, medications, consent, terminology.
  3. **Products:** `clinic` now; `lab`, `pharmacy`, `hospital` later. A product adds workflows and screens; it reuses layers 1 and 2.
- **Module rules:** a module owns its tables and is the only one that queries them; other modules use its public surface (`index.ts`) or its events; no cross-module joins in code. Lower layers never depend on higher ones.
- **Events:** state changes other modules care about are published as versioned integration events (`appointment.booked.v1`) written to an outbox in the same transaction as the change and dispatched by the worker. Consumers are idempotent. Today the dispatcher is in-process (pg-boss); a broker can replace it without changing modules.
- **Apps:** the clinic desktop app, the console, the public site and the patient app are clients of the same API and contracts (ADR 0002).

## Consequences
- A future lab product subscribes to `service-request.created` and publishes `diagnostic-report.issued`; the clinic product needs no change to work with it.
- Module boundaries and layer direction are enforced by architecture tests (ADR 0020).
- Some flexibility of microservices is given up for one deployable, one database and simple transactions.
