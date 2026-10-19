import { describe, expect, it } from 'vitest';
import {
  emptyPractitionerDraft,
  practitionerErrors,
  practitionerInput,
} from './practitioner-draft';

const specialty = (n: number) =>
  `0199f000-0000-7000-8000-0000000001${n.toString().padStart(2, '0')}`;

describe('practitioner draft', () => {
  it('prefills the professional name from the person', () => {
    expect(emptyPractitionerDraft(' سامر حداد ').displayNameAr).toBe('د. سامر حداد');
    expect(emptyPractitionerDraft('').displayNameAr).toBe('');
  });

  it('needs a gender and one to three specialties', () => {
    const draft = emptyPractitionerDraft('سامر حداد');
    expect(practitionerErrors(draft)).toEqual({ gender: true, specialtyIds: true });
    expect(
      practitionerErrors({
        ...draft,
        gender: 'male',
        specialtyIds: [specialty(1), specialty(2), specialty(3), specialty(4)],
      }),
    ).toEqual({ specialtyIds: true });
  });

  it('checks the optional fields only when filled', () => {
    const draft = {
      ...emptyPractitionerDraft('سامر حداد'),
      gender: 'male' as const,
      specialtyIds: [specialty(1)],
    };
    expect(practitionerErrors(draft)).toEqual({});
    expect(practitionerInput(draft)).toEqual({
      displayNameAr: 'د. سامر حداد',
      displayNameLatin: null,
      gender: 'male',
      specialtyIds: [specialty(1)],
      syndicateNumber: null,
    });
    expect(
      practitionerErrors({ ...draft, displayNameLatin: 'د. سامر', syndicateNumber: '12 34' }),
    ).toEqual({ displayNameLatin: true, syndicateNumber: true });
    expect(
      practitionerInput({
        ...draft,
        displayNameLatin: 'Dr. Samer Haddad',
        syndicateNumber: 'A-12/3',
      }),
    ).toMatchObject({ displayNameLatin: 'Dr. Samer Haddad', syndicateNumber: 'A-12/3' });
  });
});
