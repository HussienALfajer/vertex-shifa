# 0004 — Tenancy: one organization model, row-level security, a silo option

Status: Accepted · Date: 2026-10-09

## Context
Customers range from a solo doctor to multi-branch medical centers, and later labs, pharmacies and hospitals. Medical data of one customer must never be visible to another. Isolation that depends on every query remembering a `WHERE tenant_id` clause is too fragile for a system written across many AI sessions.

## Decision
- **One hierarchy for every customer:** `tenant` (the contracting customer) → `facility` (branch; type `clinic` now, later `lab`, `pharmacy`, `hospital`) → optional `unit` (department) → `practitioner_role` (a person working at a facility with a role and a schedule). A solo doctor is a tenant with one facility and one practitioner: no special case in code.
- **Pool model by default:** one PostgreSQL database; every tenant-owned table has `tenant_id`, a row-level security policy, and `FORCE ROW LEVEL SECURITY`.
- **Roles:** an owner role runs migrations; the apps connect as a restricted role that cannot bypass RLS. Tenant context is set per transaction with `SET LOCAL` from the authenticated session, never from client input.
- **Platform-level tables** (people, the medication catalog, global templates, contracts) are separate and access-controlled by the platform core; patient data shared across tenants goes through consent (ADR 0006).
- **Silo option:** a tenant catalog records where each tenant's data lives. The data-access layer does not assume a single database, so a large customer can later move to its own database without code changes.
- **Enforcement:** a convention test fails when a table with `tenant_id` lacks an enabled, forced policy; API tests check every endpoint with a user of another tenant.

## Consequences
- Isolation holds even when application code forgets a filter.
- Queries pay a small RLS cost; indexes start with `tenant_id`.
- Cross-tenant platform jobs (reports for the console, monitoring) run under a separate, audited role.
