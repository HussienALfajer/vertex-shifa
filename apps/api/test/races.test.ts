import type { INestApplication } from '@nestjs/common';
import { staffSessionMessage } from '@vertex-shifa/contracts';
import { accounts, staffMemberships, staffSessions, withTenant } from '@vertex-shifa/db';
import { and, arrayContains, eq, isNull } from 'drizzle-orm';
import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';
import { CONSOLE_PASSWORD, ConsoleClient } from './console.js';
import {
  type Device,
  newAddress,
  newKeys,
  newPhone,
  PASSWORD,
  type Session,
  StaffClient,
} from './staff.js';

// Spec S02 single-use tokens across restarts, and the races of identity and access: concurrent
// requests over HTTP, each in its own transaction. Synthetic data only.

let app: INestApplication;
let client: StaffClient;
/** A second API process on the same database, as after a restart: nothing shared in memory. */
let restarted: INestApplication;
let afterRestart: StaffClient;

beforeAll(async () => {
  app = await createTestApp();
  client = await StaffClient.create(app);
  restarted = await createTestApp();
  afterRestart = await StaffClient.create(restarted);
});
afterAll(() => Promise.all([app.close(), restarted.close()]));

const bearer = (session: { accessToken: string }) => `Bearer ${session.accessToken}`;

/** The outcome of each response: its status when it succeeded, else its error code. */
const outcomes = (responses: Response[]): (number | string)[] =>
  responses.map((response) => (response.status < 300 ? response.status : response.body.code));

/** How many responses had each outcome. */
const tally = (responses: Response[]) => {
  const counts: Record<string, number> = {};
  for (const outcome of outcomes(responses)) counts[outcome] = (counts[outcome] ?? 0) + 1;
  return counts;
};

/** A clinic past onboarding with its owner signed in on a computer of its one branch. */
async function activeClinic() {
  const clinic = await client.clinic({ branch: true });
  await client.http
    .post('/api/tenant/onboarding/complete')
    .set('authorization', bearer(clinic.owner))
    .expect(201);
  return { ...clinic, branchId: clinic.branchId ?? '' };
}

function registration(ticket: string, tenantId: string, facilityId: string) {
  return (staff: StaffClient) =>
    staff.http.post('/api/devices').set('x-sign-in-ticket', ticket).send({
      tenantId,
      facilityId,
      name: 'جهاز تجريبي',
      publicKey: newKeys().publicKey,
      os: 'Windows 11',
      appVersion: '0.1.0',
      userPublicKey: newKeys().publicKey,
    });
}

function signIn(staff: StaffClient, address: string, proofOfWork: object) {
  return staff.http
    .post('/api/auth/sign-in')
    .set('x-forwarded-for', address)
    .send({ phone: newPhone(), password: PASSWORD, proofOfWork });
}

