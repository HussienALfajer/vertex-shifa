import type { INestApplication } from '@nestjs/common';
import {
  accounts,
  accountTenantLinks,
  auditEntries,
  deviceEnrollments,
  outboxEvents,
  platformAuditEntries,
  staffSessions,
  tenants,
  withTenant,
} from '@vertex-shifa/db';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StaffService } from '../src/modules/platform/access/staff.service.js';
import { createTestApp } from './app.js';
import { type Device, newPhone, ownerActor, type Session, StaffClient } from './staff.js';

// Spec S02 service tests of staff management, doctor profiles, computers and security settings,
// over HTTP as the clinic app calls them. Synthetic data only.

let app: INestApplication;
let client: StaffClient;
let specialtyIds: string[];

beforeAll(async () => {
  app = await createTestApp();
  client = await StaffClient.create(app);
  specialtyIds = await client.specialtyIds(3);
});
afterAll(() => app.close());

const bearer = (session: { accessToken: string }) => `Bearer ${session.accessToken}`;
const DAY_MS = 86_400_000;

/** A clinic past onboarding (invitations wait for it), its owner signed in, with one branch. */
async function activeClinic() {
  const clinic = await client.clinic({ branch: true });
  await client.http
    .post('/api/tenant/onboarding/complete')
    .set('authorization', bearer(clinic.owner))
    .expect(201);
  return { ...clinic, branchId: clinic.branchId ?? '' };
}

const as = (session: { accessToken: string }) => ({
  get: (path: string) => client.http.get(path).set('authorization', bearer(session)),
  post: (path: string, body: object = {}) =>
    client.http.post(path).set('authorization', bearer(session)).send(body),
  patch: (path: string, body: object) =>
    client.http.patch(path).set('authorization', bearer(session)).send(body),
  put: (path: string, file: Buffer) =>
    client.http.put(path).set('authorization', bearer(session)).attach('file', file, 'photo'),
  delete: (path: string) => client.http.delete(path).set('authorization', bearer(session)),
});

const profile = (ids = specialtyIds.slice(0, 1)) => ({
  displayNameAr: 'د. طبيب تجريبي',
  gender: 'female',
  specialtyIds: ids,
});

const invitation = (overrides: object = {}) => ({
  phone: newPhone(),
  name: 'اسم كتبه المالك',
  roles: ['reception'],
  branchScope: { allFacilities: true },
  ...overrides,
});

/** The person accepts the invitation (first sign-in) and enrolls on `device`. */
async function join(device: Device, phone: string): Promise<Session> {
  return client.enroll(device, await client.firstSignIn(phone));
}

function setStatus(tenantId: string, status: 'active' | 'suspended' | 'closed') {
  return client.db
    .update(tenants)
    .set({
      status,
      statusReason: status === 'active' ? null : 'other',
      archivedAt: status === 'closed' ? new Date() : null,
    })
    .where(eq(tenants.id, tenantId));
}

function audit(tenantId: string, action: string) {
  return withTenant(client.db, tenantId, (tx) =>
    tx
      .select()
      .from(auditEntries)
      .where(and(eq(auditEntries.tenantId, tenantId), eq(auditEntries.action, action))),
  );
}

