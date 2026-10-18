/**
 * Every table, with the module that owns it (`docs/architecture.md`), its scope and its kind,
 * which decide the conventions it is held to (ADR 0004, ADR 0020).
 *
 * Scope:
 * - `tenant`: tenant data; `tenant_id`, forced RLS, foreign keys to other tenant tables carry it.
 * - `platform`: platform data (people, catalogs, contracts); no `tenant_id`, guarded by the core.
 *
 * Kind:
 * - `business`: `created_at`, `updated_at`, `archived_at`; archived, never deleted.
 * - `append-only`: `created_at` only; a trigger refuses `UPDATE`, `DELETE` and `TRUNCATE`, and the
 *   app role has no such privileges (audit, payments, clinical versions, the sync command log).
 * - `queue`: `created_at` and `updated_at`; rows change as they are processed (outbox, message
 *   status).
 *
 * The convention test fails when a table is missing here or does not follow its scope and kind.
 */
export const tableRegistry = {
  audit_entries: { module: 'audit', scope: 'tenant', kind: 'append-only' },
  outbox_events: { module: 'events', scope: 'tenant', kind: 'queue' },
  tenants: { module: 'tenancy', scope: 'platform', kind: 'business' },
  tenant_logos: { module: 'tenancy', scope: 'tenant', kind: 'business' },
  facilities: { module: 'tenancy', scope: 'tenant', kind: 'business' },
  areas: { module: 'tenancy', scope: 'platform', kind: 'business' },
  platform_audit_entries: { module: 'audit', scope: 'platform', kind: 'append-only' },
  accounts: { module: 'identity', scope: 'platform', kind: 'business' },
  otp_challenges: { module: 'identity', scope: 'platform', kind: 'queue' },
  devices: { module: 'identity', scope: 'tenant', kind: 'business' },
  device_enrollments: { module: 'identity', scope: 'tenant', kind: 'business' },
  staff_sessions: { module: 'identity', scope: 'tenant', kind: 'business' },
  platform_users: { module: 'identity', scope: 'platform', kind: 'business' },
  platform_user_recovery_codes: { module: 'identity', scope: 'platform', kind: 'business' },
  platform_sessions: { module: 'identity', scope: 'platform', kind: 'business' },
  account_tenant_links: { module: 'access', scope: 'platform', kind: 'business' },
  staff_memberships: { module: 'access', scope: 'tenant', kind: 'business' },
  staff_membership_facilities: { module: 'access', scope: 'tenant', kind: 'business' },
  specialties: { module: 'practitioners', scope: 'platform', kind: 'business' },
  practitioners: { module: 'practitioners', scope: 'tenant', kind: 'business' },
  practitioner_specialties: { module: 'practitioners', scope: 'tenant', kind: 'business' },
  practitioner_photos: { module: 'practitioners', scope: 'tenant', kind: 'business' },
} as const satisfies Record<string, TableInfo>;

export type TableScope = 'tenant' | 'platform';

export type TableKind = 'business' | 'append-only' | 'queue';

export type TableInfo = { module: string; scope: TableScope; kind: TableKind };