describe('single-use tokens', () => {
  it('stay used after a restart: a ticket, a console ticket and a proof of work', async () => {
    const { tenantId, phone, branchId } = await activeClinic();
    const register = registration(await client.signIn(phone), tenantId, branchId);
    await register(client).expect(201);
    expect((await register(afterRestart)).body.code).toBe('TICKET_INVALID');

    const address = newAddress();
    const proof = await client.proofOfWork(address);
    expect((await signIn(client, address, proof)).body.code).toBe('INVALID_CREDENTIALS');
    expect((await signIn(afterRestart, address, proof)).body.code).toBe('POW_INVALID');

    const consoleClient = new ConsoleClient(client);
    const user = await consoleClient.setUp();
    const signedIn = await consoleClient.signIn(user.phone, { password: CONSOLE_PASSWORD });
    const verify = (staff: StaffClient, code: string) =>
      new ConsoleClient(staff)
        .call('post', '/api/console/auth/totp')
        .send({ ticket: signedIn.body.ticket, code });
    await verify(client, user.recoveryCodes[0] ?? '').expect(201);
    expect((await verify(afterRestart, user.recoveryCodes[1] ?? '')).body.code).toBe(
      'TICKET_INVALID',
    );
  });

  it('are used once under concurrent requests', async () => {
    const { tenantId, phone, branchId } = await activeClinic();
    const register = registration(await client.signIn(phone), tenantId, branchId);
    const registered = await Promise.all([register(client), register(afterRestart)]);
    expect(tally(registered)).toEqual({ 201: 1, TICKET_INVALID: 1 });

    const address = newAddress();
    const proof = await client.proofOfWork(address);
    const attempts = await Promise.all(
      [client, afterRestart, client, afterRestart].map((staff) => signIn(staff, address, proof)),
    );
    expect(tally(attempts)).toEqual({ INVALID_CREDENTIALS: 1, POW_INVALID: 3 });
  });

  it('let one of two password-reset tickets set the password', async () => {
    const { phone } = await activeClinic();
    await client.db
      .update(accounts)
      .set({ passwordResetAuthorizedUntil: new Date(Date.now() + 3_600_000) })
      .where(eq(accounts.phone, phone));
    const resetTicket = async () => {
      await client.forgetOtps(phone);
      const address = newAddress();
      const requested = await client.http
        .post('/api/auth/otp/request')
        .set('x-forwarded-for', address)
        .send({ phone, purpose: 'password_reset', proofOfWork: await client.proofOfWork(address) })
        .expect(201);
      const verified = await client.http
        .post('/api/auth/otp/verify')
        .set('x-forwarded-for', address)
        .send({ challengeId: requested.body.challengeId, code: await client.lastCode(phone) })
        .expect(201);
      return verified.body.ticket as string;
    };
    const tickets = [await resetTicket(), await resetTicket()];
    const passwords = ['first synthetic passphrase', 'second synthetic passphrase'];
    const set = await Promise.all(
      tickets.map((ticket, i) =>
        client.http
          .post('/api/auth/password')
          .set('x-sign-in-ticket', ticket)
          .send({ password: passwords[i] }),
      ),
    );
    expect(tally(set)).toEqual({ 201: 1, TICKET_INVALID: 1 });
    const winner = passwords[set.findIndex((response) => response.status === 201)];
    await client.signIn(phone, winner);
    const [account] = await client.db.select().from(accounts).where(eq(accounts.phone, phone));
    expect(account?.passwordResetAuthorizedUntil).toBeNull();
  });
});

describe('access races', () => {
  const read = async (owner: { accessToken: string }, id: string) =>
    (await client.http.get(`/api/staff/${id}`).set('authorization', bearer(owner)).expect(200))
      .body;
  const demote = async (owner: { accessToken: string }, id: string, updatedAt?: string) =>
    client.http
      .patch(`/api/staff/${id}/access`)
      .set('authorization', bearer(owner))
      .send({
        roles: ['reception'],
        branchScope: { allFacilities: true },
        expectedUpdatedAt: updatedAt ?? (await read(owner, id)).updatedAt,
      });
  const deactivate = (owner: { accessToken: string }, id: string) =>
    client.http
      .post(`/api/staff/${id}/deactivate`)
      .set('authorization', bearer(owner))
      .send({ reason: 'سبب تجريبي' });

  async function activeOwners(tenantId: string) {
    return withTenant(client.db, tenantId, (tx) =>
      tx
        .select({ id: staffMemberships.id })
        .from(staffMemberships)
        .where(
          and(
            eq(staffMemberships.status, 'active'),
            arrayContains(staffMemberships.roles, ['owner']),
          ),
        ),
    );
  }

  it('keep an owner when the last two remove each other at once', async () => {
    for (const remove of [demote, deactivate]) {
      const { tenantId, owner } = await activeClinic();
      const ownerId = (
        await client.http.get('/api/me').set('authorization', bearer(owner)).expect(200)
      ).body.membershipId as string;
      const other = await client.member(tenantId, owner.device, { roles: ['owner'] });
      const removed = await Promise.all([
        remove(owner, other.membershipId),
        remove(other, ownerId),
      ]);
      const codes = outcomes(removed);
      expect(codes.filter((code) => typeof code === 'number')).toHaveLength(1);
      // The loser lost staff.manage with the owner role, or its session with its membership.
      const lost = codes.find((code) => typeof code === 'string');
      expect(['FORBIDDEN', 'LAST_OWNER', 'MEMBERSHIP_INACTIVE', 'SESSION_ENDED']).toContain(lost);
      expect(await activeOwners(tenantId)).toHaveLength(1);
    }
  });

  it('refuse the last owner removing both owners at once', async () => {
    const { tenantId, owner } = await activeClinic();
    const ownerId = (
      await client.http.get('/api/me').set('authorization', bearer(owner)).expect(200)
    ).body.membershipId as string;
    const other = await client.member(tenantId, owner.device, { roles: ['owner'] });
    const removed = await Promise.all([
      deactivate(owner, other.membershipId),
      demote(owner, ownerId),
    ]);
    const codes = outcomes(removed);
    expect(codes.filter((code) => typeof code === 'number')).toHaveLength(1);
    expect(codes.some((code) => code === 'LAST_OWNER' || code === 'FORBIDDEN')).toBe(true);
    expect(await activeOwners(tenantId)).toHaveLength(1);
  });

  it('accept one of two changes made from the same version, the other is CONFLICT', async () => {
    const { tenantId, owner } = await activeClinic();
    const nurse = await client.member(tenantId, owner.device, { roles: ['nurse'] });
    const { updatedAt } = await read(owner, nurse.membershipId);
    const changed = await Promise.all([
      demote(owner, nurse.membershipId, updatedAt),
      demote(owner, nurse.membershipId, updatedAt),
    ]);
    expect(tally(changed)).toEqual({ 200: 1, CONFLICT: 1 });
  });
});

