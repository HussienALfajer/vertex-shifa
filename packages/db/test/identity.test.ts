import { eq, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  accounts,
  accountTenantLinks,
  areas,
  type Database,
  deviceEnrollments,
  devices,
  facilities,
  platformAuditEntries,
  practitionerPhotos,
  practitionerSpecialties,
  practitioners,
  specialties,
  staffMembershipFacilities,
  staffMemberships,
  staffSessions,
  tenants,
  withTenant,
} from '../src/index.js';
import { connect, refusal } from './connections.js';

// Synthetic tenants, people and keys only (S02).

const { owner, app } = connect();

const RLS_REFUSAL = /new row violates row-level security policy/;
const key = (fill: string) => `${fill.repeat(43)}=`;
let phoneSeq = 0;
const phone = () => `+9639000001${String(++phoneSeq).padStart(2, '0')}`;

type Clinic = {
  tenantId: string;
  facilityId: string;
  ownerId: string;
  deviceId: string;
  enrollmentId: string;
  practitionerId: string;
};

async function createAccount() {
  const [account] = await app.insert(accounts).values({ phone: phone() }).returning();
  if (!account) throw new Error('no account created');
  return account;
}

async function createClinic(): Promise<Clinic> {
  const [tenant] = await app.insert(tenants).values({ nameAr: 'عيادة تجريبية' }).returning();
  const [city] = await app.select().from(areas).where(eq(areas.nameLatin, 'Azaz'));
  const account = await createAccount();
  if (!tenant || !city) throw new Error('no tenant or city');
  const tenantId = tenant.id;
  return withTenant(app, tenantId, async (tx) => {
    const [facility] = await tx
      .insert(facilities)
      .values({
        tenantId,
        name: 'الفرع الرئيسي',
        areaId: city.id,
        addressDetails: 'شارع تجريبي',
        latitudeE7: 365_864_000,
        longitudeE7: 370_453_000,
        contactPhones: [{ phone: '+963900000001', whatsapp: true }],
        defaultCurrency: 'USD',
      })
      .returning();
    const [member] = await tx
      .insert(staffMemberships)
      .values({
        tenantId,
        accountId: account.id,
        status: 'active',
        roles: ['owner', 'doctor'],
        allFacilities: true,
        invitedName: 'مالك تجريبي',
      })
      .returning();
    if (!facility || !member) throw new Error('no facility or member');
    await app
      .insert(accountTenantLinks)
      .values({ accountId: account.id, linkedTenantId: tenantId });
    const [device] = await tx
      .insert(devices)
      .values({
        tenantId,
        facilityId: facility.id,
        name: 'حاسوب الاستقبال',
        publicKey: key('D'),
        os: 'windows',
        appVersion: '0.1.0',
        registeredByMembershipId: member.id,
      })
      .returning();
    if (!device) throw new Error('no device');
    const [enrollment] = await tx
      .insert(deviceEnrollments)
      .values({ tenantId, deviceId: device.id, membershipId: member.id, publicKey: key('U') })
      .returning();
    const [practitioner] = await tx
      .insert(practitioners)
      .values({
        tenantId,
        membershipId: member.id,
        displayNameAr: 'د. طبيب تجريبي',
        gender: 'male',
      })
      .returning();
    if (!enrollment || !practitioner) throw new Error('no enrollment or practitioner');
    return {
      tenantId,
      facilityId: facility.id,
      ownerId: member.id,
      deviceId: device.id,
      enrollmentId: enrollment.id,
      practitionerId: practitioner.id,
    };
  });
}

let a: Clinic;
let b: Clinic;

beforeAll(async () => {
  a = await createClinic();
  b = await createClinic();
});

