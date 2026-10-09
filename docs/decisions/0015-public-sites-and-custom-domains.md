# 0015 — Public clinic sites and custom domains, without Cloudflare

Status: Accepted · Date: 2026-10-09

## Context
Each clinic gets a public page with booking (F30); some want their own domain (F31). Cloudflare is blocked in Syria, so it cannot terminate TLS for custom hostnames. Certificates must be issued and renewed automatically.

## Decision
- **Default:** every clinic gets `<slug>.<platform domain>` (platform domain: Q1); the site resolves the tenant from the host name on every request.
- **Custom domain flow:** the clinic (or platform staff) enters the domain; the console shows a CNAME target and a TXT verification record; a job verifies DNS, then issues the certificate and activates routing. States: `pending_dns`, `verifying`, `issuing`, `active`, `failed`, `expiring`.
- **TLS:** issued with Let's Encrypt (ACME) on our own servers. The reverse proxy serves only domains in the verified-domain table: an on-demand TLS "ask" check (Caddy) or a certificate job writing per-domain configuration (nginx); the choice follows the hosting decision (ADR 0017). Unverified domains never trigger issuance.
- **Branding:** a custom-domain page shows the clinic's identity and always shows "Powered by Vertex Shifa" (ADR 0018).
- **Security:** rate limits and bot protection without third-party CDNs (nginx limits, proof-of-work challenge such as ALTCHA on booking and OTP forms, fail2ban), as in the owner's Vertex Digital project.

## Consequences
- Custom domains are an add-on or a Max package item (ADR 0013).
- Apex domains need the clinic's DNS provider to support CNAME flattening or an A record to our IP; the console explains both.
