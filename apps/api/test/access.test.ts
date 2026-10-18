import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listRoutes, type Route } from '../src/core/routes.js';
import { createTestApp } from './app.js';
import { type Session, StaffClient } from './staff.js';

// The HTTP access tests of spec S02 (Acceptance, "Tests"): every staff route of S01 and S02 with
// success, 401 without a session, 403 without the permission and another tenant's ids; console,
// device and ticket routes refused for the wrong credentials. Synthetic data only.

let app: INestApplication;
let client: StaffClient;
let a: Awaited<ReturnType<StaffClient['clinic']>>;
let b: Awaited<ReturnType<StaffClient['clinic']>>;
let secondBranch: string;
/** Reception: no `tenant.manage`, no `facility.manage`. */
let reception: Session;
/** A nurse whose `tenant.read` the owner revoked. */
let withoutRead: Session;
/** Reception granted `facility.manage`, scoped to the second branch only. */
let branchManager: Session;

const bearer = (session: Session) => `Bearer ${session.accessToken}`;
const key = (route: Pick<Route, 'method' | 'path'>) => `${route.method} ${route.path}`;

beforeAll(async () => {
  app = await createTestApp();
  client = await StaffClient.create(app);
  a = await client.clinic({ branch: true });
  b = await client.clinic({ branch: true });
  secondBranch = await client.addBranch(a.owner);
  reception = await client.member(a.tenantId, a.owner.device, { roles: ['reception'] });
  withoutRead = await client.member(a.tenantId, a.owner.device, {
    roles: ['nurse'],
    revoked: ['tenant.read'],
  });
  const secondComputer = await client.register(
    await client.signIn(a.phone),
    a.tenantId,
    secondBranch,
  );
  branchManager = await client.member(a.tenantId, secondComputer.device, {
    roles: ['reception'],
    facilityIds: [secondBranch],
    granted: ['facility.manage'],
  });
});
afterAll(() => app.close());

const staffRoutes = () => listRoutes(app).filter((route) => route.access?.kind === 'staff');

function call(route: Pick<Route, 'method' | 'path'>, path = route.path) {
  const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
  return client.http[method](path);
}

const withIds = (path: string, id: string) => path.replace(':id', id);

describe('staff routes', () => {
  it('answer 401 without a session, and with a device token or ticket in its place', async () => {
    const token = await client.deviceToken(a.owner.device);
    for (const route of staffRoutes()) {
      const path = withIds(route.path, uuidv7());
      const bare = await call(route, path).send({});
      expect(bare.status, key(route)).toBe(401);
      const device = await call(route, path).set('authorization', `Bearer ${token}`).send({});
      expect(device.body.code, key(route)).toBe('UNAUTHENTICATED');
      const forged = await call(route, path).set('authorization', 'Bearer x.y.z').send({});
      expect(forged.body.code, key(route)).toBe('UNAUTHENTICATED');
    }
  });

  it('answer 403 to a member without the permission', async () => {
    for (const route of staffRoutes()) {
      const permissions = route.access?.kind === 'staff' ? route.access.permissions : [];
      if (permissions.length === 0) continue;
      const member = permissions.includes('tenant.read') ? withoutRead : reception;
      const response = await call(route, withIds(route.path, a.branchId ?? ''))
        .set('authorization', bearer(member))
        .send({});
      expect(response.status, key(route)).toBe(403);
      expect(response.body.code, key(route)).toBe('FORBIDDEN');
    }
  });

  it("answer NOT_FOUND for another tenant's branch, and show only the session's tenant", async () => {
    const own = await client.http
      .get(`/api/facilities/${a.branchId}`)
      .set('authorization', bearer(reception))
      .expect(200);
    const edit = { ...strip(own.body), expectedUpdatedAt: own.body.updatedAt };
    for (const route of staffRoutes().filter((r) => r.path.startsWith('/api/facilities/:id'))) {
      const response = await call(route, withIds(route.path, a.branchId ?? ''))
        .set('authorization', bearer(b.owner))
        .send(route.method === 'PATCH' ? edit : {});
      expect(response.status, key(route)).toBe(404);
      expect(response.body.code, key(route)).toBe('NOT_FOUND');
    }
    const tenant = await client.http
      .get('/api/tenant')
      .set('authorization', bearer(b.owner))
      .expect(200);
    expect(tenant.body.id).toBe(b.tenantId);
  });

  it('keep facility.manage to the branches of the member', async () => {
    const read = async (id: string) =>
      (
        await client.http
          .get(`/api/facilities/${id}`)
          .set('authorization', bearer(branchManager))
          .expect(200)
      ).body;
    const own = await read(secondBranch);
    await client.http
      .patch(`/api/facilities/${secondBranch}`)
      .set('authorization', bearer(branchManager))
      .send({ ...strip(own), expectedUpdatedAt: own.updatedAt })
      .expect(200);
    const other = await read(a.branchId ?? '');
    const refused = await client.http
      .patch(`/api/facilities/${a.branchId}`)
      .set('authorization', bearer(branchManager))
      .send({ ...strip(other), expectedUpdatedAt: other.updatedAt });
    expect(refused.status).toBe(403);
    // Archiving stays with the owner (`tenant.manage`).
    await client.http
      .post(`/api/facilities/${secondBranch}/archive`)
      .set('authorization', bearer(branchManager))
      .expect(403);
  });
  // Last: it signs the owner out.
  it('succeed for the owner, each one of them', async () => {
    const owner = a.owner;
    const done = new Set<string>();
    const as = (method: string, path: string, session: Session = owner) => {
      done.add(`${method} ${path}`);
      const route = { method, path };
      return call(route, path.replace(':id', currentId)).set('authorization', bearer(session));
    };
    let currentId = '';

    const tenant = await as('GET', '/api/tenant').expect(200);
    expect(tenant.body.id).toBe(a.tenantId);
    await as('PATCH', '/api/tenant/profile')
      .send({ nameAr: 'عيادة معدلة', nameLatin: null, expectedUpdatedAt: tenant.body.updatedAt })
      .expect(200);
    const logo = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#0b6b4f' },
    })
      .png()
      .toBuffer();
    await as('PUT', '/api/tenant/logo').attach('file', logo, 'logo.png').expect(200);
    await as('GET', '/api/tenant/logo').expect(200);
    await as('DELETE', '/api/tenant/logo').expect(200);
    await as('POST', '/api/tenant/onboarding/complete').expect(201);

    const list = await as('GET', '/api/facilities').expect(200);
    const branch = list.body.items.find((item: { id: string }) => item.id === a.branchId);
    const created = await as('POST', '/api/facilities')
      .send({ ...strip(branch), name: 'فرع ثالث' })
      .expect(201);
    currentId = created.body.id;
    await as('GET', '/api/facilities/:id').expect(200);
    await as('PATCH', '/api/facilities/:id')
      .send({ ...strip(created.body), expectedUpdatedAt: created.body.updatedAt })
      .expect(200);
    await as('POST', '/api/facilities/:id/archive').expect(201);
    await as('POST', '/api/facilities/:id/restore').expect(201);

    const governorates = await as('GET', '/api/areas').expect(200);
    currentId = governorates.body[0].id;
    await as('GET', '/api/areas/:id').expect(200);
    await as('POST', '/api/maps/resolve-link')
      .send({ url: 'https://www.google.com/maps/@36.5864,37.0453,17z' })
      .expect(201);

    await as('GET', '/api/access/catalog').expect(200);
    await as('GET', '/api/me').expect(200);
    await as('PUT', '/api/me/password')
      .send({
        currentPassword: 'synthetic clinic passphrase',
        newPassword: 'another synthetic passphrase',
      })
      .expect(200);
    await as('POST', '/api/sessions/current/end').send({ reason: 'signed_out' }).expect(201);

    expect([...done].sort()).toEqual(staffRoutes().map(key).sort());
  });
});

