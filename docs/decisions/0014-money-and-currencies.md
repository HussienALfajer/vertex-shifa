# 0014 — Money: integer units per currency, stored rates, append-only payments

Status: Accepted · Date: 2026-10-09

## Context
Clinics in Azaz price and take payments in US dollars, Turkish lira and Syrian pounds (new notes since 2026), mostly in cash, with partial payments and balances due. The platform bills clinics in the same mix and receives cash, Sham Cash and USDT. Floating-point money and in-place balance updates are not acceptable.

## Decision
- **Amounts:** `bigint` minor units with an explicit ISO 4217 currency code and exponent, defined once in `packages/contracts`: `USD` exponent 2, `TRY` exponent 2, `SYP` exponent 2 (the ISO 4217 value; the code and exponent of the redenominated 2026 pound are to be confirmed, Q13, before S16). Never floats; one money module in `packages/contracts` for arithmetic, rounding and formatting, fully unit-tested.
- **Exchange rates:** entered per tenant (clinic billing) or by the platform (subscriptions) with an effective time; every conversion stores the rate it used. No live rate feed in V1.
- **Clinic billing:** invoices with lines (visit types, procedures, items), discounts by permission, partial payments in any accepted currency, patient balances computed from invoices and payments, never stored and updated in place.
- **Append-only payments:** a payment or refund is a new row; corrections are reversals with a reason; nothing is edited or deleted.
- **Cash sessions:** per staff member and branch, with an opening count, the session's movements per currency and a closing count with differences recorded.
- **Offline:** invoices and payments are sync commands (ADR 0008); invoice numbers come from per-device ranges.
- **Platform billing** (ADR 0013): invoices per contract; payments recorded manually (cash, Sham Cash, USDT, transfer) with the method's reference; the payment rules of the owner's Vertex Digital project (Sham Cash references, USDT verification) are the reference when automation is added.

## Consequences
- Balances and reports are always reproducible from rows.
- Currency handling is explicit in every screen and report; mixed-currency totals are shown per currency, or converted with a stated rate.
