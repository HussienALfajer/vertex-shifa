# 0013 — Commercial model: catalog, packages as presets, a contract per customer, derived entitlements

Status: Accepted · Date: 2026-10-09

## Context
The owner sells each customer on negotiated terms: the same features can sell at different prices; billing can be monthly, annual, a perpetual license, or hosting and domain only. Fixed plans with fixed prices do not fit, but pure free-form selling would leak exceptions into code. A clinic may request a feature that runs only for it and is later offered to others.

## Decision
- **Four layers:**
  1. **Catalog:** modules, features and limits (doctors, branches, staff users, custom fields, storage, WhatsApp volume), each with a key, a product and dependencies.
  2. **Packages** Plus, Pro and Max: presets that pre-fill a quote. The code never checks a package name.
  3. **Contract** per tenant: line items (features, limits, add-ons, services), list price and actual price, discount reason, currency, billing model (`monthly`, `annual`, `perpetual`, `hosting_only`, `setup_fee`, `installments`), start, end, renewal terms, notes. "Custom" is a contract that starts empty. Quotes become contracts on acceptance.
  4. **Entitlements:** what a tenant can use, derived from its active contract, plus manual overrides (grants, limits, trials) with a reason and an expiry.
- **Resolution:** override → add-on → contract item → default; one resolver function, cached, invalidated on contract or override change. Enforced on the server for every endpoint and sync command; the UI hides what is not entitled.
- **Private features:** a feature built for one clinic is a normal catalog feature, disabled by default and granted to that clinic by an override; offering it to others is a catalog or package change. **One codebase for all customers: no branches or forks per customer.**
- **Release flags** (gradual rollout of new code) are a separate mechanism from entitlements.
- **Perpetual license:** the contract states what is perpetual (the purchased features) and what is recurring (hosting and domain, optional yearly updates and support).
- **Non-payment:** reminder → grace period → suspension, and suspension means read-only with export: no new bookings, visits or messages, while every record stays readable and exportable. Medical data is never deleted and never made unreadable by its clinic because of billing.
- **Offline:** devices cache the resolved entitlements with a validity lease and a grace period, so a clinic is never locked out by being offline. Commands a device created before it learned of a suspension or an entitlement change are judged by the entitlements in force when they were created: clinical and payment records made in good faith are always accepted, never lost; only work created after the device learned of the change is refused.
- Subscription invoices and payments follow ADR 0014.

## Consequences
- Pricing freedom without code exceptions; every price has a recorded list price and reason, which protects the owner's reputation in a small market.
- The console (F33–F35) is a real product surface, not an afterthought.
