# 0005 — Identity and access: one person, many roles; devices; no email or SMS

Status: Accepted · Date: 2026-10-09

## Context
A doctor may work in two clinics and also be a patient. Staff sign in on shared clinic PCs that are often offline. The platform uses neither email nor SMS (ADR 0012), so sign-in and recovery rely on WhatsApp OTP, passwords, devices and people.

## Decision
- **One account per person,** identified by a verified phone number (E.164; Syrian and Turkish numbers). The same account can hold staff roles in several tenants and a patient profile.
- **Staff sign-in:** phone + password, with a WhatsApp OTP on a new device. Sessions are per device and per tenant.
- **Patient sign-in:** phone + WhatsApp OTP (ADR 0012); long-lived sessions on a trusted device, with biometric unlock where the device offers it.
- **Platform staff (console):** separate accounts with mandatory TOTP and re-authentication for sensitive actions.
- **Devices (clinic app):** a device is registered to a tenant and branch by the owner or a staff member with the device-management permission. Offline sign-in uses a per-user PIN on a registered device, limited to an offline session window; revocation applies on the next connection and wipes the local data.
- **Authorization:** role presets (owner, doctor, reception, nurse, accountant) map to permissions; owners adjust permissions within limits. Rules also use context: branch scope, and care relationship for clinical reads where the clinic enables it. Every endpoint and sync command declares the permission and the entitlement it needs.
- **Break-glass:** a doctor may open a record outside their normal scope with a stated reason; the access is flagged in the audit log.
- **Recovery without email:** staff passwords are reset by their clinic owner; an owner recovers through Vertex support after identity checks; patients recover with a WhatsApp OTP.
- Implementation uses Better Auth (ADR 0002) with the phone-number and two-factor capabilities; custom flows (devices, PIN) are platform code.

## Consequences
- A person's roles and patient profile never require a second account.
- Losing the platform's WhatsApp OTP number blocks new sign-ins until a backup number is active (ADR 0012); existing sessions and offline PINs keep working.
