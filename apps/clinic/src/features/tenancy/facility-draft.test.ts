import { describe, expect, it } from 'vitest';
import {
  emptyDraft,
  type FacilityDraft,
  facilityInput,
  locationErrors,
  nameErrors,
  weekErrors,
} from './facility-draft';

const cityId = '0199f000-0000-7000-8000-000000000003';

function located(overrides: Partial<FacilityDraft> = {}): FacilityDraft {
  return {
    ...emptyDraft('عيادة الاختبار'),
    governorateId: '0199f000-0000-7000-8000-000000000001',
    areaId: cityId,
    addressDetails: 'شارع المدرسة',
    coordinates: { latitudeE7: 365_866_000, longitudeE7: 370_469_000 },
    phones: [{ phone: '0900 000 001', whatsapp: true }],
    defaultCurrency: 'TRY',
    ...overrides,
  };
}

describe('branch draft', () => {
  it('names every missing part of the location step', () => {
    expect(locationErrors(emptyDraft('عيادة'))).toEqual({
      areaId: 'city.invalid',
      addressDetails: 'addressDetails.invalid',
      coordinates: 'location.invalid',
      'phones.0': 'phones.invalid',
    });
    expect(locationErrors(located())).toEqual({});
  });

  it('asks to confirm a location outside Syria and Turkey (rule 13)', () => {
    const cairo = { latitudeE7: 300_444_000, longitudeE7: 312_357_000 };
    expect(locationErrors(located({ coordinates: cairo }))).toEqual({
      coordinates: 'location.invalid',
    });
    expect(locationErrors(located({ coordinates: cairo, outsideConfirmed: true }))).toEqual({});
  });

  it('refuses while the pasted location is refused or resolving, though the old one is valid', () => {
    expect(locationErrors(located({ locationUnsettled: true }))).toEqual({
      coordinates: 'location.unsettled',
    });
  });

  it('finds the same phone typed twice in different forms (edge case 8)', () => {
    const phones = [
      { phone: '0900 000 001', whatsapp: false },
      { phone: '+963900000001', whatsapp: false },
    ];
    expect(locationErrors(located({ phones }))).toEqual({ 'phones.1': 'phones.duplicate' });
  });

  it('sends phones in E.164, with WhatsApp only on mobile numbers', () => {
    const phones = [
      { phone: '0900 000 001', whatsapp: true },
      { phone: '021 000 0001', whatsapp: true },
    ];
    expect(facilityInput(located({ phones })).contactPhones).toEqual([
      { phone: '+963900000001', whatsapp: true },
      { phone: '+963210000001', whatsapp: false },
    ]);
  });

  it('needs a working day and a chosen currency (step 3)', () => {
    expect(weekErrors(located({ workingDays: 0, defaultCurrency: undefined }))).toEqual({
      workingDays: 'workingDays.invalid',
      defaultCurrency: 'currency.invalid',
    });
    expect(weekErrors(located())).toEqual({});
  });

  it('uses the stand-in currency only while none is chosen', () => {
    const draft = located({ defaultCurrency: undefined });
    expect(facilityInput(draft, 'USD').defaultCurrency).toBe('USD');
    expect(facilityInput(located(), 'USD').defaultCurrency).toBe('TRY');
  });

  it('checks the branch name', () => {
    expect(nameErrors(located({ name: ' ' }))).toEqual({ name: 'branchName.invalid' });
    expect(nameErrors(located())).toEqual({});
  });
});
