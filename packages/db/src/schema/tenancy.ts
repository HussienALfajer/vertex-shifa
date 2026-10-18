import { isNull, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
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

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * The tenant registry (ADR 0004): one row per clinic on the platform. Platform scope: the console
 * lists tenants across tenants, and later the public site and patient app resolve them. It holds
 * no medical or personal data. Clinic routes touch only the row of the session's tenant; the
 * tenancy module is the only one that reads or writes it.
 */
export const tenants = pgTable(
  'tenants',
  {
    /** Also the tenant id of every tenant row and of `current_tenant_id()`. */
    id: id(),
    nameAr: text().notNull(),
    nameLatin: text(),
    status: text().notNull().default('onboarding'),
    /** Why Vertex suspended or closed it (`non_payment`, `other`), for the clinic's banner. */
    statusReason: text(),
    statusChangedAt: timestamptz().notNull().defaultNow(),
    onboardingCompletedAt: timestamptz(),
    /** In the patient app directory and map; set by Vertex staff only. */
    directoryListed: boolean().notNull().default(false),
    /** `pool` (shared database) in V1; the silo option of ADR 0004 comes later. */
    dataLocation: text().notNull().default('pool'),
    /** Minutes without input before the clinic app locks (S02); the owner sets 5–60. */
    idleLockMinutes: smallint().notNull().default(15),
    /** `branch` or `own_patients`: which patients a doctor reads (S02, applied by S11). */
    clinicalReadScope: text().notNull().default('branch'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Set when the tenant is closed. */
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('tenants', t.id),
    check('tenants_status', sql`${t.status} in ('onboarding', 'active', 'suspended', 'closed')`),
    // A reason exactly while suspended or closed.
    check(
      'tenants_status_reason',
      sql`(${t.statusReason} is not null) = (${t.status} in ('suspended', 'closed')) and (${t.statusReason} is null or ${t.statusReason} in ('non_payment', 'other'))`,
    ),
    check(
      'tenants_closed_is_archived',
      sql`(${t.status} = 'closed') = (${t.archivedAt} is not null)`,
    ),
    check('tenants_name_ar', sql`char_length(${t.nameAr}) between 2 and 100`),
    check('tenants_name_latin', sql`char_length(${t.nameLatin}) between 2 and 100`),
    check('tenants_data_location', sql`${t.dataLocation} = 'pool'`),
    check('tenants_idle_lock_minutes', sql`${t.idleLockMinutes} between 5 and 60`),
    check('tenants_clinical_read_scope', sql`${t.clinicalReadScope} in ('branch', 'own_patients')`),
    index('tenants_status_idx').on(t.status),
  ],
);

/**
 * The clinic logo, re-encoded to PNG by the API. In PostgreSQL because it is small, prints
 * offline once replicated (S04), and no object storage exists yet. At most one row per tenant is
 * not archived; a new logo archives the old row.
 */
export const tenantLogos = pgTable(
  'tenant_logos',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    contentType: text().notNull(),
    bytes: bytea().notNull(),
    byteSize: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    /** Hex SHA-256 of `bytes`. */
    sha256: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('tenant_logos', t.id),
    check('tenant_logos_content_type', sql`${t.contentType} = 'image/png'`),
    check(
      'tenant_logos_byte_size',
      sql`${t.byteSize} = octet_length(${t.bytes}) and ${t.byteSize} between 1 and 262144`,
    ),
    check(
      'tenant_logos_dimensions',
      sql`${t.width} between 16 and 512 and ${t.height} between 16 and 512`,
    ),
    check('tenant_logos_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    uniqueIndex('tenant_logos_current_idx').on(t.tenantId).where(isNull(t.archivedAt)),
    // The foreign key's index: the partial one above leaves out archived logos.
    index('tenant_logos_tenant_idx').on(t.tenantId, t.createdAt),
  ],
);

/**
 * Governorates and their cities (two levels), for branch addresses and, later, discovery by city
 * (F25). Public place names, seeded by migration; Vertex staff add cities by migration until S22.
 */
export const areas = pgTable(
  'areas',
  {
    id: id(),
    parentId: uuid().references((): AnyPgColumn => areas.id),
    level: text().notNull(),
    nameAr: text().notNull(),
    nameLatin: text().notNull(),
    /** Sort order within the parent. */
    position: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('areas', t.id),
    check('areas_level', sql`${t.level} in ('governorate', 'city')`),
    // A governorate has no parent; a city has one, a governorate (only seed migrations add areas).
    check('areas_parent', sql`(${t.level} = 'city') = (${t.parentId} is not null)`),
    unique('areas_name_ar_unique').on(t.parentId, t.nameAr).nullsNotDistinct(),
    unique('areas_name_latin_unique').on(t.parentId, t.nameLatin).nullsNotDistinct(),
    index('areas_parent_idx').on(t.parentId, t.position),
  ],
);

/** A branch of a tenant (ADR 0004); type `clinic` in V1. Archived, never deleted. */
export const facilities = pgTable(
  'facilities',
  {
    id: id(),
    tenantId: tenantId().references(() => tenants.id),
    type: text().notNull().default('clinic'),
    name: text().notNull(),
    /** A city; the street-level place is the map pin and `address_details`. */
    areaId: uuid()
      .notNull()
      .references(() => areas.id),
    addressDetails: text().notNull(),
    /** Degrees × 10⁷ (no floats, ADR 0020). */
    // Named here: the snake_case casing would split `E7` into `e_7`.
    latitudeE7: integer('latitude_e7').notNull(),
    longitudeE7: integer('longitude_e7').notNull(),
    /** 1–3 `{ phone, whatsapp }`, phone in E.164, checked by the contract. */
    contactPhones: jsonb().notNull(),
    /** For new prices and invoices; changing it never converts existing amounts (ADR 0014). */
    defaultCurrency: text().notNull(),
    /** Bit 0 = Saturday … bit 6 = Friday; default Saturday to Thursday. */
    workingDays: smallint().notNull().default(63),
    displayNameFormat: text().notNull().default('ticket_only'),
    displayCallSound: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('facilities', t.id),
    // Parent of composite keys from other tenant tables, `(tenant_id, facility_id)`.
    unique('facilities_tenant_id_id_unique').on(t.tenantId, t.id),
    check('facilities_type', sql`${t.type} = 'clinic'`),
    check('facilities_name', sql`char_length(${t.name}) between 2 and 100`),
    check('facilities_address_details', sql`char_length(${t.addressDetails}) between 2 and 200`),
    check('facilities_latitude', sql`${t.latitudeE7} between -900000000 and 900000000`),
    check('facilities_longitude', sql`${t.longitudeE7} between -1800000000 and 1800000000`),
    check(
      'facilities_contact_phones',
      sql`jsonb_typeof(${t.contactPhones}) = 'array' and jsonb_array_length(${t.contactPhones}) between 1 and 3`,
    ),
    check('facilities_default_currency', sql`${t.defaultCurrency} in ('USD', 'TRY', 'SYP')`),
    check('facilities_working_days', sql`${t.workingDays} between 1 and 127`),
    check(
      'facilities_display_name_format',
      sql`${t.displayNameFormat} in ('ticket_only', 'first_name_father_initial')`,
    ),
    index('facilities_tenant_archived_idx').on(t.tenantId, t.archivedAt),
    index('facilities_tenant_area_idx').on(t.tenantId, t.areaId),
  ],
);
