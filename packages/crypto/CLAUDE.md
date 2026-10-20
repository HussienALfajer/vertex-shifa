# packages/crypto

The keyed hashes and sealed values of ADR 0025, shared by `apps/api`, `apps/worker` and `apps/whatsapp-gateway`: `KeyedHash` (HMAC-SHA-256, `hash(purpose, value)`, `matches`), `SecretBox` (AES-256-GCM, `seal(context, plaintext)`, `open(context, value)`) and `safeEqual`. Node only (`node:crypto`); never imported by a front end.

## Rules
- Each app builds these from its own configured 32-byte keys (`IDENTITY_*` in the API, `MESSAGING_*` for the WhatsApp queue and sessions, spec S03); a key is never shared between purposes that ADR 0025 or a spec keeps apart.
- Every hash names its purpose and every sealed value its context (the row it belongs to), so a value moved to another row neither matches nor opens.
- Passwords (Argon2id), tokens and signatures stay in `apps/api/src/modules/platform/identity/secrets.ts` until a second app needs them.

Run: `pnpm --filter @vertex-shifa/crypto test`.
