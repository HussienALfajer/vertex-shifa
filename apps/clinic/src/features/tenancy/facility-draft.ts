import {
  type ContactPhone,
  type Coordinates,
  type CreateFacility,
  type CurrencyCode,
  contactPhoneSchema,
  createFacilitySchema,
  DEFAULT_WORKING_DAYS,
  type DisplayNameFormat,
  type Facility,
  isInServiceRegion,
  parsePhoneNumber,
  type UpdateFacility,
} from '@vertex-shifa/contracts';

/** A branch as its form holds it: what the owner typed, before the contract normalizes it. */
export type FacilityDraft = {
  name: string;
  governorateId: string | undefined;
  areaId: string | undefined;
  addressDetails: string;
  coordinates: Coordinates | undefined;
  /** A point outside Syria and Turkey is allowed once the owner confirms it (rule 13). */
  outsideConfirmed: boolean;
  phones: { phone: string; whatsapp: boolean }[];
  /** Unset until the owner picks one. */
  defaultCurrency: CurrencyCode | undefined;
  workingDays: number;
  displayNameFormat: DisplayNameFormat;
  displayCallSound: boolean;
};

/** A form field with an error: its key in the `clinic:fields` texts, phones by position. */
export type DraftField =
  | 'name'
  | 'areaId'
  | 'addressDetails'
  | 'coordinates'
  | `phones.${number}`
  | 'workingDays'
  | 'defaultCurrency';

/** The error text key of each field that is not valid (`clinic:fields.<field>.invalid`…). */
export type DraftErrors = Partial<Record<DraftField, string>>;

export function emptyDraft(name: string): FacilityDraft {
  return {
    name,
    governorateId: undefined,
    areaId: undefined,
    addressDetails: '',
    coordinates: undefined,
    outsideConfirmed: false,
    phones: [{ phone: '', whatsapp: false }],
    defaultCurrency: undefined,
    workingDays: DEFAULT_WORKING_DAYS,
    displayNameFormat: 'ticket_only',
    displayCallSound: true,
  };
}

/** A saved branch in its form; `governorateId` is its city's parent, read with the city. */
export function draftFromFacility(
  facility: Facility,
  governorateId: string | undefined,
): FacilityDraft {
  return {
    name: facility.name,
    governorateId,
    areaId: facility.areaId,
    addressDetails: facility.addressDetails,
    coordinates: facility.coordinates,
    outsideConfirmed: !isInServiceRegion(facility.coordinates),
    phones: facility.contactPhones.map((entry) => ({ ...entry })),
    defaultCurrency: facility.defaultCurrency,
    workingDays: facility.workingDays,
    displayNameFormat: facility.displayNameFormat,
    displayCallSound: facility.displayCallSound,
  };
}

/** WhatsApp only on mobile numbers: the toggle shows for them only. */
export function isMobile(phone: string): boolean {
  return parsePhoneNumber(phone)?.kind === 'mobile';
}

const fields = createFacilitySchema.shape;

export function nameErrors(draft: FacilityDraft): DraftErrors {
  return fields.name.safeParse(draft.name).success ? {} : { name: 'branchName.invalid' };
}

/** The location step: city, address, location and phones (step 2). */
export function locationErrors(draft: FacilityDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.areaId) errors.areaId = 'city.invalid';
  if (!fields.addressDetails.safeParse(draft.addressDetails).success) {
    errors.addressDetails = 'addressDetails.invalid';
  }
  if (!draft.coordinates || (!isInServiceRegion(draft.coordinates) && !draft.outsideConfirmed)) {
    errors.coordinates = 'location.invalid';
  }
  const seen = new Set<string>();
  draft.phones.forEach((entry, index) => {
    const parsed = contactPhoneSchema.safeParse(phoneEntry(entry));
    if (!parsed.success) {
      errors[`phones.${index}`] = 'phones.invalid';
    } else if (seen.has(parsed.data.phone)) {
      errors[`phones.${index}`] = 'phones.duplicate';
    } else {
      seen.add(parsed.data.phone);
    }
  });
  return errors;
}

/** The week step: working days and currency (step 3). */
export function weekErrors(draft: FacilityDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!fields.workingDays.safeParse(draft.workingDays).success) {
    errors.workingDays = 'workingDays.invalid';
  }
  if (!draft.defaultCurrency) errors.defaultCurrency = 'currency.invalid';
  return errors;
}

function phoneEntry(entry: { phone: string; whatsapp: boolean }): ContactPhone {
  return { phone: entry.phone, whatsapp: entry.whatsapp && isMobile(entry.phone) };
}

/**
 * What the API takes, normalized by the contract (phones to E.164). Call it only on a draft whose
 * steps have no errors; `fallbackCurrency` stands in for a currency the owner has not picked yet
 * (the wizard creates the branch at step 2 and asks for the currency at step 3).
 */
export function facilityInput(
  draft: FacilityDraft,
  fallbackCurrency?: CurrencyCode,
): CreateFacility {
  return createFacilitySchema.parse({
    name: draft.name,
    areaId: draft.areaId,
    addressDetails: draft.addressDetails,
    coordinates: draft.coordinates,
    contactPhones: draft.phones.map(phoneEntry),
    defaultCurrency: draft.defaultCurrency ?? fallbackCurrency,
    workingDays: draft.workingDays,
    displayNameFormat: draft.displayNameFormat,
    displayCallSound: draft.displayCallSound,
  });
}

export function facilityUpdate(
  draft: FacilityDraft,
  saved: Facility,
  expectedUpdatedAt: string,
): UpdateFacility {
  return { ...facilityInput(draft, saved.defaultCurrency), expectedUpdatedAt };
}