describe('specialties seed', () => {
  it('holds the 22 specialties of the spec, in order, with fixed UUIDv7 ids', async () => {
    const all = await app.select().from(specialties).orderBy(specialties.position);
    expect(all).toHaveLength(22);
    expect(all.map((s) => s.position)).toEqual(all.map((_, i) => i + 1));
    expect(all[0]).toMatchObject({ code: 'general-practice', nameLatin: 'General practice' });
    expect(all.map((s) => s.code)).toEqual(
      expect.arrayContaining(['pediatrics', 'general-dentistry', 'ent', 'physical-therapy']),
    );
    const [versions] = await app
      .execute<{ all: boolean }>(
        sql`select bool_and(uuid_extract_version(id) = 7) as all from specialties`,
      )
      .then((result) => result.rows);
    expect(versions?.all).toBe(true);
  });

  it('is read-only for the app role', async () => {
    expect(
      await refusal(
        app
          .insert(specialties)
          .values({ code: 'test', nameAr: 'تجريب', nameLatin: 'Test', position: 99 }),
      ),
    ).toMatch(/permission denied/);
    expect(await refusal(app.update(specialties).set({ position: 1 }))).toMatch(
      /permission denied/,
    );
  });
});

describe('tenants', () => {
  it('lock after 15 idle minutes and read by branch by default, within the limits', async () => {
    const [row] = await app.select().from(tenants).where(eq(tenants.id, a.tenantId));
    expect(row).toMatchObject({ idleLockMinutes: 15, clinicalReadScope: 'branch' });
    expect(
      await refusal(
        app.update(tenants).set({ idleLockMinutes: 4 }).where(eq(tenants.id, a.tenantId)),
      ),
    ).toMatch(/tenants_idle_lock_minutes/);
    expect(
      await refusal(
        app.update(tenants).set({ clinicalReadScope: 'all' }).where(eq(tenants.id, a.tenantId)),
      ),
    ).toMatch(/tenants_clinical_read_scope/);
  });
});

describe('accounts', () => {
  it('are unique per phone and refuse a phone that is not E.164', async () => {
    const [first] = await app.select().from(accounts).limit(1);
    expect(await refusal(app.insert(accounts).values({ phone: first?.phone ?? '' }))).toMatch(
      /accounts_phone_unique/,
    );
    expect(await refusal(app.insert(accounts).values({ phone: '0900000000' }))).toMatch(
      /accounts_phone/,
    );
  });
});

const tenantTables = [
  staffMemberships,
  staffMembershipFacilities,
  devices,
  deviceEnrollments,
  staffSessions,
  practitioners,
  practitionerSpecialties,
  practitionerPhotos,
];

describe('tenant isolation of the S02 tables', () => {
  it('shows each tenant only its own rows, and nothing outside a tenant transaction', async () => {
    for (const table of tenantTables) {
      expect(await app.select().from(table)).toEqual([]);
      for (const clinic of [a, b]) {
        const rows = await withTenant(app, clinic.tenantId, (tx) => tx.select().from(table));
        for (const row of rows) expect(row.tenantId).toBe(clinic.tenantId);
      }
    }
    const devicesOfA = await withTenant(app, a.tenantId, (tx) => tx.select().from(devices));
    expect(devicesOfA.map((d) => d.id)).toEqual([a.deviceId]);
  });

  it("refuses a row for another tenant, and a reference to another tenant's row", async () => {
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(deviceEnrollments).values({
            tenantId: b.tenantId,
            deviceId: b.deviceId,
            membershipId: b.ownerId,
            publicKey: key('X'),
          }),
        ),
      ),
    ).toMatch(RLS_REFUSAL);
    // Tenant A's own row pointing at tenant B's device and member: the composite keys refuse it.
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(deviceEnrollments).values({
            tenantId: a.tenantId,
            deviceId: b.deviceId,
            membershipId: a.ownerId,
            publicKey: key('X'),
          }),
        ),
      ),
    ).toMatch(/device_enrollments_device_fk/);
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(staffMembershipFacilities).values({
            tenantId: a.tenantId,
            membershipId: a.ownerId,
            facilityId: b.facilityId,
          }),
        ),
      ),
    ).toMatch(/staff_membership_facilities_facility_fk/);
  });

  it('never lets the app role delete a business row', async () => {
    for (const table of tenantTables) {
      expect(await refusal(withTenant(app, a.tenantId, (tx) => tx.delete(table)))).toMatch(
        /permission denied/,
      );
    }
    for (const table of [accounts, accountTenantLinks]) {
      expect(await refusal(app.delete(table))).toMatch(/permission denied/);
    }
  });
});

