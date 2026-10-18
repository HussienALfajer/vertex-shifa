import { z } from 'zod';
import { coordinatesSchema } from './coordinates.js';
import { DomainError } from './errors.js';
import { currencyCodeSchema } from './money.js';
import { parsePhoneNumber, phoneNumberSchema } from './phone.js';

/** A moment as an ISO 8601 UTC string, as the API sends it. */
const instantSchema = z.iso.datetime();

/** A free-text reason staff give for a change; kept in the audit entry, never shown to the clinic. */
const reasonSchema = z.string().trim().min(2).max(500);

// Tenants (ADR 0004): a clinic on the platform.

export const tenantStatusSchema = z
  .enum(['onboarding', 'active', 'suspended', 'closed'])
  .meta({ id: 'TenantStatus' });

export type TenantStatus = z.infer<typeof tenantStatusSchema>;

/** Who may make a change of status: the owner finishing the wizard, or Vertex staff. */
export type TenantStatusChanger = 'onboarding' | 'platform';

/**
 * Every allowed change of a tenant's status and who makes it (S01). `closed` is final until S22
 * adds `closed → suspended` for a returning customer.
 */
export const tenantStatusTransitions = {
  onboarding: { active: 'onboarding', closed: 'platform' },
  active: { suspended: 'platform', closed: 'platform' },
  suspended: { active: 'platform', closed: 'platform' },
  closed: {},
} as const satisfies Record<TenantStatus, Partial<Record<TenantStatus, TenantStatusChanger>>>;

export function canChangeTenantStatus(
  from: TenantStatus,
  to: TenantStatus,
  by: TenantStatusChanger,
): boolean {
  const allowed: Partial<Record<TenantStatus, TenantStatusChanger>> = tenantStatusTransitions[from];
  return allowed[to] === by;
}

export function assertTenantStatusChange(
  from: TenantStatus,
  to: TenantStatus,
  by: TenantStatusChanger,
): void {
  if (!canChangeTenantStatus(from, to, by)) {
    throw new DomainError('INVALID_STATUS_TRANSITION', `Tenant status ${from} cannot become ${to}`);
  }
}

/**
 * Refuses a change to the tenant's setup while it is suspended or closed: its data stays readable
 * and exportable (ADR 0013). S05 extends this to every write.
 */
export function assertTenantWritable(status: TenantStatus): void {
  if (status === 'suspended') throw new DomainError('TENANT_SUSPENDED', 'The tenant is suspended');
  if (status === 'closed') throw new DomainError('TENANT_CLOSED', 'The tenant is closed');
}

/** Why Vertex suspended or closed a tenant, as the clinic's banner shows it (no free text). */
export const tenantStatusReasonSchema = z
  .enum(['non_payment', 'other'])
  .meta({ id: 'TenantStatusReason' });

export type TenantStatusReason = z.infer<typeof tenantStatusReasonSchema>;

/** A tenant appears in the patient app directory and map only while active and listed. */
export function isShownInDirectory(tenant: {
  status: TenantStatus;
  directoryListed: boolean;
}): boolean {
  return tenant.status === 'active' && tenant.directoryListed;
}

export const tenantNameArSchema = z.string().trim().min(2).max(100);

