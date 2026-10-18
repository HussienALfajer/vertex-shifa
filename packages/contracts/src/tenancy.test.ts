import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import {
  assertTenantStatusChange,
  assertTenantWritable,
  canChangeTenantStatus,
  changeTenantStatusSchema,
  contactPhonesSchema,
  createFacilitySchema,
  createTenantSchema,
  DEFAULT_WORKING_DAYS,
  isShownInDirectory,
  listFacilitiesQuerySchema,
  type TenantStatus,
  tenantStatusSchema,
  workingDaysFromList,
  workingDaysSchema,
  workingDaysToList,
} from './tenancy.js';

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

const statuses = tenantStatusSchema.options;

describe('tenant status transitions', () => {
  const allowed: [TenantStatus, TenantStatus, 'onboarding' | 'platform'][] = [
    ['onboarding', 'active', 'onboarding'],
    ['onboarding', 'closed', 'platform'],
    ['active', 'suspended', 'platform'],
    ['active', 'closed', 'platform'],
    ['suspended', 'active', 'platform'],
    ['suspended', 'closed', 'platform'],
  ];

  it('allows exactly the transitions of the spec, each by its changer', () => {
    for (const from of statuses) {
      for (const to of statuses) {
        for (const by of ['onboarding', 'platform'] as const) {
          const expected = allowed.some(([f, t, b]) => f === from && t === to && b === by);
          expect(canChangeTenantStatus(from, to, by), `${from} → ${to} by ${by}`).toBe(expected);
        }
      }
    }
  });

  it('refuses the rest with INVALID_STATUS_TRANSITION', () => {
    for (const [from, to] of [
      ['closed', 'active'],
      ['onboarding', 'active'],
      ['active', 'active'],
    ] as const) {
      expect(refusal(() => assertTenantStatusChange(from, to, 'platform'))).toBe(
        'INVALID_STATUS_TRANSITION',
      );
    }
    expect(() => assertTenantStatusChange('active', 'suspended', 'platform')).not.toThrow();
  });

  it('refuses setup writes while suspended or closed', () => {
    expect(refusal(() => assertTenantWritable('suspended'))).toBe('TENANT_SUSPENDED');
    expect(refusal(() => assertTenantWritable('closed'))).toBe('TENANT_CLOSED');
    expect(() => assertTenantWritable('onboarding')).not.toThrow();
    expect(() => assertTenantWritable('active')).not.toThrow();
  });

  it('shows a tenant in the directory only while active and listed', () => {
    for (const status of statuses) {
      expect(isShownInDirectory({ status, directoryListed: true })).toBe(status === 'active');
      expect(isShownInDirectory({ status, directoryListed: false })).toBe(false);
    }
  });

  it('defaults the reason category of a status change to other', () => {
    expect(changeTenantStatusSchema.parse({ status: 'closed', reason: 'test' })).toEqual({
      status: 'closed',
      reasonCategory: 'other',
      reason: 'test',
    });
    const onboarding = changeTenantStatusSchema.safeParse({ status: 'onboarding', reason: 'test' });
    expect(onboarding.success).toBe(false);
  });
});

describe('tenant names', () => {
  const create = (fields: Record<string, unknown>) =>
    createTenantSchema.safeParse({ nameAr: 'عيادة', reason: 'test', ...fields });

  it('trims and bounds the Arabic name', () => {
    const created = createTenantSchema.parse({ nameAr: '  عيادة تجريبية ', reason: 'test' });
    expect(created.nameAr).toBe('عيادة تجريبية');
    expect(create({ nameAr: 'ع' }).success).toBe(false);
    expect(create({ nameAr: 'ع'.repeat(101) }).success).toBe(false);
  });

  it('restricts the Latin name to Latin letters, digits and a few signs', () => {
    expect(create({ nameLatin: "Al-Shifa Clinic & Dr. Sam's" }).success).toBe(true);
    expect(create({ nameLatin: 'عيادة' }).success).toBe(false);
    expect(create({ nameLatin: 'Clinic <b>' }).success).toBe(false);
  });
});

