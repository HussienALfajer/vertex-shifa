import { isNull, sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { staffMemberships } from './access.js';
import { archivedAt, createdAt, id, idIsUuidV7, tenantId, updatedAt } from './columns.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

/**
 * Medical specialties (spec S02): public names seeded by migration with fixed UUIDv7 ids, so every
 * environment and every replicated device shares them. Vertex adds specialties by migration until
 * S23.
 */
export const specialties = pgTable(
  'specialties',
  {
    id: id(),
    /** Stable, kebab-case: `general-practice`. */
    code: text().notNull(),
    nameAr: text().notNull(),
    nameLatin: text().notNull(),
    position: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('specialties', t.id),
    unique('specialties_code_unique').on(t.code),
    check('specialties_code', sql`${t.code} ~ '^[a-z]+(-[a-z]+)*$'`),
    unique('specialties_position_unique').on(t.position),
  ],
);

/**
 * The doctor profile of a member with the doctor role, shown to patients from S19 and S21.
 * Archived when the doctor role is removed; restored when it is given back.
 */
export const practitioners = pgTable(
  'practitioners',
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid().notNull(),
    /** As patients see it ("د. أحمد الخطيب"). */
    displayNameAr: text().notNull(),
    displayNameLatin: text(),
    /** `male`, `female`: for the F25 filter. */
    gender: text().notNull(),
    syndicateNumber: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('practitioners', t.id),
    unique('practitioners_tenant_id_id_unique').on(t.tenantId, t.id),
    foreignKey({
      name: 'practitioners_membership_fk',
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [staffMemberships.tenantId, staffMemberships.id],
    }),
    check('practitioners_display_name_ar', sql`char_length(${t.displayNameAr}) between 2 and 100`),
    check(
      'practitioners_display_name_latin',
      sql`char_length(${t.displayNameLatin}) between 2 and 100`,
    ),
    check('practitioners_gender', sql`${t.gender} in ('male', 'female')`),
    check('practitioners_syndicate_number', sql`${t.syndicateNumber} ~ '^[A-Za-z0-9/-]{1,30}$'`),
    uniqueIndex('practitioners_current_idx')
      .on(t.tenantId, t.membershipId)
      .where(isNull(t.archivedAt)),
    index('practitioners_membership_idx').on(t.tenantId, t.membershipId),
  ],
);

/** 1–3 specialties per practitioner; position 1 is the main one. */
export const practitionerSpecialties = pgTable(
  'practitioner_specialties',
  {
    id: id(),
    tenantId: tenantId(),
    practitionerId: uuid().notNull(),
    specialtyId: uuid()
      .notNull()
      .references(() => specialties.id),
    position: smallint().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('practitioner_specialties', t.id),
    foreignKey({
      name: 'practitioner_specialties_practitioner_fk',
      columns: [t.tenantId, t.practitionerId],
      foreignColumns: [practitioners.tenantId, practitioners.id],
    }),
    check('practitioner_specialties_position', sql`${t.position} between 1 and 3`),
    uniqueIndex('practitioner_specialties_position_idx')
      .on(t.tenantId, t.practitionerId, t.position)
      .where(isNull(t.archivedAt)),
    uniqueIndex('practitioner_specialties_specialty_idx')
      .on(t.tenantId, t.practitionerId, t.specialtyId)
      .where(isNull(t.archivedAt)),
    index('practitioner_specialties_practitioner_idx').on(t.tenantId, t.practitionerId),
    index('practitioner_specialties_tenant_specialty_idx').on(t.tenantId, t.specialtyId),
  ],
);

/**
 * A practitioner's photo, re-encoded by the API to a square JPEG with metadata stripped. Same shape
 * and rules as `tenant_logos`: at most one row per practitioner is not archived; a new photo
 * archives the old row.
 */
export const practitionerPhotos = pgTable(
  'practitioner_photos',
  {
    id: id(),
    tenantId: tenantId(),
    practitionerId: uuid().notNull(),
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
    idIsUuidV7('practitioner_photos', t.id),
    foreignKey({
      name: 'practitioner_photos_practitioner_fk',
      columns: [t.tenantId, t.practitionerId],
      foreignColumns: [practitioners.tenantId, practitioners.id],
    }),
    check('practitioner_photos_content_type', sql`${t.contentType} = 'image/jpeg'`),
    check(
      'practitioner_photos_byte_size',
      sql`${t.byteSize} = octet_length(${t.bytes}) and ${t.byteSize} between 1 and 262144`,
    ),
    check(
      'practitioner_photos_dimensions',
      sql`${t.width} = ${t.height} and ${t.width} between 128 and 512`,
    ),
    check('practitioner_photos_sha256', sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    uniqueIndex('practitioner_photos_current_idx')
      .on(t.tenantId, t.practitionerId)
      .where(isNull(t.archivedAt)),
    // The foreign key's index: the partial one above leaves out archived photos.
    index('practitioner_photos_practitioner_idx').on(t.tenantId, t.practitionerId, t.createdAt),
  ],
);