describe('invitations', () => {
  it('invite by phone with the outbox event, and never show what the account already holds', async () => {
    const a = await activeClinic();
    const b = await client.clinic();
    const invited = await as(a.owner)
      .post('/api/staff/invitations', invitation({ phone: b.phone }))
      .expect(201);
    expect(invited.body).toMatchObject({
      name: 'اسم كتبه المالك',
      phone: b.phone,
      status: 'invited',
      roles: ['reception'],
      branchScope: { allFacilities: true },
      invitationMessageStatus: 'pending',
      practitionerId: null,
    });
    const expiresIn = Date.parse(invited.body.invitationExpiresAt) - Date.now();
    expect(expiresIn).toBeGreaterThan(7 * DAY_MS - 60_000);
    const events = await withTenant(client.db, a.tenantId, (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.type, 'staff.invitation_created.v1')),
    );
    expect(events.map((event) => event.payload)).toContainEqual({
      tenantId: a.tenantId,
      membershipId: invited.body.id,
    });
    const entries = await audit(a.tenantId, 'staff.invited');
    expect(entries.map((entry) => entry.entityId)).toContain(invited.body.id);

    const again = await as(a.owner).post('/api/staff/invitations', invitation({ phone: b.phone }));
    expect(again.body.code).toBe('ALREADY_MEMBER');

    // The person already has a password: signing in with the OTP accepts the invitation, and the
    // list shows the name they set.
    await client.enroll(a.owner.device, await client.signIn(b.phone));
    const member = await as(a.owner).get(`/api/staff/${invited.body.id}`).expect(200);
    expect(member.body).toMatchObject({ status: 'active', name: 'موظف تجريبي' });
    expect(member.body.acceptedAt).not.toBeNull();
  });

  it('refuse grants outside the limits, branches not in use and a doctor without a valid profile', async () => {
    const a = await activeClinic();
    const other = await activeClinic();
    const spare = await client.addBranch(a.owner);
    await as(a.owner).post(`/api/facilities/${spare}/archive`).expect(201);
    const refused = async (body: object) =>
      (await as(a.owner).post('/api/staff/invitations', invitation(body))).body.code;

    const adjustments = (granted: string[], revoked: string[] = []) => ({ granted, revoked });
    expect(await refused({ adjustments: adjustments(['tenant.manage']) })).toBe(
      'PERMISSION_NOT_GRANTABLE',
    );
    expect(
      await refused({ roles: ['nurse'], adjustments: adjustments(['practitioner.edit_own']) }),
    ).toBe('PERMISSION_NOT_GRANTABLE');
    for (const locked of ['staff.manage', 'tenant.read', 'staff.read', 'practitioners.read']) {
      expect(
        await refused({ roles: ['owner'], adjustments: adjustments([], [locked]) }),
        locked,
      ).toBe('PERMISSION_NOT_GRANTABLE');
    }
    const scope = (facilityIds: string[]) => ({ allFacilities: false, facilityIds });
    expect(await refused({ roles: ['owner'], branchScope: scope([a.branchId]) })).toBe(
      'VALIDATION_FAILED',
    );
    expect(await refused({ branchScope: scope([other.branchId]) })).toBe('VALIDATION_FAILED');
    expect(await refused({ branchScope: scope([spare]) })).toBe('VALIDATION_FAILED');
    expect(await refused({ branchScope: scope([]) })).toBe('VALIDATION_FAILED');
    expect(await refused({ roles: ['doctor'] })).toBe('VALIDATION_FAILED');
    const phone = newPhone();
    expect(await refused({ phone, roles: ['doctor'], practitioner: profile([uuidv7()]) })).toBe(
      'VALIDATION_FAILED',
    );

    // Nothing of a refused invitation stays: the same phone is invited at once.
    const doctor = await as(a.owner)
      .post(
        '/api/staff/invitations',
        invitation({ phone, roles: ['doctor'], practitioner: profile() }),
      )
      .expect(201);
    expect(doctor.body.practitionerId).not.toBeNull();
  });

  it('wait for the end of onboarding, and stop while the clinic is suspended or closed', async () => {
    const onboarding = await client.clinic({ branch: true });
    const first = await as(onboarding.owner).post('/api/staff/invitations', invitation());
    expect(first.body.code).toBe('ONBOARDING_INCOMPLETE');

    const a = await activeClinic();
    await setStatus(a.tenantId, 'suspended');
    expect((await as(a.owner).post('/api/staff/invitations', invitation())).body.code).toBe(
      'TENANT_SUSPENDED',
    );
    await setStatus(a.tenantId, 'closed');
    expect((await as(a.owner).post('/api/staff/invitations', invitation())).body.code).toBe(
      'TENANT_CLOSED',
    );
  });

  it('resend after 10 minutes with a new expiry; cancel archives; inviting again restores it', async () => {
    const a = await activeClinic();
    const body = invitation({ roles: ['doctor'], practitioner: profile() });
    const invited = await as(a.owner).post('/api/staff/invitations', body).expect(201);
    const id = invited.body.id as string;
    const early = await as(a.owner).post(`/api/staff/${id}/invitation/resend`);
    expect(early.body.code).toBe('RATE_LIMITED');
    await client.backdateInvitation(a.tenantId, id);
    const resent = await as(a.owner).post(`/api/staff/${id}/invitation/resend`).expect(201);
    expect(Date.parse(resent.body.invitationExpiresAt)).toBeGreaterThan(
      Date.parse(invited.body.invitationExpiresAt),
    );
    const events = await withTenant(client.db, a.tenantId, (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.type, 'staff.invitation_created.v1')),
    );
    expect(
      events.filter((event) => (event.payload as { membershipId: string }).membershipId === id),
    ).toHaveLength(2);

    const cancelled = await as(a.owner).post(`/api/staff/${id}/invitation/cancel`).expect(201);
    expect(cancelled.body.archivedAt).not.toBeNull();
    expect(cancelled.body.practitionerId).toBeNull();
    const list = await as(a.owner).get('/api/staff').expect(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(id);
    const [account] = await client.db.select().from(accounts).where(eq(accounts.phone, body.phone));
    const [link] = await client.db
      .select()
      .from(accountTenantLinks)
      .where(eq(accountTenantLinks.accountId, account?.id ?? ''));
    expect(link?.archivedAt).not.toBeNull();
    for (const action of ['invitation/resend', 'invitation/cancel']) {
      const refused = await as(a.owner).post(`/api/staff/${id}/${action}`);
      expect(refused.body.code, action).toBe('INVALID_STATUS_TRANSITION');
    }

    const restored = await as(a.owner).post('/api/staff/invitations', body).expect(201);
    expect(restored.body).toMatchObject({ id, status: 'invited', archivedAt: null });
    expect(restored.body.practitionerId).toBe(invited.body.practitionerId);

    // An accepted invitation is neither resent nor cancelled.
    const owner = (await as(a.owner).get('/api/me').expect(200)).body.membershipId;
    for (const action of ['invitation/resend', 'invitation/cancel']) {
      const refused = await as(a.owner).post(`/api/staff/${owner}/${action}`);
      expect(refused.body.code, action).toBe('INVALID_STATUS_TRANSITION');
    }
  });

  it('list members by status, a page at a time', async () => {
    const a = await activeClinic();
    for (let i = 0; i < 3; i += 1) {
      await as(a.owner).post('/api/staff/invitations', invitation()).expect(201);
    }
    const invited = await as(a.owner).get('/api/staff?status=invited&pageSize=2').expect(200);
    expect(invited.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(invited.body.items).toHaveLength(2);
    const active = await as(a.owner).get('/api/staff?status=active').expect(200);
    expect(active.body.items.map((item: { roles: string[] }) => item.roles)).toEqual([['owner']]);
  });
});

