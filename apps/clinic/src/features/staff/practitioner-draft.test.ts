import { describe, expect, it } from 'vitest';
import {
  doctorRoleDraft,
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

  it('brings back the previous profile with the doctor role, else a new one', () => {
    const previous = {
      id: '0199f000-0000-7000-8000-000000000201',
      membershipId: '0199f000-0000-7000-8000-000000000301',
      displayNameAr: 'د. سامر حداد',
      displayNameLatin: null,
      gender: 'male' as const,
      specialtyIds: [specialty(2), specialty(1)],
      syndicateNumber: 'SY-1',
      hasPhoto: true,
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-10-02T08:00:00.000Z',
    };
    expect(doctorRoleDraft('اسم آخر', previous)).toEqual({
      displayNameAr: 'د. سامر حداد',
      displayNameLatin: '',
      gender: 'male',
      specialtyIds: [specialty(2), specialty(1)],
      syndicateNumber: 'SY-1',
    });
    expect(doctorRoleDraft('سامر حداد', null)).toEqual(emptyPractitionerDraft('سامر حداد'));
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