describe('staff memberships', () => {
  const member = (tenantId: string, accountId: string) => ({
    tenantId,
    accountId,
    status: 'active',
    roles: ['reception'],
    invitedName: 'موظف تجريبي',
  });

  it('give owners every branch and keep roles to the five of the catalog', async () => {
    const account = await createAccount();
    const insert = (values: Partial<ReturnType<typeof member>> & { allFacilities?: boolean }) =>
      refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(staffMemberships).values({ ...member(a.tenantId, account.id), ...values }),
        ),
      );
    expect(await insert({ roles: ['owner'] })).toMatch(/staff_memberships_owner_all_facilities/);
    expect(await insert({ roles: ['surgeon'] })).toMatch(/staff_memberships_roles/);
    expect(await insert({ roles: [] })).toMatch(/staff_memberships_roles/);
    expect(await insert({ roles: ['doctor', 'doctor'] })).toMatch(/staff_memberships_roles/);
  });

  it('need an expiry and a message status while invited, and one membership per account', async () => {
    const account = await createAccount();
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx
            .insert(staffMemberships)
            .values({ ...member(a.tenantId, account.id), status: 'invited' }),
        ),
      ),
    ).toMatch(/staff_memberships_invitation/);
    await withTenant(app, a.tenantId, (tx) =>
      tx.insert(staffMemberships).values(member(a.tenantId, account.id)),
    );
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(staffMemberships).values(member(a.tenantId, account.id)),
        ),
      ),
    ).toMatch(/staff_memberships_tenant_account_unique/);
  });

  it('refuse a permission both granted and revoked', async () => {
    const account = await createAccount();
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(staffMemberships).values({
            ...member(a.tenantId, account.id),
            grantedPermissions: ['staff.read'],
            revokedPermissions: ['staff.read'],
          }),
        ),
      ),
    ).toMatch(/staff_memberships_adjustments_disjoint/);
  });
});

describe('devices, enrollments and sessions', () => {
  it('refuse a second registration with the same key, and a second live enrollment', async () => {
    const duplicate = withTenant(app, a.tenantId, (tx) =>
      tx.insert(devices).values({
        tenantId: a.tenantId,
        facilityId: a.facilityId,
        name: 'حاسوب آخر',
        publicKey: key('D'),
        os: 'windows',
        appVersion: '0.1.0',
        registeredByMembershipId: a.ownerId,
      }),
    );
    expect(await refusal(duplicate)).toMatch(/devices_tenant_public_key_unique/);
    const enroll = () =>
      withTenant(app, a.tenantId, (tx) =>
        tx.insert(deviceEnrollments).values({
          tenantId: a.tenantId,
          deviceId: a.deviceId,
          membershipId: a.ownerId,
          publicKey: key('V'),
        }),
      );
    expect(await refusal(enroll())).toMatch(/device_enrollments_current_idx/);
    await withTenant(app, a.tenantId, (tx) =>
      tx
        .update(deviceEnrollments)
        .set({ revokedAt: new Date(), revokeReason: 'pin_forgotten' })
        .where(eq(deviceEnrollments.id, a.enrollmentId)),
    );
    await enroll();
  });

  it('keep revocation and its time together', async () => {
    expect(
      await refusal(
        withTenant(app, b.tenantId, (tx) =>
          tx.update(devices).set({ status: 'revoked' }).where(eq(devices.id, b.deviceId)),
        ),
      ),
    ).toMatch(/devices_revoked/);
    expect(
      await refusal(
        withTenant(app, b.tenantId, (tx) =>
          tx.update(devices).set({ wipedAt: new Date() }).where(eq(devices.id, b.deviceId)),
        ),
      ),
    ).toMatch(/devices_wiped/);
  });

  it('end a session only with a reason of the spec', async () => {
    const [session] = await withTenant(app, b.tenantId, (tx) =>
      tx
        .insert(staffSessions)
        .values({
          tenantId: b.tenantId,
          membershipId: b.ownerId,
          deviceId: b.deviceId,
          enrollmentId: b.enrollmentId,
          refreshTokenHash: 'synthetic-hash',
          expiresAt: new Date(Date.now() + 12 * 3600_000),
        })
        .returning(),
    );
    const end = (endReason: string | null) =>
      withTenant(app, b.tenantId, (tx) =>
        tx
          .update(staffSessions)
          .set({ endedAt: new Date(), endReason })
          .where(eq(staffSessions.id, session?.id ?? '')),
      );
    expect(await refusal(end(null))).toMatch(/staff_sessions_ended/);
    expect(await refusal(end('forgotten'))).toMatch(/staff_sessions_end_reason/);
    await end('locked');
  });
});

