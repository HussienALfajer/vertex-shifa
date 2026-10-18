import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  type CreateFacility,
  DomainError,
  type ErrorCode,
  type Facility,
  listFacilitiesQuerySchema,
  listTenantsQuerySchema,
  type Tenant,
} from '@vertex-shifa/contracts';
import { areas, auditEntries, createDatabase, type Database, withTenant } from '@vertex-shifa/db';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, inject, it, vi } from 'vitest';
import type { StaffActor } from '../src/core/access/actor.js';
import { DATABASE } from '../src/core/database/database.module.js';
import { listRoutes } from '../src/core/routes.js';
import { TenancyService } from '../src/modules/platform/tenancy/index.js';
import { createTestApp } from './app.js';
import { ownerActor } from './staff.js';

// Synthetic tenants, branches and phone numbers only; areas are the seeded public place names.

let app: INestApplication;
let tenancy: TenancyService;
let db: Database;
let azazId: string;
let aleppoId: string;

beforeAll(async () => {
  app = await createTestApp();
  tenancy = app.get(TenancyService);
  db = app.get(DATABASE);
  const rows = await db.select().from(areas);
  azazId = rows.find((area) => area.nameLatin === 'Azaz')?.id ?? '';
  aleppoId =
    rows.find((area) => area.nameLatin === 'Aleppo' && area.level === 'governorate')?.id ?? '';
});
afterAll(() => app.close());

const SYSTEM = { kind: 'system' } as const;

const facilityQuery = (query: Record<string, string>) => listFacilitiesQuerySchema.parse(query);

