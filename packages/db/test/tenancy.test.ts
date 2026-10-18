import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { areas, facilities, tenantLogos, tenants, withTenant } from '../src/index.js';
import { connect, refusal } from './connections.js';

// Synthetic tenants only; the areas are the seeded public place names.

const { app } = connect();

const RLS_REFUSAL = /new row violates row-level security policy/;

async function createTenant(name = 'عيادة تجريبية') {
  const [tenant] = await app.insert(tenants).values({ nameAr: name }).returning();
  if (!tenant) throw new Error('no tenant created');
  return tenant;
}

async function azaz() {
  const [city] = await app.select().from(areas).where(eq(areas.nameLatin, 'Azaz'));
  if (!city) throw new Error('Azaz is not seeded');
  return city;
}

const facility = (tenantId: string, areaId: string) => ({
  tenantId,
  name: 'الفرع الرئيسي',
  areaId,
  addressDetails: 'شارع تجريبي',
  latitudeE7: 365_864_000,
  longitudeE7: 370_453_000,
  contactPhones: [{ phone: '+963900000001', whatsapp: true }],
  defaultCurrency: 'USD',
});

const png = Buffer.from('synthetic logo bytes');
const logo = (tenantId: string) => ({
  tenantId,
  contentType: 'image/png',
  bytes: png,
  byteSize: png.length,
  width: 64,
  height: 64,
  sha256: 'a'.repeat(64),
});

describe('areas seed', () => {
  it('holds the 14 governorates of Syria and the cities of Aleppo governorate', async () => {
    const all = await app.select().from(areas);
    const governorates = all.filter((area) => area.level === 'governorate');
    expect(governorates).toHaveLength(14);
    const aleppo = governorates.find((area) => area.nameLatin === 'Aleppo');
    const cities = all.filter((area) => area.level === 'city');
    expect(cities.length).toBeGreaterThanOrEqual(30);
    for (const city of cities) expect(city.parentId).toBe(aleppo?.id);
    expect(cities.map((city) => city.nameAr)).toEqual(expect.arrayContaining(['أعزاز', 'حلب']));
    const positions = cities.map((city) => city.position).sort((a, b) => a - b);
    expect(positions).toEqual(cities.map((_, i) => i + 1));
  });

  it('is read-only for the app role', async () => {
    expect(
      await refusal(
        app
          .insert(areas)
          .values({ level: 'governorate', nameAr: 'تجريب', nameLatin: 'Test', position: 99 }),
      ),
    ).toMatch(/permission denied/);
    expect(await refusal(app.update(areas).set({ position: 1 }))).toMatch(/permission denied/);
  });
});

describe('tenants', () => {
  it('starts in onboarding, unlisted, in the shared pool', async () => {
    const tenant = await createTenant();
    expect(tenant).toMatchObject({
      status: 'onboarding',
      statusReason: null,
      directoryListed: false,
      dataLocation: 'pool',
      archivedAt: null,
    });
  });

  it('keeps a reason exactly while suspended or closed, and archives closed tenants', async () => {
    const tenant = await createTenant();
    const set = (values: Partial<typeof tenants.$inferInsert>) =>
      app.update(tenants).set(values).where(eq(tenants.id, tenant.id));
    expect(await refusal(set({ status: 'suspended' }))).toMatch(/tenants_status_reason/);
    expect(await refusal(set({ statusReason: 'other' }))).toMatch(/tenants_status_reason/);
    expect(await refusal(set({ status: 'suspended', statusReason: 'late' }))).toMatch(
      /tenants_status_reason/,
    );
    await set({ status: 'suspended', statusReason: 'non_payment' });
    expect(await refusal(set({ status: 'closed', statusReason: 'other' }))).toMatch(
      /tenants_closed_is_archived/,
    );
    await set({ status: 'closed', statusReason: 'other', archivedAt: new Date() });
  });

  it('is never deleted by the app role', async () => {
    const tenant = await createTenant();
    expect(await refusal(app.delete(tenants).where(eq(tenants.id, tenant.id)))).toMatch(
      /permission denied/,
    );
  });
});

describe('facilities', () => {
  it('are seen and written only by their tenant', async () => {
    const [a, b, city] = await Promise.all([createTenant(), createTenant(), azaz()]);
    await withTenant(app, a.id, (tx) => tx.insert(facilities).values(facility(a.id, city.id)));
    const seenByB = await withTenant(app, b.id, (tx) =>
      tx.select().from(facilities).where(eq(facilities.tenantId, a.id)),
    );
    expect(seenByB).toEqual([]);
    expect(
      await refusal(
        withTenant(app, b.id, (tx) => tx.insert(facilities).values(facility(a.id, city.id))),
      ),
    ).toMatch(RLS_REFUSAL);
    expect(await refusal(app.insert(facilities).values(facility(a.id, city.id)))).toMatch(
      RLS_REFUSAL,
    );
  });

  it('refuse an unknown tenant or area, a bad currency and an empty phone list', async () => {
    const [tenant, city] = await Promise.all([createTenant(), azaz()]);
    const insert = (values: Partial<ReturnType<typeof facility>>) =>
      withTenant(app, tenant.id, (tx) =>
        tx.insert(facilities).values({ ...facility(tenant.id, city.id), ...values }),
      );
    expect(await refusal(insert({ areaId: tenant.id }))).toMatch(/facilities_area_id_areas_id_fk/);
    expect(await refusal(insert({ defaultCurrency: 'EUR' }))).toMatch(
      /facilities_default_currency/,
    );
    expect(await refusal(insert({ contactPhones: [] }))).toMatch(/facilities_contact_phones/);
    expect(await refusal(insert({ latitudeE7: 900_000_001 }))).toMatch(/facilities_latitude/);
  });

  it('are archived, never deleted', async () => {
    const [tenant, city] = await Promise.all([createTenant(), azaz()]);
    expect(
      await refusal(
        withTenant(app, tenant.id, (tx) =>
          tx.delete(facilities).where(eq(facilities.tenantId, tenant.id)),
        ),
      ),
    ).toMatch(/permission denied/);
    await withTenant(app, tenant.id, async (tx) => {
      await tx.insert(facilities).values(facility(tenant.id, city.id));
      await tx.update(facilities).set({ archivedAt: new Date() });
    });
  });
});

describe('tenant logos', () => {
  it('keep one current logo per tenant', async () => {
    const tenant = await createTenant();
    await withTenant(app, tenant.id, (tx) => tx.insert(tenantLogos).values(logo(tenant.id)));
    expect(
      await refusal(
        withTenant(app, tenant.id, (tx) => tx.insert(tenantLogos).values(logo(tenant.id))),
      ),
    ).toMatch(/tenant_logos_current_idx/);
    await withTenant(app, tenant.id, async (tx) => {
      await tx.update(tenantLogos).set({ archivedAt: sql`now()` });
      await tx.insert(tenantLogos).values(logo(tenant.id));
    });
  });

  it('are isolated by tenant and refuse a size that does not match the bytes', async () => {
    const [a, b] = await Promise.all([createTenant(), createTenant()]);
    await withTenant(app, a.id, (tx) => tx.insert(tenantLogos).values(logo(a.id)));
    expect(await withTenant(app, b.id, (tx) => tx.select().from(tenantLogos))).toEqual([]);
    expect(
      await refusal(
        withTenant(app, b.id, (tx) =>
          tx.insert(tenantLogos).values({ ...logo(b.id), byteSize: png.length + 1 }),
        ),
      ),
    ).toMatch(/tenant_logos_byte_size/);
  });
});