describe('access changes', () => {
  it('keep an active owner: the last one is never demoted or deactivated', async () => {
    const a = await activeClinic();
    const self = (await as(a.owner).get('/api/me').expect(200)).body.membershipId as string;
    const read = async (id: string) => (await as(a.owner).get(`/api/staff/${id}`).expect(200)).body;
    const change = async (id: string, roles: string[]) =>
      as(a.owner).patch(`/api/staff/${id}/access`, {
        roles,
        branchScope: { allFacilities: true },
        expectedUpdatedAt: (await read(id)).updatedAt,
      });
    expect((await change(self, ['reception'])).body.code).toBe('LAST_OWNER');
    // Rule 6: an owner never loses the locked permissions, their own included.
    const revokeOwn = await as(a.owner).patch(`/api/staff/${self}/access`, {
      roles: ['owner'],
      branchScope: { allFacilities: true },
      adjustments: { granted: [], revoked: ['staff.read'] },
      expectedUpdatedAt: (await read(self)).updatedAt,
    });
    expect(revokeOwn.body.code).toBe('PERMISSION_NOT_GRANTABLE');
    const deactivate = (id: string) =>
      as(a.owner).post(`/api/staff/${id}/deactivate`, { reason: 'سبب تجريبي' });
    expect((await deactivate(self)).body.code).toBe('LAST_OWNER');

    // An invited owner does not count until they accept.
    const second = await as(a.owner)
      .post('/api/staff/invitations', invitation({ roles: ['owner'] }))
      .expect(201);
    expect((await deactivate(self)).body.code).toBe('LAST_OWNER');
    await join(a.owner.device, second.body.phone);
    await change(second.body.id, ['reception']).then((response) =>
      expect(response.status).toBe(200),
    );
    await change(second.body.id, ['owner']).then((response) => expect(response.status).toBe(200));
    await deactivate(second.body.id).expect(201);
    expect((await deactivate(self)).body.code).toBe('LAST_OWNER');

    // An owner deactivated after the guard admitted their request is refused once the tenant is
    // locked: they cannot undo their own deactivation.
    const stale = { ...ownerActor(a.tenantId), membershipId: second.body.id as string };
    const refused = app.get(StaffService).reactivate(stale, second.body.id);
    await expect(refused).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuse a change made on a stale read with CONFLICT', async () => {
    const a = await activeClinic();
    const invited = await as(a.owner).post('/api/staff/invitations', invitation()).expect(201);
    const edit = (roles: string[]) =>
      as(a.owner).patch(`/api/staff/${invited.body.id}/access`, {
        roles,
        branchScope: { allFacilities: true },
        expectedUpdatedAt: invited.body.updatedAt,
      });
    await edit(['nurse']).expect(200);
    expect((await edit(['accountant'])).body.code).toBe('CONFLICT');
  });

  it('end sessions and enrollments on computers that leave the scope, and on deactivation', async () => {
    const a = await activeClinic();
    const second = await client.addBranch(a.owner);
    const computer = await client.register(await client.signIn(a.phone), a.tenantId, second);
    const invited = await as(a.owner)
      .post(
        '/api/staff/invitations',
        invitation({
          roles: ['nurse'],
          branchScope: { allFacilities: false, facilityIds: [a.branchId, second] },
        }),
      )
      .expect(201);
    const id = invited.body.id as string;
    const here = await join(a.owner.device, invited.body.phone);
    const there = await client.enroll(computer.device, await client.signIn(invited.body.phone));
    await as(there).get('/api/me').expect(200);

    const narrowed = await as(a.owner)
      .patch(`/api/staff/${id}/access`, {
        roles: ['nurse'],
        branchScope: { allFacilities: false, facilityIds: [a.branchId] },
        expectedUpdatedAt: (await as(a.owner).get(`/api/staff/${id}`)).body.updatedAt,
      })
      .expect(200);
    expect(narrowed.body.branchScope).toEqual({ allFacilities: false, facilityIds: [a.branchId] });
    expect((await as(there).get('/api/me')).body.code).toBe('SESSION_ENDED');
    await as(here).get('/api/me').expect(200);
    const enrollment = async (enrollmentId: string) =>
      (
        await withTenant(client.db, a.tenantId, (tx) =>
          tx.select().from(deviceEnrollments).where(eq(deviceEnrollments.id, enrollmentId)),
        )
      )[0];
    expect((await enrollment(there.enrollmentId))?.revokeReason).toBe('branch_left');
    expect((await enrollment(here.enrollmentId))?.revokedAt).toBeNull();

    const deactivated = await as(a.owner)
      .post(`/api/staff/${id}/deactivate`, { reason: 'سبب تجريبي' })
      .expect(201);
    expect(deactivated.body).toMatchObject({ status: 'deactivated' });
    expect((await as(here).get('/api/me')).body.code).toBe('SESSION_ENDED');
    expect((await enrollment(here.enrollmentId))?.revokeReason).toBe('member_deactivated');
    const [session] = await withTenant(client.db, a.tenantId, (tx) =>
      tx.select().from(staffSessions).where(eq(staffSessions.id, here.sessionId)),
    );
    expect(session?.endReason).toBe('member_deactivated');
    const [entry] = await audit(a.tenantId, 'staff.deactivated');
    expect(entry).toMatchObject({ entityId: id, reason: 'سبب تجريبي' });

    // Reactivated, the member signs in anew on each computer: the old enrollment stays revoked.
    await as(a.owner).post(`/api/staff/${id}/reactivate`).expect(201);
    const reopened = await client.openSession(a.owner.device, here.enrollmentId, here.userKeys);
    expect(reopened.body.code).toBe('ENROLLMENT_REVOKED');
    await client.enroll(a.owner.device, await client.signIn(invited.body.phone));
  });

  it('archive the doctor profile with the role and restore it, reviewed, when the role comes back', async () => {
    const a = await activeClinic();
    const invited = await as(a.owner).post('/api/staff/invitations', invitation()).expect(201);
    const id = invited.body.id as string;
    const change = async (roles: string[], extra: object = {}) =>
      as(a.owner).patch(`/api/staff/${id}/access`, {
        roles,
        branchScope: { allFacilities: true },
        expectedUpdatedAt: (await as(a.owner).get(`/api/staff/${id}`)).body.updatedAt,
        ...extra,
      });
    const previous = async () =>
      (await as(a.owner).get(`/api/staff/${id}/previous-practitioner`).expect(200)).body;
    // Never a doctor: nothing to restore.
    expect(await previous()).toEqual({ practitioner: null, photo: null });
    expect((await change(['reception', 'doctor'])).body.code).toBe('VALIDATION_FAILED');
    const doctor = await change(['reception', 'doctor'], {
      practitioner: { ...profile(specialtyIds.slice(0, 2)), syndicateNumber: 'SY-123' },
    });
    expect(doctor.status).toBe(200);
    const practitionerId = doctor.body.practitionerId as string;
    expect(practitionerId).toEqual(expect.any(String));
    const jpeg = await sharp({
      create: { width: 300, height: 300, channels: 3, background: '#0b6b4f' },
    })
      .jpeg()
      .toBuffer();
    const photo = await as(a.owner)
      .put(`/api/practitioners/${practitionerId}/photo`, jpeg)
      .expect(200);
    // A current profile is edited on its own screen, not restored.
    expect(await previous()).toEqual({ practitioner: null, photo: null });

    const removed = await change(['reception']);
    expect(removed.body.practitionerId).toBeNull();
    expect((await as(a.owner).get(`/api/practitioners/${practitionerId}`)).body.code).toBe(
      'NOT_FOUND',
    );
    // Rule 9, edge case 11: the archived profile, its specialties, syndicate number and photo.
    const shown = await previous();
    expect(shown.practitioner).toMatchObject({
      id: practitionerId,
      displayNameAr: 'د. طبيب تجريبي',
      gender: 'female',
      specialtyIds: specialtyIds.slice(0, 2),
      syndicateNumber: 'SY-123',
      hasPhoto: true,
    });
    expect(shown.photo).toMatchObject({ sha256: photo.body.sha256 });

    // A staff reader without `staff.manage` does not see it.
    const reader = await client.member(a.tenantId, a.owner.device, {
      roles: ['nurse'],
      granted: ['staff.read'],
    });
    expect((await as(reader).get(`/api/staff/${id}/previous-practitioner`)).body.code).toBe(
      'FORBIDDEN',
    );
    const other = await activeClinic();
    expect((await as(other.owner).get(`/api/staff/${id}/previous-practitioner`)).body.code).toBe(
      'NOT_FOUND',
    );

    // Sent back reviewed, the same profile returns with the owner's edits.
    const back = await change(['doctor'], {
      practitioner: { ...profile([specialtyIds[2] as string]), syndicateNumber: 'SY-124' },
    });
    expect(back.body.practitionerId).toBe(practitionerId);
    const restored = await as(a.owner).get(`/api/practitioners/${practitionerId}`).expect(200);
    expect(restored.body).toMatchObject({
      displayNameAr: 'د. طبيب تجريبي',
      gender: 'female',
      specialtyIds: [specialtyIds[2]],
      syndicateNumber: 'SY-124',
      hasPhoto: true,
    });
    expect(await previous()).toEqual({ practitioner: null, photo: null });

    // Without a profile in the change, it returns untouched.
    expect((await change(['reception'])).status).toBe(200);
    expect((await change(['doctor'])).body.practitionerId).toBe(practitionerId);
    const untouched = await as(a.owner).get(`/api/practitioners/${practitionerId}`).expect(200);
    expect(untouched.body).toMatchObject({
      specialtyIds: [specialtyIds[2]],
      syndicateNumber: 'SY-124',
    });
    expect(await audit(a.tenantId, 'practitioner.created')).toHaveLength(1);
    expect(await audit(a.tenantId, 'practitioner.archived')).toHaveLength(2);
    expect(await audit(a.tenantId, 'practitioner.restored')).toHaveLength(2);
  });

  it('authorize a password reset for 72 hours, for active members only', async () => {
    const a = await activeClinic();
    const member = await client.member(a.tenantId, a.owner.device, { roles: ['nurse'] });
    const response = await as(a.owner)
      .post(`/api/staff/${member.membershipId}/password-reset`)
      .expect(201);
    const until = Date.parse(response.body.passwordResetAuthorizedUntil);
    expect(until - Date.now()).toBeGreaterThan(72 * 3_600_000 - 60_000);
    const [account] = await client.db
      .select()
      .from(accounts)
      .where(eq(accounts.phone, member.phone));
    expect(account?.passwordResetAuthorizedUntil?.getTime()).toBe(until);
    expect(await audit(a.tenantId, 'staff.password_reset_authorized')).toHaveLength(1);
    const platform = await client.db
      .select()
      .from(platformAuditEntries)
      .where(eq(platformAuditEntries.entityId, account?.id ?? ''));
    expect(platform.map((entry) => entry.action)).toContain('account.password_reset_authorized');

    const invited = await as(a.owner).post('/api/staff/invitations', invitation()).expect(201);
    const refused = await as(a.owner).post(`/api/staff/${invited.body.id}/password-reset`);
    expect(refused.body.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('practitioners', () => {
  it('let a doctor edit their own profile, owners every profile, and nobody else', async () => {
    const a = await activeClinic();
    const doctors = [];
    for (let i = 0; i < 2; i += 1) {
      const invited = await as(a.owner)
        .post('/api/staff/invitations', invitation({ roles: ['doctor'], practitioner: profile() }))
        .expect(201);
      doctors.push(invited.body as { id: string; phone: string; practitionerId: string });
    }
    const [mine, theirs] = doctors as [(typeof doctors)[0], (typeof doctors)[0]];
    const doctor = await join(a.owner.device, mine.phone);
    const me = await as(doctor).get('/api/me').expect(200);
    expect(me.body.practitioner).toMatchObject({ id: mine.practitionerId, membershipId: mine.id });
    expect((await as(a.owner).get('/api/me').expect(200)).body.practitioner).toBeNull();

    const read = async (id: string) =>
      (await as(a.owner).get(`/api/practitioners/${id}`).expect(200)).body;
    const edit = async (session: Session, id: string, changes: object = {}) =>
      as(session).patch(`/api/practitioners/${id}`, {
        ...profile([specialtyIds[2] ?? '', specialtyIds[0] ?? '']),
        displayNameLatin: 'Dr. Synthetic',
        syndicateNumber: 'SY-1234/5',
        expectedUpdatedAt: (await read(id)).updatedAt,
        ...changes,
      });
    const own = await edit(doctor, mine.practitionerId);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({
      specialtyIds: [specialtyIds[2], specialtyIds[0]],
      displayNameLatin: 'Dr. Synthetic',
      syndicateNumber: 'SY-1234/5',
    });
    expect((await edit(doctor, theirs.practitionerId)).body.code).toBe('FORBIDDEN');
    await edit(a.owner, theirs.practitionerId).then((response) =>
      expect(response.status).toBe(200),
    );
    const stale = await as(a.owner).patch(`/api/practitioners/${theirs.practitionerId}`, {
      ...profile(),
      expectedUpdatedAt: new Date(0).toISOString(),
    });
    expect(stale.body.code).toBe('CONFLICT');
    expect(
      (await edit(a.owner, theirs.practitionerId, { specialtyIds: [uuidv7()] })).body.code,
    ).toBe('VALIDATION_FAILED');
    expect(await audit(a.tenantId, 'practitioner.updated')).toHaveLength(2);

    const list = await as(doctor).get('/api/practitioners').expect(200);
    expect(list.body).toHaveLength(2);
    const specialties = await as(doctor).get('/api/specialties').expect(200);
    expect(specialties.body).toHaveLength(22);
    expect(specialties.body[0].code).toBe('general-practice');
  });

  it('store a photo as a square JPEG without metadata, and refuse what does not decode', async () => {
    const a = await activeClinic();
    const invited = await as(a.owner)
      .post('/api/staff/invitations', invitation({ roles: ['doctor'], practitioner: profile() }))
      .expect(201);
    const path = `/api/practitioners/${invited.body.practitionerId}/photo`;
    const image = (width: number, height: number) =>
      sharp({ create: { width, height, channels: 3, background: '#0b6b4f' } });

    const withExif = await image(800, 600)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Artist: 'synthetic' } } })
      .toBuffer();
    const stored = await as(a.owner).put(path, withExif).expect(200);
    expect(stored.body).toMatchObject({ contentType: 'image/jpeg', width: 512, height: 512 });
    const decoded = await sharp(Buffer.from(stored.body.data, 'base64')).metadata();
    expect(decoded).toMatchObject({ format: 'jpeg', width: 512, height: 512 });
    expect(decoded.exif).toBeUndefined();
    const small = await as(a.owner)
      .put(path, await image(200, 150).webp().toBuffer())
      .expect(200);
    expect(small.body).toMatchObject({ width: 150, height: 150 });
    const practitioner = await as(a.owner).get(`/api/practitioners/${invited.body.practitionerId}`);
    expect(practitioner.body.hasPhoto).toBe(true);
    expect(await audit(a.tenantId, 'practitioner_photo.replaced')).toHaveLength(2);

    const rejected = async (file: Buffer) => (await as(a.owner).put(path, file)).body.code;
    expect(await rejected(await image(100, 100).png().toBuffer())).toBe('FILE_REJECTED');
    expect(await rejected(Buffer.from('not an image'))).toBe('FILE_REJECTED');
    expect(await rejected(Buffer.alloc(2 * 1024 * 1024 + 1, 1))).toBe('FILE_REJECTED');

    const removed = await as(a.owner).delete(path).expect(200);
    expect(removed.body.hasPhoto).toBe(false);
    expect((await as(a.owner).get(path)).body.code).toBe('NOT_FOUND');
    expect((await as(a.owner).delete(path)).body.code).toBe('NOT_FOUND');
  });
});

describe('computers', () => {
  it('show devices.manage only the computers of its branches; rename, remove a member, revoke', async () => {
    const a = await activeClinic();
    const second = await client.addBranch(a.owner);
    const computer = await client.register(await client.signIn(a.phone), a.tenantId, second);
    const manager = await client.member(a.tenantId, computer.device, {
      roles: ['reception'],
      facilityIds: [second],
      granted: ['devices.manage'],
    });
    const nurse = await client.member(a.tenantId, computer.device, { roles: ['nurse'] });

    const listed = await as(manager).get('/api/devices').expect(200);
    expect(listed.body.map((device: { id: string }) => device.id)).toEqual([computer.device.id]);
    expect(listed.body[0].members).toHaveLength(3);
    const all = await as(a.owner).get('/api/devices').expect(200);
    expect(all.body).toHaveLength(2);
    expect((await as(manager).get(`/api/devices/${a.owner.device.id}`)).body.code).toBe(
      'FORBIDDEN',
    );
    const refusedRevoke = await as(manager).post(`/api/devices/${a.owner.device.id}/revoke`, {
      category: 'other',
      reason: 'سبب تجريبي',
    });
    expect(refusedRevoke.body.code).toBe('FORBIDDEN');

    const renamed = await as(manager)
      .patch(`/api/devices/${computer.device.id}`, { name: 'حاسوب الاستقبال' })
      .expect(200);
    expect(renamed.body.name).toBe('حاسوب الاستقبال');

    const removePath = `/api/devices/${computer.device.id}/enrollments/${nurse.enrollmentId}/revoke`;
    const removed = await as(manager).post(removePath).expect(201);
    expect(removed.body).toMatchObject({
      id: nurse.enrollmentId,
      revokeReason: 'removed_from_device',
    });
    expect((await as(nurse).get('/api/me')).body.code).toBe('SESSION_ENDED');
    expect((await as(manager).post(removePath)).body.code).toBe('NOT_FOUND');

    const revoked = await as(a.owner)
      .post(`/api/devices/${computer.device.id}/revoke`, {
        category: 'lost_or_stolen',
        reason: 'سبب تجريبي',
      })
      .expect(201);
    expect(revoked.body).toMatchObject({ status: 'revoked', members: [] });
    expect((await as(manager).get('/api/me')).body.code).toBe('SESSION_ENDED');
    const current = await client.http
      .get('/api/devices/current')
      .set('x-device-token', await client.deviceToken(computer.device));
    expect(current.body.code).toBe('DEVICE_REVOKED');
    const twice = await as(a.owner).post(`/api/devices/${computer.device.id}/revoke`, {
      category: 'other',
      reason: 'سبب تجريبي',
    });
    expect(twice.body.code).toBe('INVALID_STATUS_TRANSITION');
    const [entry] = await audit(a.tenantId, 'device.revoked');
    expect(entry?.reason).toBe('lost_or_stolen: سبب تجريبي');
    expect(await audit(a.tenantId, 'device.renamed')).toHaveLength(1);
  });
});

describe('security settings', () => {
  it('change the idle lock and the clinical read scope, while suspended, never once closed', async () => {
    const a = await activeClinic();
    const tenant = await as(a.owner).get('/api/tenant').expect(200);
    expect(tenant.body).toMatchObject({ idleLockMinutes: 15, clinicalReadScope: 'branch' });
    const change = (idleLockMinutes: number, expectedUpdatedAt: string) =>
      as(a.owner).patch('/api/tenant/security', {
        idleLockMinutes,
        clinicalReadScope: 'own_patients',
        expectedUpdatedAt,
      });
    const changed = await change(5, tenant.body.updatedAt).expect(200);
    expect(changed.body).toMatchObject({ idleLockMinutes: 5, clinicalReadScope: 'own_patients' });
    expect((await change(10, tenant.body.updatedAt)).body.code).toBe('CONFLICT');
    expect((await change(4, changed.body.updatedAt)).body.code).toBe('VALIDATION_FAILED');
    const current = await client.http
      .get('/api/devices/current')
      .set('x-device-token', await client.deviceToken(a.owner.device))
      .expect(200);
    expect(current.body.tenant.idleLockMinutes).toBe(5);
    expect(await audit(a.tenantId, 'tenant.security_updated')).toHaveLength(1);

    await setStatus(a.tenantId, 'suspended');
    const read = async () => (await as(a.owner).get('/api/tenant').expect(200)).body.updatedAt;
    await change(20, await read()).expect(200);
    await setStatus(a.tenantId, 'closed');
    expect((await change(30, await read())).body.code).toBe('TENANT_CLOSED');
  });
});