async function refusal(work: Promise<unknown> | (() => Promise<unknown>)): Promise<ErrorCode> {
  try {
    await (typeof work === 'function' ? work() : work);
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

async function newTenant(): Promise<{ tenant: Tenant; staff: StaffActor }> {
  const tenant = await tenancy.createTenant(SYSTEM, { nameAr: 'عيادة تجريبية', reason: 'test' });
  return { tenant, staff: ownerActor(tenant.id) };
}

const branch = (fields: Partial<CreateFacility> = {}): CreateFacility => ({
  name: 'الفرع الرئيسي',
  areaId: azazId,
  addressDetails: 'شارع تجريبي، بناء 1',
  coordinates: { latitudeE7: 365_864_000, longitudeE7: 370_453_000 },
  contactPhones: [{ phone: '+963900000001', whatsapp: true }],
  defaultCurrency: 'USD',
  workingDays: 63,
  displayNameFormat: 'ticket_only',
  displayCallSound: true,
  ...fields,
});

const edit = (facility: Facility, fields: Partial<CreateFacility> = {}) => ({
  ...branch({
    name: facility.name,
    areaId: facility.areaId,
    addressDetails: facility.addressDetails,
    coordinates: facility.coordinates,
    contactPhones: facility.contactPhones,
    defaultCurrency: facility.defaultCurrency,
  }),
  ...fields,
  expectedUpdatedAt: facility.updatedAt,
});

async function auditOf(tenantId: string) {
  return withTenant(db, tenantId, (tx) =>
    tx
      .select({
        action: auditEntries.action,
        actorKind: auditEntries.actorKind,
        reason: auditEntries.reason,
      })
      .from(auditEntries)
      .where(eq(auditEntries.tenantId, tenantId))
      .orderBy(auditEntries.createdAt, auditEntries.id),
  );
}

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#0b6b4f' } })
    .png()
    .toBuffer();

describe('tenancy routes over HTTP', () => {
  it('answer 401 without a session, every one of them', async () => {
    const routes = listRoutes(app).filter((route) =>
      /^\/api\/(tenant|facilities|areas|maps|console\/tenants)(\/|$)/.test(route.path),
    );
    expect(routes).toHaveLength(19);
    for (const route of routes) {
      const path = route.path.replace(':id', uuidv7());
      const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
      const response = await request(app.getHttpServer())[method](path).send({});
      expect(response.status, `${route.method} ${route.path}`).toBe(401);
      expect(response.body.code).toBe('UNAUTHENTICATED');
    }
  });

  it('document the status each one answers with', () => {
    for (const route of listRoutes(app)) {
      expect(route.status, route.name).toBe(route.method === 'POST' ? 201 : 200);
    }
  });

  it('declare no feature (clinic setup belongs to every package)', () => {
    const routes = listRoutes(app).filter(
      (route) => route.name.startsWith('Tenan') || route.name.startsWith('Facilities'),
    );
    for (const route of routes) expect(route.entitlement, route.name).toEqual({ kind: 'none' });
  });
});

describe('the tenant registry (console and CLI)', () => {
  it('creates a tenant in onboarding, unlisted, and audits it with its reason', async () => {
    const { tenant } = await newTenant();
    expect(tenant).toMatchObject({
      nameAr: 'عيادة تجريبية',
      nameLatin: null,
      status: 'onboarding',
      statusReason: null,
      onboardingCompletedAt: null,
      directoryListed: false,
      directoryShown: false,
    });
    expect(await auditOf(tenant.id)).toEqual([
      { action: 'tenant.created', actorKind: 'system', reason: 'test' },
    ]);
  });

  it('changes status along the transition table only, keeping the reason category', async () => {
    const { tenant } = await newTenant();
    const closed = await tenancy.changeTenantStatus(SYSTEM, tenant.id, {
      status: 'closed',
      reasonCategory: 'other',
      reason: 'test',
    });
    expect(closed).toMatchObject({ status: 'closed', statusReason: 'other' });
    expect(closed.archivedAt).not.toBeNull();
    expect(
      await refusal(
        tenancy.changeTenantStatus(SYSTEM, tenant.id, {
          status: 'active',
          reasonCategory: 'other',
          reason: 'test',
        }),
      ),
    ).toBe('INVALID_STATUS_TRANSITION');
    expect(
      await refusal(
        tenancy.changeTenantStatus(SYSTEM, uuidv7(), {
          status: 'closed',
          reasonCategory: 'other',
          reason: 'test',
        }),
      ),
    ).toBe('NOT_FOUND');
    const actions = (await auditOf(tenant.id)).map((entry) => entry.action);
    expect(actions).toEqual(['tenant.created', 'tenant.status_changed']);
  });

  it('suspends with a reason and reactivates, clearing it', async () => {
    const { tenant, staff } = await newTenant();
    await tenancy.createFacility(staff, branch());
    await tenancy.completeOnboarding(staff);
    const suspended = await tenancy.changeTenantStatus(SYSTEM, tenant.id, {
      status: 'suspended',
      reasonCategory: 'non_payment',
      reason: 'test',
    });
    expect(suspended).toMatchObject({ status: 'suspended', statusReason: 'non_payment' });
    const active = await tenancy.changeTenantStatus(SYSTEM, tenant.id, {
      status: 'active',
      reasonCategory: 'other',
      reason: 'test',
    });
    expect(active).toMatchObject({ status: 'active', statusReason: null, archivedAt: null });
  });

  it('reports a listed tenant as shown only while active', async () => {
    const { tenant, staff } = await newTenant();
    const listed = await tenancy.setDirectoryListing(SYSTEM, tenant.id, {
      listed: true,
      reason: 'test',
    });
    expect(listed).toMatchObject({ directoryListed: true, directoryShown: false });
    await tenancy.createFacility(staff, branch());
    expect(await tenancy.completeOnboarding(staff)).toMatchObject({ directoryShown: true });
    const suspended = await tenancy.changeTenantStatus(SYSTEM, tenant.id, {
      status: 'suspended',
      reasonCategory: 'non_payment',
      reason: 'test',
    });
    expect(suspended).toMatchObject({ directoryListed: true, directoryShown: false });
    const closed = await tenancy.changeTenantStatus(SYSTEM, tenant.id, {
      status: 'closed',
      reasonCategory: 'other',
      reason: 'test',
    });
    expect(closed).toMatchObject({ directoryListed: true, directoryShown: false });
  });

  it('lists tenants by status, a page at a time', async () => {
    const { tenant } = await newTenant();
    await tenancy.changeTenantStatus(SYSTEM, tenant.id, {
      status: 'closed',
      reasonCategory: 'other',
      reason: 'test',
    });
    const page = await tenancy.listTenants(
      listTenantsQuerySchema.parse({ status: 'closed', pageSize: '100' }),
    );
    expect(page.items.map((item) => item.id)).toContain(tenant.id);
    expect(page.items.every((item) => item.status === 'closed')).toBe(true);
    const first = await tenancy.listTenants(listTenantsQuerySchema.parse({ pageSize: '1' }));
    expect(first.items).toHaveLength(1);
    expect(first.total).toBeGreaterThan(1);
  });
});

describe('the clinic profile', () => {
  it('refuses a stale edit even when two changes fall within one millisecond', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-01-01T00:00:00Z') });
    try {
      const { tenant, staff } = await newTenant();
      const profile = (expectedUpdatedAt: string) =>
        tenancy.updateProfile(staff, {
          nameAr: 'عيادة تجريبية',
          nameLatin: null,
          expectedUpdatedAt,
        });
      const first = await profile(tenant.updatedAt);
      const second = await profile(first.updatedAt);
      expect(Date.parse(second.updatedAt)).toBeGreaterThan(Date.parse(first.updatedAt));
      expect(await refusal(profile(first.updatedAt))).toBe('CONFLICT');

      const facility = await tenancy.createFacility(staff, branch());
      const edited = await tenancy.updateFacility(staff, facility.id, edit(facility));
      await tenancy.updateFacility(staff, facility.id, edit(edited));
      expect(await refusal(tenancy.updateFacility(staff, facility.id, edit(edited)))).toBe(
        'CONFLICT',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('reads and edits the session tenant, refusing a stale edit', async () => {
    const { tenant, staff } = await newTenant();
    expect(await tenancy.getTenant(staff)).toEqual(tenant);
    const updated = await tenancy.updateProfile(staff, {
      nameAr: 'عيادة تجريبية جديدة',
      nameLatin: 'Test Clinic',
      expectedUpdatedAt: tenant.updatedAt,
    });
    expect(updated).toMatchObject({ nameAr: 'عيادة تجريبية جديدة', nameLatin: 'Test Clinic' });
    expect(
      await refusal(
        tenancy.updateProfile(staff, {
          nameAr: 'تعديل آخر',
          nameLatin: null,
          expectedUpdatedAt: tenant.updatedAt,
        }),
      ),
    ).toBe('CONFLICT');
    expect((await auditOf(tenant.id)).at(-1)).toMatchObject({
      action: 'tenant.profile_updated',
      actorKind: 'staff',
    });
  });

  it('completes onboarding only with a branch in use, once', async () => {
    const { staff } = await newTenant();
    expect(await refusal(tenancy.completeOnboarding(staff))).toBe('ONBOARDING_INCOMPLETE');
    const facility = await tenancy.createFacility(staff, branch());
    await tenancy.createFacility(staff, branch({ name: 'الفرع الثاني' }));
    await tenancy.archiveFacility(staff, facility.id);
    const active = await tenancy.completeOnboarding(staff);
    expect(active.status).toBe('active');
    expect(active.onboardingCompletedAt).not.toBeNull();
    expect(await tenancy.completeOnboarding(staff)).toEqual(active);
    const actions = (await auditOf(staff.tenantId)).map((entry) => entry.action);
    expect(actions.filter((action) => action === 'tenant.onboarding_completed')).toHaveLength(1);
  });

  it('refuses setup writes while suspended or closed, and keeps reads', async () => {
    for (const [status, code] of [
      ['suspended', 'TENANT_SUSPENDED'],
      ['closed', 'TENANT_CLOSED'],
    ] as const) {
      const { tenant, staff } = await newTenant();
      const facility = await tenancy.createFacility(staff, branch());
      await tenancy.createFacility(staff, branch({ name: 'الفرع الثاني' }));
      await tenancy.completeOnboarding(staff);
      const current = await tenancy.changeTenantStatus(SYSTEM, tenant.id, {
        status,
        reasonCategory: 'non_payment',
        reason: 'test',
      });
      const writes = [
        () =>
          tenancy.updateProfile(staff, {
            nameAr: 'تعديل',
            nameLatin: null,
            expectedUpdatedAt: current.updatedAt,
          }),
        () => tenancy.createFacility(staff, branch()),
        () => tenancy.updateFacility(staff, facility.id, edit(facility)),
        () => tenancy.archiveFacility(staff, facility.id),
        () => tenancy.restoreFacility(staff, facility.id),
        async () => tenancy.replaceLogo(staff, await png(64, 64)),
        () => tenancy.archiveLogo(staff),
        () => tenancy.completeOnboarding(staff),
      ];
      for (const write of writes) expect(await refusal(write)).toBe(code);
      expect((await tenancy.getTenant(staff)).status).toBe(status);
      expect(await tenancy.getFacility(staff, facility.id)).toEqual(facility);
    }
  });
});

describe('branches', () => {
  it('are created, read, listed and edited within the session tenant', async () => {
    const { tenant, staff } = await newTenant();
    const created = await tenancy.createFacility(staff, branch());
    expect(created).toMatchObject({ type: 'clinic', name: 'الفرع الرئيسي', archivedAt: null });
    expect(await tenancy.getFacility(staff, created.id)).toEqual(created);
    const updated = await tenancy.updateFacility(
      staff,
      created.id,
      edit(created, { defaultCurrency: 'TRY', workingDays: 0b1111111 }),
    );
    expect(updated).toMatchObject({ defaultCurrency: 'TRY', workingDays: 127 });
    expect(await refusal(tenancy.updateFacility(staff, created.id, edit(created)))).toBe(
      'CONFLICT',
    );
    const page = await tenancy.listFacilities(staff, facilityQuery({ archived: 'false' }));
    expect(page).toEqual({ items: [updated], total: 1, page: 1, pageSize: 50 });
    const actions = (await auditOf(tenant.id)).map((entry) => entry.action);
    expect(actions).toEqual(['tenant.created', 'facility.created', 'facility.updated']);
  });

  it("answer NOT_FOUND for another tenant's branch, read or written", async () => {
    const a = await newTenant();
    const b = await newTenant();
    const facility = await tenancy.createFacility(a.staff, branch());
    expect(await refusal(tenancy.getFacility(b.staff, facility.id))).toBe('NOT_FOUND');
    expect(await refusal(tenancy.updateFacility(b.staff, facility.id, edit(facility)))).toBe(
      'NOT_FOUND',
    );
    expect(await refusal(tenancy.archiveFacility(b.staff, facility.id))).toBe('NOT_FOUND');
    expect(await refusal(tenancy.restoreFacility(b.staff, facility.id))).toBe('NOT_FOUND');
    const page = await tenancy.listFacilities(b.staff, facilityQuery({ archived: 'false' }));
    expect(page.total).toBe(0);
  });

  it('need a city in use as their area', async () => {
    const { staff } = await newTenant();
    expect(await refusal(tenancy.createFacility(staff, branch({ areaId: aleppoId })))).toBe(
      'VALIDATION_FAILED',
    );
    expect(await refusal(tenancy.createFacility(staff, branch({ areaId: uuidv7() })))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('keep the last branch in use, and archive and restore the others', async () => {
    const { staff } = await newTenant();
    const first = await tenancy.createFacility(staff, branch());
    expect(await refusal(tenancy.archiveFacility(staff, first.id))).toBe('LAST_ACTIVE_FACILITY');
    const second = await tenancy.createFacility(staff, branch({ name: 'الفرع الثاني' }));
    const archived = await tenancy.archiveFacility(staff, first.id);
    expect(archived.archivedAt).not.toBeNull();
    expect(await tenancy.archiveFacility(staff, first.id)).toEqual(archived);
    expect(await refusal(tenancy.archiveFacility(staff, second.id))).toBe('LAST_ACTIVE_FACILITY');
    const listed = await tenancy.listFacilities(staff, facilityQuery({ archived: 'true' }));
    expect(listed.items.map((item) => item.id)).toEqual([first.id]);
    expect((await tenancy.restoreFacility(staff, first.id)).archivedAt).toBeNull();
  });

  it('are listed by creation or name, in either order', async () => {
    const { staff } = await newTenant();
    const b = await tenancy.createFacility(staff, branch({ name: 'فرع ب' }));
    const a = await tenancy.createFacility(staff, branch({ name: 'فرع أ' }));
    const ids = async (query: Record<string, string>) =>
      (await tenancy.listFacilities(staff, facilityQuery(query))).items.map((item) => item.id);
    expect(await ids({})).toEqual([b.id, a.id]);
    expect(await ids({ order: 'desc' })).toEqual([a.id, b.id]);
    expect(await ids({ sort: 'name' })).toEqual([a.id, b.id]);
    expect(await ids({ sort: 'name', order: 'desc', pageSize: '1', page: '2' })).toEqual([a.id]);
  });

  it('keep one branch in use when two archives race', async () => {
    const { staff } = await newTenant();
    const first = await tenancy.createFacility(staff, branch());
    const second = await tenancy.createFacility(staff, branch({ name: 'الفرع الثاني' }));
    const results = await Promise.allSettled([
      tenancy.archiveFacility(staff, first.id),
      tenancy.archiveFacility(staff, second.id),
    ]);
    const refused = results.filter((result) => result.status === 'rejected');
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason.code).toBe('LAST_ACTIVE_FACILITY');
    const page = await tenancy.listFacilities(staff, facilityQuery({ archived: 'false' }));
    expect(page.total).toBe(1);
  });
});

describe('the logo', () => {
  it('is re-encoded as PNG, replaces the previous one, and is archived on removal', async () => {
    const { tenant, staff } = await newTenant();
    expect(await refusal(tenancy.getLogo(staff))).toBe('NOT_FOUND');
    const jpeg = await sharp({
      create: { width: 1024, height: 512, channels: 3, background: '#d4a017' },
    })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'synthetic-marker' } } })
      .toBuffer();
    const logo = await tenancy.replaceLogo(staff, jpeg);
    expect(logo).toMatchObject({ contentType: 'image/png', width: 512, height: 256 });
    const stored = Buffer.from(logo.data, 'base64');
    const metadata = await sharp(stored).metadata();
    expect(metadata.format).toBe('png');
    expect(metadata.exif).toBeUndefined();
    expect(stored.includes('synthetic-marker')).toBe(false);
    expect(await tenancy.getLogo(staff)).toEqual(logo);

    const second = await tenancy.replaceLogo(staff, await png(64, 64));
    expect(await tenancy.getLogo(staff)).toEqual(second);
    await tenancy.archiveLogo(staff);
    expect(await refusal(tenancy.getLogo(staff))).toBe('NOT_FOUND');
    expect(await refusal(tenancy.archiveLogo(staff))).toBe('NOT_FOUND');
    const actions = (await auditOf(tenant.id)).map((entry) => entry.action);
    expect(actions).toEqual([
      'tenant.created',
      'tenant_logo.replaced',
      'tenant_logo.replaced',
      'tenant_logo.archived',
    ]);
  });

  it('refuses oversize, unsupported, undecodable, tiny and too detailed images', async () => {
    const { staff } = await newTenant();
    // Random pixels do not compress: past 256 KiB as a 512 × 512 PNG.
    const noise = await sharp(randomBytes(512 * 512 * 3), {
      raw: { width: 512, height: 512, channels: 3 },
    })
      .png()
      .toBuffer();
    const uploads = [
      Buffer.alloc(2 * 1024 * 1024 + 1),
      await sharp({ create: { width: 64, height: 64, channels: 3, background: '#000' } })
        .gif()
        .toBuffer(),
      Buffer.from('not an image at all'),
      await png(8, 8),
      noise,
      // Past the 25-megapixel decoding limit, though small on the wire.
      await sharp({ create: { width: 5001, height: 5001, channels: 3, background: '#fff' } })
        .png()
        .toBuffer(),
    ];
    for (const upload of uploads) {
      expect(await refusal(tenancy.replaceLogo(staff, upload))).toBe('FILE_REJECTED');
    }
  });

  it("is never another tenant's", async () => {
    const a = await newTenant();
    const b = await newTenant();
    await tenancy.replaceLogo(a.staff, await png(64, 64));
    expect(await refusal(tenancy.getLogo(b.staff))).toBe('NOT_FOUND');
    expect(await refusal(tenancy.archiveLogo(b.staff))).toBe('NOT_FOUND');
    expect(await tenancy.getLogo(a.staff)).toMatchObject({ width: 64 });
  });
});

describe('areas', () => {
  it('lists the governorates, then the cities of one, in order', async () => {
    const governorates = await tenancy.listAreas(undefined);
    expect(governorates).toHaveLength(14);
    expect(governorates[0]).toMatchObject({ nameAr: 'دمشق', level: 'governorate', parentId: null });
    const cities = await tenancy.listAreas(aleppoId);
    expect(cities.slice(0, 2).map((city) => city.nameLatin)).toEqual(['Aleppo', 'Azaz']);
    expect(cities.every((city) => city.parentId === aleppoId && city.archivedAt === null)).toBe(
      true,
    );
  });

  it('keep an archived city readable for the branches that chose it (edge case 4)', async () => {
    // Archiving an area is the job of a migration; the owner role stands in for one here.
    const owner = createDatabase(inject('ownerUrl'));
    try {
      const [city] = await owner
        .insert(areas)
        .values({
          parentId: aleppoId,
          level: 'city',
          nameAr: `بلدة تجريبية ${uuidv7()}`,
          nameLatin: `Test town ${uuidv7()}`,
          position: 999,
        })
        .returning();
      if (!city) throw new Error('no area created');
      const { staff } = await newTenant();
      const facility = await tenancy.createFacility(staff, branch({ areaId: city.id }));
      await owner.update(areas).set({ archivedAt: new Date() }).where(eq(areas.id, city.id));

      expect((await tenancy.listAreas(aleppoId)).map((area) => area.id)).not.toContain(city.id);
      const archived = await tenancy.getArea(city.id);
      expect(archived).toMatchObject({ id: city.id, parentId: aleppoId, level: 'city' });
      expect(archived.archivedAt).not.toBeNull();
      expect((await tenancy.updateFacility(staff, facility.id, edit(facility))).areaId).toBe(
        city.id,
      );
      expect(await refusal(tenancy.createFacility(staff, branch({ areaId: city.id })))).toBe(
        'VALIDATION_FAILED',
      );
      expect(await refusal(tenancy.getArea(uuidv7()))).toBe('NOT_FOUND');
    } finally {
      await owner.$client.end();
    }
  });
});

describe('map links', () => {
  it('reads a full link without a request, and limits each tenant to 20 a minute', async () => {
    const { staff } = await newTenant();
    const url = 'https://www.google.com/maps/@36.5864,37.0453,17z';
    for (let i = 0; i < 20; i++) {
      expect(await tenancy.resolveMapLink(staff, url)).toEqual({
        latitudeE7: 365_864_000,
        longitudeE7: 370_453_000,
      });
    }
    expect(await refusal(tenancy.resolveMapLink(staff, url))).toBe('RATE_LIMITED');
    const other = await newTenant();
    expect(await tenancy.resolveMapLink(other.staff, url)).toBeDefined();
  });

  it('refuses a link that is not Google Maps', async () => {
    const { staff } = await newTenant();
    expect(await refusal(tenancy.resolveMapLink(staff, 'https://example.com/a'))).toBe(
      'MAP_LINK_UNRECOGNIZED',
    );
  });
});

describe('audit entries', () => {
  it('hold ids and codes, never the changed values', async () => {
    const { tenant, staff } = await newTenant();
    await tenancy.createFacility(staff, branch());
    const rows = await withTenant(db, tenant.id, (tx) =>
      tx
        .select()
        .from(auditEntries)
        .where(
          and(eq(auditEntries.tenantId, tenant.id), eq(auditEntries.action, 'facility.created')),
        ),
    );
    expect(JSON.stringify(rows)).not.toContain('+963900000001');
  });
});