describe('session races', () => {
  /** A session request signed and ready to send, so it can race another request. */
  async function preparedOpen(device: Device, member: Pick<Session, 'enrollmentId' | 'userKeys'>) {
    const token = await client.deviceToken(device);
    const challenge = await client.http
      .post('/api/sessions/challenge')
      .set('x-device-token', token)
      .expect(201);
    const { nonce } = challenge.body as { nonce: string };
    return () =>
      client.http
        .post('/api/sessions')
        .set('x-device-token', token)
        .send({
          enrollmentId: member.enrollmentId,
          nonce,
          signature: member.userKeys.sign(
            staffSessionMessage(nonce, device.id, member.enrollmentId),
          ),
        });
  }

  async function openSessions(tenantId: string, where: ReturnType<typeof eq>) {
    return withTenant(client.db, tenantId, (tx) =>
      tx
        .select({ id: staffSessions.id })
        .from(staffSessions)
        .where(and(where, isNull(staffSessions.endedAt))),
    );
  }

  it('leave no open session of a member deactivated while it opened', async () => {
    const { tenantId, owner } = await activeClinic();
    const nurse = await client.member(tenantId, owner.device, { roles: ['nurse'] });
    const open = await preparedOpen(owner.device, nurse);
    const [opened, deactivated] = await Promise.all([
      open(),
      client.http
        .post(`/api/staff/${nurse.membershipId}/deactivate`)
        .set('authorization', bearer(owner))
        .send({ reason: 'سبب تجريبي' }),
    ]);
    expect(deactivated.status).toBe(201);
    expect([201, 'MEMBERSHIP_INACTIVE', 'ENROLLMENT_REVOKED']).toContain(outcomes([opened])[0]);
    expect(
      await openSessions(tenantId, eq(staffSessions.membershipId, nurse.membershipId)),
    ).toEqual([]);
  });

  it('leave no open session on a computer revoked while it opened', async () => {
    const { tenantId, owner, phone, branchId } = await activeClinic();
    const second = await client.register(await client.signIn(phone), tenantId, branchId);
    const nurse = await client.member(tenantId, second.device, { roles: ['nurse'] });
    const open = await preparedOpen(second.device, nurse);
    const [opened, revoked] = await Promise.all([
      open(),
      client.http
        .post(`/api/devices/${second.device.id}/revoke`)
        .set('authorization', bearer(owner))
        .send({ category: 'other', reason: 'سبب تجريبي' }),
    ]);
    expect(revoked.status).toBe(201);
    expect([201, 'DEVICE_REVOKED', 'ENROLLMENT_REVOKED']).toContain(outcomes([opened])[0]);
    expect(await openSessions(tenantId, eq(staffSessions.deviceId, second.device.id))).toEqual([]);
  });
});