export const tenantNameLatinSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[A-Za-z0-9 \-'&.]+$/, "Latin letters, digits, spaces and - ' & . only");

export const tenantSchema = z
  .object({
    id: z.uuid(),
    nameAr: z.string(),
    nameLatin: z.string().nullable(),
    status: tenantStatusSchema,
    /** Set while suspended or closed. */
    statusReason: tenantStatusReasonSchema.nullable(),
    statusChangedAt: instantSchema,
    onboardingCompletedAt: instantSchema.nullable(),
    /** Set by Vertex staff only. */
    directoryListed: z.boolean(),
    /** Listed and active: what patients see (`isShownInDirectory`). */
    directoryShown: z.boolean(),
    createdAt: instantSchema,
    updatedAt: instantSchema,
    archivedAt: instantSchema.nullable(),
  })
  .meta({ id: 'Tenant' });

export type Tenant = z.infer<typeof tenantSchema>;

export const createTenantSchema = z
  .object({
    nameAr: tenantNameArSchema,
    nameLatin: tenantNameLatinSchema.optional(),
    reason: reasonSchema,
  })
  .meta({ id: 'CreateTenant' });

export type CreateTenant = z.infer<typeof createTenantSchema>;

export const changeTenantStatusSchema = z
  .object({
    /** `active` from `onboarding` is the owner's, through the wizard. */
    status: z.enum(['active', 'suspended', 'closed']),
    /** Stored for `suspended` and `closed`, for the banner. */
    reasonCategory: tenantStatusReasonSchema.default('other'),
    reason: reasonSchema,
  })
  .meta({ id: 'ChangeTenantStatus' });

export type ChangeTenantStatus = z.infer<typeof changeTenantStatusSchema>;

export const setTenantDirectoryListingSchema = z
  .object({ listed: z.boolean(), reason: reasonSchema })
  .meta({ id: 'SetTenantDirectoryListing' });

export type SetTenantDirectoryListing = z.infer<typeof setTenantDirectoryListingSchema>;

/** Every edit carries the `updatedAt` the client last read; a stale one is a `CONFLICT`. */
const expectedUpdatedAtSchema = instantSchema;

export const updateTenantProfileSchema = z
  .object({
    nameAr: tenantNameArSchema,
    nameLatin: tenantNameLatinSchema.nullable(),
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .meta({ id: 'UpdateTenantProfile' });

export type UpdateTenantProfile = z.infer<typeof updateTenantProfileSchema>;

/** Uploads: PNG, JPEG or WebP up to 2 MB; stored re-encoded as PNG of at most 256 KiB. */
export const logoUpload = {
  maxBytes: 2 * 1024 * 1024,
  contentTypes: ['image/png', 'image/jpeg', 'image/webp'],
  maxStoredBytes: 262_144,
  minSide: 16,
  maxSide: 512,
} as const;

export const tenantLogoSchema = z
  .object({
    contentType: z.literal('image/png'),
    /** The PNG, base64. */
    data: z.base64(),
    byteSize: z.int().min(1).max(logoUpload.maxStoredBytes),
    width: z.int().min(logoUpload.minSide).max(logoUpload.maxSide),
    height: z.int().min(logoUpload.minSide).max(logoUpload.maxSide),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .meta({ id: 'TenantLogo' });

export type TenantLogo = z.infer<typeof tenantLogoSchema>;

// Working days: a bitmask, bit 0 = Saturday … bit 6 = Friday (calendars start on Saturday).

export const weekdays = [
  'saturday',
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const;

export type Weekday = (typeof weekdays)[number];

/** Saturday to Thursday. */
export const DEFAULT_WORKING_DAYS = 0b0111111;

export const workingDaysSchema = z.int().min(1).max(0b1111111).meta({ id: 'WorkingDays' });

/** The days of a bitmask, Saturday first. */
export function workingDaysToList(mask: number): Weekday[] {
  return weekdays.filter((_, bit) => (mask & (1 << bit)) !== 0);
}

/** The bitmask of a set of days. */
export function workingDaysFromList(days: readonly Weekday[]): number {
  return days.reduce((mask, day) => mask | (1 << weekdays.indexOf(day)), 0);
}

// Branches (facilities, ADR 0004).

export const contactPhoneSchema = z
  .object({ phone: phoneNumberSchema, whatsapp: z.boolean() })
  .refine((entry) => !entry.whatsapp || parsePhoneNumber(entry.phone)?.kind === 'mobile', {
    message: 'WhatsApp is only on mobile numbers',
    path: ['whatsapp'],
  })
  .meta({ id: 'ContactPhone' });

export type ContactPhone = z.infer<typeof contactPhoneSchema>;

export const contactPhonesSchema = z
  .array(contactPhoneSchema)
  .min(1)
  .max(3)
  .refine(
    (phones) => new Set(phones.map((entry) => entry.phone)).size === phones.length,
    'A phone appears twice',
  );

export const displayNameFormatSchema = z
  .enum(['ticket_only', 'first_name_father_initial'])
  .meta({ id: 'DisplayNameFormat' });

export type DisplayNameFormat = z.infer<typeof displayNameFormatSchema>;

export const facilityNameSchema = z.string().trim().min(2).max(100);

const facilityFields = {
  name: facilityNameSchema,
  /** A city (`areas` level `city`). */
  areaId: z.uuid(),
  addressDetails: z.string().trim().min(2).max(200),
  coordinates: coordinatesSchema,
  contactPhones: contactPhonesSchema,
  defaultCurrency: currencyCodeSchema,
  workingDays: workingDaysSchema,
  displayNameFormat: displayNameFormatSchema,
  displayCallSound: z.boolean(),
};

export const facilitySchema = z
  .object({
    id: z.uuid(),
    type: z.literal('clinic'),
    ...facilityFields,
    createdAt: instantSchema,
    updatedAt: instantSchema,
    archivedAt: instantSchema.nullable(),
  })
  .meta({ id: 'Facility' });

export type Facility = z.infer<typeof facilitySchema>;

export const createFacilitySchema = z
  .object({
    ...facilityFields,
    workingDays: workingDaysSchema.default(DEFAULT_WORKING_DAYS),
    displayNameFormat: displayNameFormatSchema.default('ticket_only'),
    displayCallSound: z.boolean().default(true),
  })
  .meta({ id: 'CreateFacility' });

export type CreateFacility = z.infer<typeof createFacilitySchema>;

export const updateFacilitySchema = z
  .object({ ...facilityFields, expectedUpdatedAt: expectedUpdatedAtSchema })
  .meta({ id: 'UpdateFacility' });

export type UpdateFacility = z.infer<typeof updateFacilitySchema>;

/** List order (ADR 0020): ascending by default; the id breaks ties so pages never overlap. */
export const listOrderSchema = z.enum(['asc', 'desc']).default('asc');

export const listFacilitiesQuerySchema = z
  .object({
    /** `false` (default) lists branches in use, `true` the archived ones. */
    archived: z.stringbool({ truthy: ['true'], falsy: ['false'] }).default(false),
    sort: z.enum(['createdAt', 'name']).default('createdAt'),
    order: listOrderSchema,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .meta({ id: 'ListFacilitiesQuery' });

export const facilityPageSchema = z
  .object({
    items: z.array(facilitySchema),
    total: z.int().min(0),
    page: z.int().min(1),
    pageSize: z.int().min(1),
  })
  .meta({ id: 'FacilityPage' });

export type FacilityPage = z.infer<typeof facilityPageSchema>;

// Areas: governorates and their cities, for addresses and, later, discovery by city.

export const areaLevelSchema = z.enum(['governorate', 'city']).meta({ id: 'AreaLevel' });

export const areaSchema = z
  .object({
    id: z.uuid(),
    parentId: z.uuid().nullable(),
    level: areaLevelSchema,
    nameAr: z.string(),
    nameLatin: z.string(),
    /** Archived areas leave the pickers but stay readable for the branches that use them. */
    archivedAt: instantSchema.nullable(),
  })
  .meta({ id: 'Area' });

export type Area = z.infer<typeof areaSchema>;

export const areaListSchema = z.array(areaSchema).meta({ id: 'AreaList' });

export const listAreasQuerySchema = z
  .object({ parentId: z.uuid().optional() })
  .meta({ id: 'ListAreasQuery' });

// Console: the tenant registry.

export const listTenantsQuerySchema = z
  .object({
    status: tenantStatusSchema.optional(),
    sort: z.enum(['createdAt', 'nameAr', 'statusChangedAt']).default('createdAt'),
    order: listOrderSchema,
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .meta({ id: 'ListTenantsQuery' });

export const tenantPageSchema = z
  .object({
    items: z.array(tenantSchema),
    total: z.int().min(0),
    page: z.int().min(1),
    pageSize: z.int().min(1),
  })
  .meta({ id: 'TenantPage' });

export type TenantPage = z.infer<typeof tenantPageSchema>;