describe('console, device and ticket routes', () => {
  it('refuse a staff session on every console route', async () => {
    const routes = listRoutes(app).filter((route) => route.access?.kind === 'console');
    expect(routes.length).toBeGreaterThan(0);
    for (const route of routes) {
      const response = await call(route, withIds(route.path, a.tenantId))
        .set('authorization', bearer(a.owner))
        .send({});
      expect(response.status, key(route)).toBe(401);
    }
  });

  it('refuse device routes without a device token, or with an access token in its place', async () => {
    const routes = listRoutes(app).filter((route) => route.access?.kind === 'device');
    expect(routes.map(key).sort()).toEqual([
      'GET /api/devices/current',
      'POST /api/devices/current/enrollments',
      'POST /api/devices/current/wiped',
      'POST /api/sessions',
      'POST /api/sessions/challenge',
      'POST /api/sessions/refresh',
    ]);
    for (const route of routes) {
      expect((await call(route).send({})).status, key(route)).toBe(401);
      const swapped = await call(route).set('x-device-token', reception.accessToken).send({});
      expect(swapped.body.code, key(route)).toBe('UNAUTHENTICATED');
    }
  });

  it("refuse another tenant's device token on this tenant's sessions", async () => {
    const response = await client.http
      .post('/api/sessions/refresh')
      .set('x-device-token', await client.deviceToken(b.owner.device))
      .send({ refreshToken: reception.refreshToken });
    expect(response.body.code).toBe('SESSION_ENDED');
  });

  it('refuse ticket routes without a ticket, or with another token in its place', async () => {
    const routes = listRoutes(app).filter((route) => route.access?.kind === 'ticket');
    expect(routes.map(key).sort()).toEqual([
      'GET /api/auth/registration-options',
      'POST /api/auth/password',
      'POST /api/devices',
    ]);
    for (const route of routes) {
      const bare = await call(route).send({});
      expect(bare.body.code, key(route)).toBe('TICKET_INVALID');
      const swapped = await call(route).set('x-sign-in-ticket', reception.accessToken).send({});
      expect(swapped.body.code, key(route)).toBe('TICKET_INVALID');
    }
  });

  it('declare no feature (identity belongs to every package)', () => {
    const routes = listRoutes(app).filter((route) =>
      /^\/api\/(auth|me|devices|sessions|access|\.well-known)(\/|$)/.test(route.path),
    );
    for (const route of routes) expect(route.entitlement, key(route)).toEqual({ kind: 'none' });
  });
});

/** A branch as the edit form sends it back: its fields without the server's. */
function strip(facility: Record<string, unknown>) {
  const {
    id: _,
    type: __,
    createdAt: ___,
    updatedAt: ____,
    archivedAt: _____,
    ...fields
  } = facility;
  return fields;
}
