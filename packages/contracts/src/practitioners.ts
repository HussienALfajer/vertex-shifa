import { z } from 'zod';
import { tenantNameLatinSchema } from './tenancy.js';

/**
 * Practitioner profiles (spec S02): the doctor profile of a member with the doctor role, shown to
 * patients from S19 and S21. Personal data, never medical.
 */

export const genderSchema = z.enum(['male', 'female']).meta({ id: 'Gender' });

export type Gender = z.infer<typeof genderSchema>;

/** How patients see the doctor ("د. أحمد الخطيب"). */
export const practitionerNameArSchema = z.string().trim().min(2).max(100);

/** The S01 Latin name rule. */
export const practitionerNameLatinSchema = tenantNameLatinSchema;

export const syndicateNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[A-Za-z0-9\-/]+$/, 'Digits, Latin letters, - and / only');

/** 1–3 specialties from the platform list, distinct; the first is the main one. */
export const practitionerSpecialtyIdsSchema = z
  .array(z.uuid())
  .min(1)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length, 'A specialty appears twice');

export const practitionerProfileFields = {
  displayNameAr: practitionerNameArSchema,
  displayNameLatin: practitionerNameLatinSchema.nullable().default(null),
  gender: genderSchema,
  specialtyIds: practitionerSpecialtyIdsSchema,
  syndicateNumber: syndicateNumberSchema.nullable().default(null),
};

/** The profile given with the doctor role, at invitation or when the role is added. */
export const practitionerProfileInputSchema = z
  .object(practitionerProfileFields)
  .meta({ id: 'PractitionerProfileInput' });

export type PractitionerProfileInput = z.infer<typeof practitionerProfileInputSchema>;

/** The professional name prefilled from the account name (rule 34). */
export function defaultPractitionerNameAr(accountName: string): string {
  return `د. ${accountName.trim()}`;
}

export const specialtySchema = z
  .object({
    id: z.uuid(),
    /** Stable, kebab-case: `general-practice`. */
    code: z.string().regex(/^[a-z]+(-[a-z]+)*$/),
    nameAr: z.string(),
    nameLatin: z.string(),
    position: z.int().min(1),
  })
  .meta({ id: 'Specialty' });

export type Specialty = z.infer<typeof specialtySchema>;

/**
 * Photo uploads (rule 35): PNG, JPEG or WebP up to 2 MB, stored re-encoded as a square JPEG of
 * 128–512 pixels, metadata stripped, at most 256 KiB.
 */
export const practitionerPhotoUpload = {
  maxBytes: 2 * 1024 * 1024,
  contentTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxStoredBytes: 262_144,
  minSide: 128,
  maxSide: 512,
} as const;

// Routes of practitioner profiles (spec S02 "API and commands").

const instant = z.iso.datetime();

/** A doctor profile as the clinic shows it. */
export const practitionerSchema = z
  .object({
    id: z.uuid(),
    membershipId: z.uuid(),
    displayNameAr: z.string(),
    displayNameLatin: z.string().nullable(),
    gender: genderSchema,
    /** In order: the first is the main specialty. */
    specialtyIds: z.array(z.uuid()),
    syndicateNumber: z.string().nullable(),
    hasPhoto: z.boolean(),
    createdAt: instant,
    updatedAt: instant,
  })
  .meta({ id: 'Practitioner' });

export type Practitioner = z.infer<typeof practitionerSchema>;

export const practitionerListSchema = z.array(practitionerSchema).meta({ id: 'PractitionerList' });

/** The doctor's or the owner's edit, with the `updatedAt` the client read (rule 10). */
export const updatePractitionerSchema = z
  .object({ ...practitionerProfileFields, expectedUpdatedAt: instant })
  .meta({ id: 'UpdatePractitioner' });

export type UpdatePractitioner = z.infer<typeof updatePractitionerSchema>;

export const practitionerPhotoSchema = z
  .object({
    contentType: z.literal('image/jpeg'),
    /** The JPEG, base64. */
    data: z.base64(),
    byteSize: z.int().min(1).max(practitionerPhotoUpload.maxStoredBytes),
    width: z.int().min(practitionerPhotoUpload.minSide).max(practitionerPhotoUpload.maxSide),
    height: z.int().min(practitionerPhotoUpload.minSide).max(practitionerPhotoUpload.maxSide),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .meta({ id: 'PractitionerPhoto' });

export type PractitionerPhoto = z.infer<typeof practitionerPhotoSchema>;

/**
 * A member's latest archived doctor profile with its photo (rule 9, edge case 11), shown for the
 * owner to review when the doctor role comes back. Both null while the member has a current
 * profile, or when they never had one.
 */
export const previousPractitionerSchema = z
  .object({
    practitioner: practitionerSchema.nullable(),
    photo: practitionerPhotoSchema.nullable(),
  })
  .meta({ id: 'PreviousPractitioner' });

export type PreviousPractitioner = z.infer<typeof previousPractitionerSchema>;

export const specialtyListSchema = z.array(specialtySchema).meta({ id: 'SpecialtyList' });
