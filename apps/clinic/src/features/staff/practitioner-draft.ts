import {
  defaultPractitionerNameAr,
  type Gender,
  type Practitioner,
  type PractitionerProfileInput,
  practitionerNameArSchema,
  practitionerNameLatinSchema,
  practitionerSpecialtyIdsSchema,
  syndicateNumberSchema,
} from '@vertex-shifa/contracts';

/** A doctor profile as the forms hold it (screens 7 and 8); optional texts are empty strings. */
export type PractitionerDraft = {
  displayNameAr: string;
  displayNameLatin: string;
  gender: Gender | null;
  /** In order: the first is the main specialty. */
  specialtyIds: string[];
  syndicateNumber: string;
};

/** A new profile, its professional name prefilled from the person's name (rule 34). */
export function emptyPractitionerDraft(name: string): PractitionerDraft {
  return {
    displayNameAr: name.trim() === '' ? '' : defaultPractitionerNameAr(name),
    displayNameLatin: '',
    gender: null,
    specialtyIds: [],
    syndicateNumber: '',
  };
}

/**
 * The profile asked for with the doctor role (edge case 11): the member's previous one when they had
 * one, for the owner to review, else a new one.
 */
export function doctorRoleDraft(name: string, previous: Practitioner | null): PractitionerDraft {
  return previous ? practitionerDraft(previous) : emptyPractitionerDraft(name);
}

export function practitionerDraft(practitioner: Practitioner): PractitionerDraft {
  return {
    displayNameAr: practitioner.displayNameAr,
    displayNameLatin: practitioner.displayNameLatin ?? '',
    gender: practitioner.gender,
    specialtyIds: [...practitioner.specialtyIds],
    syndicateNumber: practitioner.syndicateNumber ?? '',
  };
}

export type PractitionerErrors = Partial<
  Record<'displayNameAr' | 'displayNameLatin' | 'gender' | 'specialtyIds' | 'syndicateNumber', true>
>;

const optional = (text: string) => text.trim() !== '';

export function practitionerErrors(draft: PractitionerDraft): PractitionerErrors {
  const errors: PractitionerErrors = {};
  if (!practitionerNameArSchema.safeParse(draft.displayNameAr).success) errors.displayNameAr = true;
  if (
    optional(draft.displayNameLatin) &&
    !practitionerNameLatinSchema.safeParse(draft.displayNameLatin).success
  ) {
    errors.displayNameLatin = true;
  }
  if (draft.gender === null) errors.gender = true;
  if (!practitionerSpecialtyIdsSchema.safeParse(draft.specialtyIds).success) {
    errors.specialtyIds = true;
  }
  if (
    optional(draft.syndicateNumber) &&
    !syndicateNumberSchema.safeParse(draft.syndicateNumber).success
  ) {
    errors.syndicateNumber = true;
  }
  return errors;
}

/** The profile the API takes; call after `practitionerErrors` found nothing. */
export function practitionerInput(draft: PractitionerDraft): PractitionerProfileInput {
  return {
    displayNameAr: practitionerNameArSchema.parse(draft.displayNameAr),
    displayNameLatin: optional(draft.displayNameLatin)
      ? practitionerNameLatinSchema.parse(draft.displayNameLatin)
      : null,
    gender: draft.gender as Gender,
    specialtyIds: practitionerSpecialtyIdsSchema.parse(draft.specialtyIds),
    syndicateNumber: optional(draft.syndicateNumber)
      ? syndicateNumberSchema.parse(draft.syndicateNumber)
      : null,
  };
}