describe('practitioners', () => {
  it('hold 1–3 specialties, each once, and one profile per member', async () => {
    const all = await app.select().from(specialties).orderBy(specialties.position);
    const add = (specialtyId: string, position: number) =>
      withTenant(app, a.tenantId, (tx) =>
        tx.insert(practitionerSpecialties).values({
          tenantId: a.tenantId,
          practitionerId: a.practitionerId,
          specialtyId,
          position,
        }),
      );
    await add(all[0]?.id ?? '', 1);
    expect(await refusal(add(all[0]?.id ?? '', 2))).toMatch(
      /practitioner_specialties_specialty_idx/,
    );
    expect(await refusal(add(all[1]?.id ?? '', 1))).toMatch(
      /practitioner_specialties_position_idx/,
    );
    expect(await refusal(add(all[1]?.id ?? '', 4))).toMatch(/practitioner_specialties_position/);
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(practitioners).values({
            tenantId: a.tenantId,
            membershipId: a.ownerId,
            displayNameAr: 'د. طبيب تجريبي',
            gender: 'female',
          }),
        ),
      ),
    ).toMatch(/practitioners_current_idx/);
  });

  it('store square JPEG photos of 128–512 pixels', async () => {
    const jpeg = Buffer.from('synthetic photo bytes');
    const photo = (side: number, contentType = 'image/jpeg') => ({
      tenantId: a.tenantId,
      practitionerId: a.practitionerId,
      contentType,
      bytes: jpeg,
      byteSize: jpeg.length,
      width: side,
      height: side,
      sha256: 'b'.repeat(64),
    });
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) => tx.insert(practitionerPhotos).values(photo(64))),
      ),
    ).toMatch(/practitioner_photos_dimensions/);
    expect(
      await refusal(
        withTenant(app, a.tenantId, (tx) =>
          tx.insert(practitionerPhotos).values(photo(256, 'image/png')),
        ),
      ),
    ).toMatch(/practitioner_photos_content_type/);
    await withTenant(app, a.tenantId, (tx) => tx.insert(practitionerPhotos).values(photo(256)));
  });
});

describe('platform_audit_entries', () => {
  let entryId: string;
  const entry = {
    actorKind: 'platform',
    actorId: uuidv7(),
    action: 'console.request',
    entityType: 'tenant',
    entityId: uuidv7(),
    subjectTenantId: uuidv7(),
    requestRoute: 'POST /api/console/tenants/:id/status',
    occurredAt: new Date('2026-10-18T08:00:00Z'),
  };

  beforeAll(async () => {
    const [row] = await app.insert(platformAuditEntries).values(entry).returning();
    if (!row) throw new Error('no platform audit entry');
    entryId = row.id;
  });

  const update = (db: Database) =>
    db
      .update(platformAuditEntries)
      .set({ action: 'changed' })
      .where(eq(platformAuditEntries.id, entryId));
  const remove = (db: Database) =>
    db.delete(platformAuditEntries).where(eq(platformAuditEntries.id, entryId));

  it('refuses an unknown actor kind', async () => {
    expect(
      await refusal(app.insert(platformAuditEntries).values({ ...entry, actorKind: 'patient' })),
    ).toMatch(/platform_audit_entries_actor_kind/);
  });

  it('refuses UPDATE and DELETE by the app role, which has no such privilege', async () => {
    expect(await refusal(update(app))).toMatch(/permission denied/);
    expect(await refusal(remove(app))).toMatch(/permission denied/);
  });

  it('refuses UPDATE, DELETE and TRUNCATE by the owner role, through the trigger', async () => {
    expect(await refusal(update(owner))).toBe(
      'platform_audit_entries is append-only: UPDATE refused',
    );
    expect(await refusal(remove(owner))).toBe(
      'platform_audit_entries is append-only: DELETE refused',
    );
    expect(await refusal(owner.execute(sql`truncate platform_audit_entries`))).toBe(
      'platform_audit_entries is append-only: TRUNCATE refused',
    );
  });
});