describe('working days', () => {
  it('maps bit 0 to Saturday and bit 6 to Friday', () => {
    expect(workingDaysToList(0b0000001)).toEqual(['saturday']);
    expect(workingDaysToList(0b1000000)).toEqual(['friday']);
    expect(workingDaysToList(DEFAULT_WORKING_DAYS)).toEqual([
      'saturday',
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
    ]);
  });

  it('round-trips every mask', () => {
    for (let mask = 1; mask <= 127; mask++) {
      expect(workingDaysFromList(workingDaysToList(mask))).toBe(mask);
    }
  });

  it('needs at least one day and nothing past Friday', () => {
    expect(workingDaysSchema.safeParse(0).success).toBe(false);
    expect(workingDaysSchema.safeParse(128).success).toBe(false);
    expect(workingDaysSchema.safeParse(127).success).toBe(true);
  });
});

describe('contact phones', () => {
  const phones = (...entries: [string, boolean][]) =>
    contactPhonesSchema.safeParse(entries.map(([phone, whatsapp]) => ({ phone, whatsapp })));

  it('normalizes 1 to 3 phones', () => {
    expect(phones(['0900 000 001', true], ['011 000 0001', false]).data).toEqual([
      { phone: '+963900000001', whatsapp: true },
      { phone: '+963110000001', whatsapp: false },
    ]);
    expect(phones().success).toBe(false);
    const four = ['0900000001', '0900000002', '0900000003', '0900000004'];
    expect(phones(...four.map((phone): [string, boolean] => [phone, false])).success).toBe(false);
  });

  it('allows WhatsApp on mobile numbers only', () => {
    expect(phones(['011 000 0001', true]).success).toBe(false);
    expect(phones(['0500 000 00 01', true]).success).toBe(true);
  });

  it('refuses the same phone twice, however it is written', () => {
    expect(phones(['0900 000 001', false], ['+963900000001', true]).success).toBe(false);
  });
});

describe('facility inputs', () => {
  const base = {
    name: 'الفرع الرئيسي',
    areaId: '0199f0a0-0000-7000-8000-000000000001',
    addressDetails: 'شارع تجريبي',
    coordinates: { latitudeE7: 365_864_000, longitudeE7: 370_453_000 },
    contactPhones: [{ phone: '0900000001', whatsapp: true }],
    defaultCurrency: 'USD',
  };

  it('defaults working days and the waiting-room display', () => {
    expect(createFacilitySchema.parse(base)).toMatchObject({
      workingDays: DEFAULT_WORKING_DAYS,
      displayNameFormat: 'ticket_only',
      displayCallSound: true,
    });
  });

  it('refuses an unknown currency or display format', () => {
    const create = (fields: Record<string, unknown>) =>
      createFacilitySchema.safeParse({ ...base, ...fields }).success;
    expect(create({ defaultCurrency: 'EUR' })).toBe(false);
    expect(create({ displayNameFormat: 'full_name' })).toBe(false);
  });

  it('reads list parameters from the query string', () => {
    expect(listFacilitiesQuerySchema.parse({})).toEqual({
      archived: false,
      sort: 'createdAt',
      order: 'asc',
      page: 1,
      pageSize: 50,
    });
    const query = { archived: 'true', sort: 'name', order: 'desc', page: '2', pageSize: '100' };
    expect(listFacilitiesQuerySchema.parse(query)).toEqual({
      archived: true,
      sort: 'name',
      order: 'desc',
      page: 2,
      pageSize: 100,
    });
    expect(listFacilitiesQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(listFacilitiesQuerySchema.safeParse({ archived: 'yes' }).success).toBe(false);
    expect(listFacilitiesQuerySchema.safeParse({ sort: 'addressDetails' }).success).toBe(false);
  });
});
