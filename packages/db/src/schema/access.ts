import { isNull, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  archivedAt,
  createdAt,
  id,
  idIsUuidV7,
  tenantId,
  timestamptz,
  updatedAt,
} from './columns.js';
import { accounts } from './identity.js';
import { facilities, tenants } from './tenancy.js';

/**
 * Which clinics an account belongs to, so sign-in can offer them before any tenant context exists
 * (spec S02). Holds no roles: every decision reads `staff_memberships` under the tenant's RLS.
 * Written in the same transaction as the membership it mirrors, archived with it.
 */
export const accountTenantLinks = pgTable(
  'account_tenant_links',
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    linkedTenantId: uuid()
      .notNull()
      .references(() => tenants.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('account_tenant_links', t.id),
    unique('account_tenant_links_account_tenant_unique').on(t.accountId, t.linkedTenantId),
    index('account_tenant_links_tenant_idx').on(t.linkedTenantId),
  ],
);

/**
 * A person's place in a tenant (a "staff member", ADR 0005): roles, branch scope and the owner's
 * permission adjustments. Effective permissions are computed by `effectivePermissions` in
 * `packages/contracts`; the catalog grows with later specs, so the keys are checked there, not
 * here. One row per account and tenant: a cancelled invitation is archived, and inviting the same
 * person again restores the row.
 */
export const staffMemberships = pgTable(
  'staff_memberships',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    /** The account (platform table). */
    accountId: uuid()
      .notNull()
      .references(() => accounts.id),
    status: text().notNull(),
    roles: text().array().notNull(),
    /** True for owners; otherwise the branches are in `staff_membership_facilities`. */
    allFacilities: boolean().notNull().default(false),
    grantedPermissions: text().array().notNull().default(sql`'{}'::text[]`),
    revokedPermissions: text().array().notNull().default(sql`'{}'::text[]`),
    /** The name the owner typed; lists show `accounts.name_ar` once the person sets it. */
    invitedName: text().notNull(),
    /** Null for the owner Vertex creates with the tenant. */
    invitedByMembershipId: uuid(),
    /** 7 days after creation or the last resend, while invited. */
    invitationExpiresAt: timestamptz(),
    /** `pending`, `sent`, `failed`, while invited; set by S03. */
    invitationMessageStatus: text(),
    acceptedAt: timestamptz(),
    deactivatedAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('staff_memberships', t.id),
    // Parent of composite keys from other tenant tables, `(tenant_id, membership_id)`.
    unique('staff_memberships_tenant_id_id_unique').on(t.tenantId, t.id),
    unique('staff_memberships_tenant_account_unique').on(t.tenantId, t.accountId),
    foreignKey({
      name: 'staff_memberships_invited_by_fk',
      columns: [t.tenantId, t.invitedByMembershipId],
      foreignColumns: [t.tenantId, t.id] as [AnyPgColumn, AnyPgColumn],
    }),
    check('staff_memberships_status', sql`${t.status} in ('invited', 'active', 'deactivated')`),
    check(
      'staff_memberships_roles',
      sql`cardinality(${t.roles}) between 1 and 5 and ${t.roles} <@ array['owner', 'doctor', 'reception', 'nurse', 'accountant']
        and cardinality(${t.roles}) = ('owner' = any(${t.roles}))::int + ('doctor' = any(${t.roles}))::int
          + ('reception' = any(${t.roles}))::int + ('nurse' = any(${t.roles}))::int
          + ('accountant' = any(${t.roles}))::int`,
    ),
    check(
      'staff_memberships_owner_all_facilities',
      sql`not ('owner' = any(${t.roles})) or ${t.allFacilities}`,
    ),
    check(
      'staff_memberships_adjustments_disjoint',
      sql`not (${t.grantedPermissions} && ${t.revokedPermissions})`,
    ),
    check('staff_memberships_invited_name', sql`char_length(${t.invitedName}) between 2 and 100`),
    check(
      'staff_memberships_invitation',
      sql`${t.status} <> 'invited' or (${t.invitationExpiresAt} is not null and ${t.invitationMessageStatus} is not null)`,
    ),
    check(
      'staff_memberships_invitation_message_status',
      sql`${t.invitationMessageStatus} in ('pending', 'sent', 'failed')`,
    ),
    check(
      'staff_memberships_deactivated',
      sql`(${t.status} = 'deactivated') = (${t.deactivatedAt} is not null)`,
    ),
    index('staff_memberships_tenant_status_idx').on(t.tenantId, t.status),
    index('staff_memberships_tenant_invited_by_idx').on(t.tenantId, t.invitedByMembershipId),
  ],
);

/** The branches of a member whose `all_facilities` is false (at least one, checked by the API). */
export const staffMembershipFacilities = pgTable(
  'staff_membership_facilities',
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid().notNull(),
    facilityId: uuid().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('staff_membership_facilities', t.id),
    foreignKey({
      name: 'staff_membership_facilities_membership_fk',
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [staffMemberships.tenantId, staffMemberships.id],
    }),
    foreignKey({
      name: 'staff_membership_facilities_facility_fk',
      columns: [t.tenantId, t.facilityId],
      foreignColumns: [facilities.tenantId, facilities.id],
    }),
    uniqueIndex('staff_membership_facilities_current_idx')
      .on(t.tenantId, t.membershipId, t.facilityId)
      .where(isNull(t.archivedAt)),
    index('staff_membership_facilities_membership_idx').on(t.tenantId, t.membershipId),
    index('staff_membership_facilities_facility_idx').on(t.tenantId, t.facilityId),
  ],
);
