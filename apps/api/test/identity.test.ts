import type { INestApplication } from '@nestjs/common';
import {
  DomainError,
  deviceTokenMessage,
  type ErrorCode,
  otpPolicy,
} from '@vertex-shifa/contracts';
import {
  accounts,
  auditEntries,
  devices,
  otpChallenges,
  outboxEvents,
  platformAuditEntries,
  staffMemberships,
  staffSessions,
  tenants,
  withTenant,
} from '@vertex-shifa/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runAccountCommand } from '../src/cli/account-commands.js';
import { inviteFirstOwner } from '../src/modules/platform/access/index.js';
import {
  AuthService,
  type FakeOtpSender,
  OTP_SENDER,
} from '../src/modules/platform/identity/index.js';
import { OtpChallenges } from '../src/modules/platform/identity/otp-challenges.js';
import { leadingZeroBits, solves } from '../src/modules/platform/identity/proof-of-work.js';
import { KeyedHash } from '../src/modules/platform/identity/secrets.js';
import { createTestApp } from './app.js';
import { newAddress, newKeys, newPhone, PASSWORD, StaffClient } from './staff.js';

// Spec S02 service tests, over HTTP where the clinic app would call. Synthetic data only.

let app: INestApplication;
let client: StaffClient;

beforeAll(async () => {
  app = await createTestApp();
  client = await StaffClient.create(app);
});
afterAll(() => app.close());

const SYSTEM = { kind: 'system' } as const;
const bearer = (token: string) => `Bearer ${token}`;

async function refusal(work: Promise<unknown>): Promise<ErrorCode> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('first sign-in, registration and sessions', () => {
  it('takes the CLI-invited owner from OTP to a session on a computer that gets the first branch', async () => {
    const { tenantId, owner, phone } = await client.clinic();
    const me = await client.http
      .get('/api/me')
      .set('authorization', bearer(owner.accessToken))
      .expect(200);
    expect(me.body).toMatchObject({
      account: { phone, nameAr: 'موظف تجريبي' },
      tenantId,
      roles: ['owner'],
      allFacilities: true,
      facilityId: null,
    });
    expect(me.body.permissions).toContain('staff.manage');

    // Rule 28: the wizard's first branch is given to the computer registered without one.
    const branchId = await client.addBranch(owner);
    const token = await client.deviceToken(owner.device);
    const current = await client.http
      .get('/api/devices/current')
      .set('x-device-token', token)
      .expect(200);
    expect(current.body.device.facilityId).toBe(branchId);
    expect(current.body.facility).toEqual({ id: branchId, name: 'الفرع الرئيسي' });
    expect(current.body.members).toEqual([
      // The account's phone now, which re-enabling a PIN signs in with (edge case 13).
      expect.objectContaining({ membershipId: me.body.membershipId, phone, roles: ['owner'] }),
    ]);
    expect(current.body.tenant.idleLockMinutes).toBe(15);

    const actions = await withTenant(client.db, tenantId, (tx) =>
      tx.select({ action: auditEntries.action }).from(auditEntries),
    );
    expect(actions.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'staff.invited',
        'staff.invitation_accepted',
        'device.registered',
        'device_enrollment.created',
        'staff_session.started',
      ]),
    );
  });

  it('publishes the invitation event of the first owner in the outbox', async () => {
    const { tenantId } = await client.clinic();
    const events = await withTenant(client.db, tenantId, (tx) =>
      tx.select().from(outboxEvents).where(eq(outboxEvents.tenantId, tenantId)),
    );
    expect(events).toEqual([
      expect.objectContaining({
        type: 'staff.invitation_created.v1',
        payload: { tenantId, membershipId: expect.any(String) },
      }),
    ]);
  });

  it('opens, refreshes and ends a session with the user key, never twice with one nonce', async () => {
    const { owner } = await client.clinic({ branch: true });
    const opened = await client.openSession(owner.device, owner.enrollmentId, owner.userKeys);
    expect(opened.status).toBe(201);
    const token = await client.deviceToken(owner.device);
    const refreshed = await client.http
      .post('/api/sessions/refresh')
      .set('x-device-token', token)
      .send({ refreshToken: opened.body.refreshToken })
      .expect(201);
    expect(refreshed.body.sessionId).toBe(opened.body.sessionId);
    // The refresh token is replaced: the old one is refused.
    await client.http
      .post('/api/sessions/refresh')
      .set('x-device-token', token)
      .send({ refreshToken: opened.body.refreshToken })
      .expect(401);
    await client.http
      .post('/api/sessions/current/end')
      .set('authorization', bearer(refreshed.body.accessToken))
      .send({ reason: 'locked' })
      .expect(201);
    const after = await client.http
      .get('/api/me')
      .set('authorization', bearer(refreshed.body.accessToken))
      .expect(401);
    expect(after.body.code).toBe('SESSION_ENDED');

    // A signature by another key, and a replayed nonce, are refused.
    const stranger = newKeys();
    const forged = await client.openSession(owner.device, owner.enrollmentId, stranger);
    expect(forged.body.code).toBe('SIGNATURE_INVALID');
  });

  it('refuses a replayed device nonce, a wrong signature, an unknown device and a wrong tenant hint', async () => {
    const { tenantId, owner } = await client.clinic();
    const device = owner.device;
    const challenge = async () =>
      (
        await client.http
          .post('/api/devices/token/challenge')
          .send({ tenantId, deviceId: device.id })
          .expect(201)
      ).body.nonce as string;
    const token = (nonce: string, signature: string, deviceTenant = tenantId) =>
      client.http.post('/api/devices/token').send({
        tenantId: deviceTenant,
        deviceId: device.id,
        nonce,
        signature,
        appVersion: '0.1.0',
      });
    const nonce = await challenge();
    const signature = device.keys.sign(deviceTokenMessage(nonce, device.id));
    await token(nonce, signature).expect(201);
    expect((await token(nonce, signature)).body.code).toBe('SIGNATURE_INVALID');
    const other = await challenge();
    expect(
      (await token(other, newKeys().sign(deviceTokenMessage(other, device.id)))).body.code,
    ).toBe('SIGNATURE_INVALID');
    const elsewhere = await client.clinic();
    const hinted = (
      await client.http
        .post('/api/devices/token/challenge')
        .send({ tenantId: elsewhere.tenantId, deviceId: device.id })
        .expect(201)
    ).body.nonce as string;
    const misdirected = await token(
      hinted,
      device.keys.sign(deviceTokenMessage(hinted, device.id)),
      elsewhere.tenantId,
    );
    expect(misdirected.body.code).toBe('DEVICE_UNKNOWN');
  });

  it('signs an enrolled member in without an OTP on their computer, and replaces a forgotten PIN', async () => {
    const { owner, phone } = await client.clinic({ branch: true });
    const address = newAddress();
    const signedIn = await client.http
      .post('/api/auth/sign-in')
      .set('x-forwarded-for', address)
      .set('x-device-token', await client.deviceToken(owner.device))
      .send({ phone, password: PASSWORD, proofOfWork: await client.proofOfWork(address) })
      .expect(201);
    expect(signedIn.body.step).toBe('done');
    // A ticket of this computer registers nothing elsewhere (rule 18 needs an OTP).
    await client.http
      .get('/api/auth/registration-options')
      .set('x-sign-in-ticket', signedIn.body.ticket)
      .expect(401);
    const replaced = await client.enroll(owner.device, signedIn.body.ticket);
    expect(replaced.enrollmentId).not.toBe(owner.enrollmentId);
    const old = await client.http
      .get('/api/me')
      .set('authorization', bearer(owner.accessToken))
      .expect(401);
    expect(old.body.code).toBe('SESSION_ENDED');
    const reopened = await client.openSession(owner.device, owner.enrollmentId, owner.userKeys);
    expect(reopened.body.code).toBe('ENROLLMENT_REVOKED');
  });
});

describe('tickets', () => {
  it('are used once, and a refused password does not use one up', async () => {
    const { tenantId } = await client.clinic();
    const phone = await client.invite(tenantId, { roles: ['reception'] });
    const address = newAddress();
    const requested = await client.http
      .post('/api/auth/otp/request')
      .set('x-forwarded-for', address)
      .send({ phone, purpose: 'first_sign_in', proofOfWork: await client.proofOfWork(address) })
      .expect(201);
    const verified = await client.http
      .post('/api/auth/otp/verify')
      .set('x-forwarded-for', address)
      .send({ challengeId: requested.body.challengeId, code: await client.lastCode(phone) })
      .expect(201);
    expect(verified.body).toMatchObject({
      needsPassword: true,
      needsName: true,
      suggestedName: 'موظف تجريبي',
    });
    const set = (password: string, name?: string) =>
      client.http
        .post('/api/auth/password')
        .set('x-sign-in-ticket', verified.body.ticket)
        .send({ password, name });
    expect((await set('password1234', 'موظف')).body.code).toBe('PASSWORD_TOO_WEAK');
    expect((await set(`clinic${phone.slice(-7)}x`, 'موظف')).body.code).toBe('PASSWORD_TOO_WEAK');
    expect((await set(PASSWORD)).body.code).toBe('VALIDATION_FAILED');
    await set(PASSWORD, 'موظف').expect(201);
    expect((await set(PASSWORD, 'موظف')).body.code).toBe('TICKET_INVALID');
    const membership = await client.membershipId(tenantId, phone);
    const [row] = await withTenant(client.db, tenantId, (tx) =>
      tx.select().from(staffMemberships).where(eq(staffMemberships.id, membership)),
    );
    expect(row?.status).toBe('active');
  });
});

describe('account enumeration', () => {
  it('answers an unknown phone like a known one: OTP requests, attempts and sign-in locks', async () => {
    const { tenantId } = await client.clinic();
    const known = await client.invite(tenantId, { roles: ['nurse'] });
    const unknown = newPhone();
    for (const phone of [known, unknown]) {
      const address = newAddress();
      const requested = await client.http
        .post('/api/auth/otp/request')
        .set('x-forwarded-for', address)
        .send({ phone, purpose: 'first_sign_in', proofOfWork: await client.proofOfWork(address) })
        .expect(201);
      const codes: string[] = [];
      for (let attempt = 0; attempt <= otpPolicy.maxAttempts; attempt += 1) {
        const response = await client.http
          .post('/api/auth/otp/verify')
          .set('x-forwarded-for', address)
          .send({ challengeId: requested.body.challengeId, code: '000000' });
        codes.push(response.body.code);
      }
      // The real code is never 000000 in this test's luck only once in a million.
      expect(codes.slice(0, otpPolicy.maxAttempts).every((code) => code === 'OTP_INVALID')).toBe(
        true,
      );
      expect(codes.at(-1)).toBe('OTP_ATTEMPTS_EXCEEDED');
      const resent = await client.http
        .post('/api/auth/otp/resend')
        .set('x-forwarded-for', address)
        .send({ challengeId: requested.body.challengeId });
      expect(resent.body.code).toBe('OTP_COOLDOWN');
    }
    const ticketless = await client.http.post('/api/auth/password').send({ password: PASSWORD });
    expect(ticketless.body.code).toBe('TICKET_INVALID');

    // Sign-in: an invited phone without a password and an unknown phone lock alike.
    for (const phone of [known, unknown]) {
      const codes: string[] = [];
      for (let attempt = 0; attempt <= 5; attempt += 1) {
        const address = newAddress();
        const response = await client.http
          .post('/api/auth/sign-in')
          .set('x-forwarded-for', address)
          .send({ phone, password: PASSWORD, proofOfWork: await client.proofOfWork(address) });
        codes.push(response.body.code);
      }
      expect(codes).toEqual([...Array(5).fill('INVALID_CREDENTIALS'), 'RATE_LIMITED']);
    }
  });

  it('locks a known account after five wrong passwords, and audits the lock', async () => {
    const { phone } = await client.clinic();
    const codes: string[] = [];
    for (let attempt = 0; attempt <= 5; attempt += 1) {
      const address = newAddress();
      const response = await client.http
        .post('/api/auth/sign-in')
        .set('x-forwarded-for', address)
        .send({
          phone,
          password: 'not the password at all',
          proofOfWork: await client.proofOfWork(address),
        });
      codes.push(response.body.code);
    }
    expect(codes).toEqual([...Array(5).fill('INVALID_CREDENTIALS'), 'RATE_LIMITED']);
    const [account] = await client.db.select().from(accounts).where(eq(accounts.phone, phone));
    const audit = await client.db
      .select()
      .from(platformAuditEntries)
      .where(eq(platformAuditEntries.entityId, account?.id ?? ''));
    expect(audit.map((row) => row.action)).toContain('account.sign_in_locked');
  });

  it('gives concurrent guesses no more than five tries, whether the phone has an account or not', async () => {
    const { tenantId, phone } = await client.clinic();
    const invited = await client.invite(tenantId, { roles: ['nurse'] });
    for (const target of [phone, invited, newPhone()]) {
      const attempts = await Promise.all(
        Array.from({ length: 9 }, async () => {
          const address = newAddress();
          const proofOfWork = await client.proofOfWork(address);
          return client.http
            .post('/api/auth/sign-in')
            .set('x-forwarded-for', address)
            .send({ phone: target, password: 'not the password at all', proofOfWork });
        }),
      );
      const codes = attempts.map((response) => response.body.code);
      expect(codes.filter((code) => code === 'INVALID_CREDENTIALS')).toHaveLength(5);
      expect(codes.filter((code) => code === 'RATE_LIMITED')).toHaveLength(4);
    }
  });

  it('answers alike when sending fails: request, verify and resend; sign-in says so', async () => {
    const { tenantId, phone } = await client.clinic();
    const invited = await client.invite(tenantId, { roles: ['reception'] });
    const sender = app.get<FakeOtpSender>(OTP_SENDER);
    const failing = vi.spyOn(sender, 'send').mockRejectedValue(new Error('Synthetic outage'));
    try {
      for (const target of [invited, newPhone()]) {
        const address = newAddress();
        const requested = await client.http
          .post('/api/auth/otp/request')
          .set('x-forwarded-for', address)
          .send({
            phone: target,
            purpose: 'first_sign_in',
            proofOfWork: await client.proofOfWork(address),
          })
          .expect(201);
        const verified = await client.http
          .post('/api/auth/otp/verify')
          .set('x-forwarded-for', address)
          .send({ challengeId: requested.body.challengeId, code: '000000' });
        expect(verified.body.code).toBe('OTP_INVALID');
        const resent = await client.http
          .post('/api/auth/otp/resend')
          .set('x-forwarded-for', address)
          .send({ challengeId: requested.body.challengeId });
        expect(resent.body.code).toBe('OTP_COOLDOWN');
      }
      // The resend after the cooldown, through the service's clock.
      await client.forgetOtps(invited);
      const [account] = await client.db.select().from(accounts).where(eq(accounts.phone, invited));
      let now = Date.now();
      const otps = new OtpChallenges(client.db, app.get(KeyedHash), sender, () => now);
      const first = await otps.start(
        { id: account?.id ?? '', phone: invited },
        'first_sign_in',
        'RATE_LIMITED',
        { quietFailure: true },
      );
      now += 61_000;
      const decoy = otps.startDecoy('synthetic-phone-key', 'first_sign_in', 'RATE_LIMITED');
      now += 61_000;
      expect(await otps.resend(first)).toMatch(/^[0-9a-f-]{36}$/);
      expect(await otps.resend(decoy)).toMatch(/^[0-9a-f-]{36}$/);

      await client.forgetOtps(phone);
      const address = newAddress();
      const signedIn = await client.http
        .post('/api/auth/sign-in')
        .set('x-forwarded-for', address)
        .send({ phone, password: PASSWORD, proofOfWork: await client.proofOfWork(address) });
      expect(signedIn.body.code).toBe('OTP_DELIVERY_UNAVAILABLE');
    } finally {
      failing.mockRestore();
    }
  });

  it('answers a forgotten challenge as an expired one, whoever the phone was', async () => {
    const response = await client.http
      .post('/api/auth/otp/verify')
      .set('x-forwarded-for', newAddress())
      .send({ challengeId: '01a00000-0000-7000-8000-000000000000', code: '123456' });
    expect(response.body.code).toBe('OTP_EXPIRED');
  });
});

describe('device token challenges', () => {
  it('are never limited per device id, so no one can lock a computer out', async () => {
    const { tenantId, owner } = await client.clinic();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await client.http
        .post('/api/devices/token/challenge')
        .set('x-forwarded-for', newAddress())
        .send({ tenantId, deviceId: owner.device.id })
        .expect(201);
    }
    await client.deviceToken(owner.device);
  });
});

describe('proof of work and rate limits', () => {
  it('counts leading zero bits and refuses a reused or wrong solution', async () => {
    expect(leadingZeroBits(Buffer.from([0, 0x0f, 0xff]))).toBe(12);
    expect(leadingZeroBits(Buffer.from([0x80]))).toBe(0);
    const address = newAddress();
    const proof = await client.proofOfWork(address);
    const signIn = (proofOfWork: { challenge: string; nonce: string }) =>
      client.http
        .post('/api/auth/sign-in')
        .set('x-forwarded-for', address)
        .send({ phone: newPhone(), password: PASSWORD, proofOfWork });
    expect((await signIn(proof)).body.code).toBe('INVALID_CREDENTIALS');
    expect((await signIn(proof)).body.code).toBe('POW_INVALID');
    const fresh = await client.proofOfWork(address);
    let wrong = 0;
    while (solves(fresh.challenge, String(wrong), 4)) wrong += 1;
    expect((await signIn({ ...fresh, nonce: String(wrong) })).body.code).toBe('POW_INVALID');
    const last = fresh.challenge.at(-1) === 'A' ? 'B' : 'A';
    const tampered = `${fresh.challenge.slice(0, -1)}${last}`;
    expect((await signIn({ challenge: tampered, nonce: fresh.nonce })).body.code).toBe(
      'POW_INVALID',
    );
  });

  it('limits sign-ins and OTP requests to 30 per 10 minutes per address', async () => {
    const address = newAddress();
    const codes: string[] = [];
    for (let attempt = 0; attempt <= 30; attempt += 1) {
      const response = await client.http
        .post('/api/auth/otp/request')
        .set('x-forwarded-for', address)
        .send({
          phone: newPhone(),
          purpose: 'first_sign_in',
          proofOfWork: { challenge: 'x', nonce: '1' },
        });
      codes.push(response.body.code);
    }
    expect(codes.slice(0, 30).every((code) => code === 'POW_INVALID')).toBe(true);
    expect(codes.at(-1)).toBe('RATE_LIMITED');
  });
});

describe('OTP challenges', () => {
  it('expire after 5 minutes, wait 60 seconds between sends, allow 3 an hour, and store a hash only', async () => {
    const { tenantId } = await client.clinic();
    const phone = await client.invite(tenantId, { roles: ['accountant'] });
    const [account] = await client.db.select().from(accounts).where(eq(accounts.phone, phone));
    const sender = app.get<FakeOtpSender>(OTP_SENDER);
    let now = Date.now();
    const otps = new OtpChallenges(client.db, app.get(KeyedHash), sender, () => now);
    const target = { id: account?.id ?? '', phone };
    const first = await otps.start(target, 'first_sign_in', 'RATE_LIMITED');
    const code = sender.lastCode(target.id) ?? '';
    const [stored] = await client.db
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.id, first));
    expect(stored?.codeHash).not.toContain(code);
    expect(stored?.codeHash).toHaveLength(43);
    expect(await refusal(otps.resend(first))).toBe('OTP_COOLDOWN');
    now += 61_000;
    const second = await otps.resend(first);
    expect(await refusal(otps.verify(first, code))).toBe('OTP_EXPIRED');
    now += 61_000;
    await otps.start(target, 'first_sign_in', 'RATE_LIMITED');
    now += 61_000;
    expect(await refusal(otps.start(target, 'first_sign_in', 'RATE_LIMITED'))).toBe('RATE_LIMITED');
    now += 5 * 60_000;
    expect(await refusal(otps.verify(second, sender.lastCode(target.id) ?? ''))).toBe(
      'OTP_EXPIRED',
    );
    now += 60 * 60_000;
    const later = await otps.start(target, 'first_sign_in', 'RATE_LIMITED');
    expect(await otps.verify(later, sender.lastCode(target.id) ?? '')).toEqual({
      accountId: target.id,
      purpose: 'first_sign_in',
    });
    expect(await refusal(otps.verify(later, sender.lastCode(target.id) ?? ''))).toBe('OTP_INVALID');
  });
});

describe('registration options and branch scope', () => {
  it('offer the branches where the member holds devices.manage, and recheck every choice', async () => {
    const { tenantId, owner, branchId } = await client.clinic({ branch: true });
    const second = await client.addBranch(owner);
    const phone = await client.invite(tenantId, {
      roles: ['reception'],
      facilityIds: [second],
      granted: ['devices.manage'],
    });
    const ticket = await client.firstSignIn(phone);
    const options = await client.http
      .get('/api/auth/registration-options')
      .set('x-sign-in-ticket', ticket)
      .expect(200);
    expect(options.body.clinics).toEqual([
      expect.objectContaining({
        tenantId,
        roles: ['reception'],
        branches: [{ id: second, name: 'الفرع الرئيسي' }],
      }),
    ]);
    const register = (facilityId: string | null) =>
      client.http.post('/api/devices').set('x-sign-in-ticket', ticket).send({
        tenantId,
        facilityId,
        name: 'جهاز تجريبي',
        publicKey: newKeys().publicKey,
        os: 'Windows 11',
        appVersion: '0.1.0',
        userPublicKey: newKeys().publicKey,
      });
    expect((await register(branchId)).body.code).toBe('FORBIDDEN');
    expect((await register(null)).body.code).toBe('FORBIDDEN');
    expect((await register(second)).status).toBe(201);
    // The ticket was used by the registration.
    expect((await register(second)).body.code).toBe('TICKET_INVALID');

    // A member of another branch never enrolls on this branch's computer.
    const outside = await client.invite(tenantId, { roles: ['nurse'], facilityIds: [second] });
    const enrolled = await client.http
      .post('/api/devices/current/enrollments')
      .set('x-device-token', await client.deviceToken(owner.device))
      .set('x-sign-in-ticket', await client.firstSignIn(outside))
      .send({ userPublicKey: newKeys().publicKey });
    expect(enrolled.body.code).toBe('BRANCH_NOT_IN_SCOPE');
  });

  it('refuse a member without devices.manage, and a second registration with the same key', async () => {
    const { tenantId, owner, branchId, phone } = await client.clinic({ branch: true });
    const reception = await client.invite(tenantId, { roles: ['reception'] });
    const ticket = await client.firstSignIn(reception);
    const options = await client.http
      .get('/api/auth/registration-options')
      .set('x-sign-in-ticket', ticket)
      .expect(200);
    expect(options.body.clinics).toEqual([]);
    await expect(
      client.register(await client.signIn(phone), tenantId, branchId, owner.device.keys),
    ).rejects.toThrow();
    const again = await client.http
      .post('/api/devices')
      .set('x-sign-in-ticket', await client.signIn(phone))
      .send({
        tenantId,
        facilityId: branchId,
        name: 'جهاز تجريبي',
        publicKey: owner.device.keys.publicKey,
        os: 'Windows 11',
        appVersion: '0.1.0',
        userPublicKey: newKeys().publicKey,
      });
    expect(again.body.code).toBe('CONFLICT');
  });
});

describe('revocation, deactivation and tenant status', () => {
  it('stops a revoked device at once, lets it confirm its wipe, then refuses its tokens', async () => {
    const { tenantId, owner } = await client.clinic({ branch: true });
    const token = await client.deviceToken(owner.device);
    await withTenant(client.db, tenantId, (tx) =>
      tx
        .update(devices)
        .set({ status: 'revoked', revokedAt: new Date() })
        .where(eq(devices.id, owner.device.id)),
    );
    const me = await client.http.get('/api/me').set('authorization', bearer(owner.accessToken));
    expect(me.body.code).toBe('DEVICE_REVOKED');
    const current = await client.http.get('/api/devices/current').set('x-device-token', token);
    expect(current.body.code).toBe('DEVICE_REVOKED');
    const wipeToken = await client.deviceToken(owner.device);
    const wiped = await client.http
      .post('/api/devices/current/wiped')
      .set('x-device-token', wipeToken)
      .expect(201);
    expect(wiped.body.wipedAt).not.toBeNull();
    await expect(client.deviceToken(owner.device)).rejects.toThrow();

    // S01 rule 7: a branch with an active device is never archived; a revoked one does not count.
    const other = await client.clinic({ branch: true });
    await client.addBranch(other.owner);
    const archived = await client.http
      .post(`/api/facilities/${other.branchId}/archive`)
      .set('authorization', bearer(other.owner.accessToken));
    expect(archived.body.code).toBe('FACILITY_HAS_DEVICES');
  });

  it('refuses a deactivated member at once and ends their session on refresh', async () => {
    const { tenantId, owner } = await client.clinic({ branch: true });
    const nurse = await client.member(tenantId, owner.device, { roles: ['nurse'] });
    await client.http.get('/api/me').set('authorization', bearer(nurse.accessToken)).expect(200);
    await withTenant(client.db, tenantId, (tx) =>
      tx
        .update(staffMemberships)
        .set({ status: 'deactivated', deactivatedAt: new Date() })
        .where(eq(staffMemberships.id, nurse.membershipId)),
    );
    const me = await client.http.get('/api/me').set('authorization', bearer(nurse.accessToken));
    expect(me.body.code).toBe('MEMBERSHIP_INACTIVE');
    const refreshed = await client.http
      .post('/api/sessions/refresh')
      .set('x-device-token', await client.deviceToken(owner.device))
      .send({ refreshToken: nurse.refreshToken });
    expect(refreshed.body.code).toBe('MEMBERSHIP_INACTIVE');
    const [session] = await withTenant(client.db, tenantId, (tx) =>
      tx.select().from(staffSessions).where(eq(staffSessions.id, nurse.sessionId)),
    );
    expect(session?.endReason).toBe('member_deactivated');
  });

  it('lets only owners in while the clinic is closed, and everyone while suspended', async () => {
    const { tenantId, owner } = await client.clinic({ branch: true });
    const nurse = await client.member(tenantId, owner.device, { roles: ['nurse'] });
    const setStatus = (status: 'suspended' | 'closed') =>
      client.db
        .update(tenants)
        .set({ status, statusReason: 'other', archivedAt: status === 'closed' ? new Date() : null })
        .where(eq(tenants.id, tenantId));
    await setStatus('suspended');
    await client.http.get('/api/me').set('authorization', bearer(nurse.accessToken)).expect(200);
    await setStatus('closed');
    const refused = await client.http
      .get('/api/me')
      .set('authorization', bearer(nurse.accessToken));
    expect(refused.body.code).toBe('TENANT_CLOSED');
    await client.http.get('/api/me').set('authorization', bearer(owner.accessToken)).expect(200);
  });
});

describe('password reset and phone change by Vertex support (CLI)', () => {
  async function run(...argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runAccountCommand(argv, app.get(AuthService), {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('authorizes a reset whose new password ends the sessions in every clinic', async () => {
    const first = await client.clinic({ branch: true });
    // The same person also works in a second clinic.
    const second = await client.clinic({ branch: true });
    const [account] = await client.db
      .select()
      .from(accounts)
      .where(eq(accounts.phone, first.phone));
    await withTenant(client.db, second.tenantId, (tx) =>
      inviteFirstOwner(tx, {
        tenantId: second.tenantId,
        accountId: account?.id ?? '',
        invitedName: 'مالك تجريبي',
        actor: SYSTEM,
      }),
    );
    // Signing in accepts the invitation; the person enrolls on the second clinic's computer.
    const elsewhere = await client.enroll(second.owner.device, await client.signIn(first.phone));

    expect(
      (
        await run(
          'account:authorize-password-reset',
          '--phone',
          newPhone(),
          '--reason',
          'identity checked',
        )
      ).code,
    ).toBe(1);
    const authorized = await run(
      'account:authorize-password-reset',
      '--phone',
      first.phone,
      '--reason',
      'identity checked',
    );
    expect(authorized.code).toBe(0);
    await client.forgetOtps(first.phone);
    const address = newAddress();
    const requested = await client.http
      .post('/api/auth/otp/request')
      .set('x-forwarded-for', address)
      .send({
        phone: first.phone,
        purpose: 'password_reset',
        proofOfWork: await client.proofOfWork(address),
      })
      .expect(201);
    const verified = await client.http
      .post('/api/auth/otp/verify')
      .set('x-forwarded-for', address)
      .send({ challengeId: requested.body.challengeId, code: await client.lastCode(first.phone) })
      .expect(201);
    expect(verified.body).toMatchObject({ needsPassword: true, needsName: false });
    // The old password keeps working until it is replaced (rule 16).
    await client.signIn(first.phone);
    await client.http
      .post('/api/auth/password')
      .set('x-sign-in-ticket', verified.body.ticket)
      .send({ password: 'a new synthetic passphrase' })
      .expect(201);
    for (const session of [first.owner, elsewhere]) {
      const me = await client.http.get('/api/me').set('authorization', bearer(session.accessToken));
      expect(me.body.code).toBe('SESSION_ENDED');
    }
    await client.signIn(first.phone, 'a new synthetic passphrase');

    const tenantAudit = await withTenant(client.db, first.tenantId, (tx) =>
      tx
        .select()
        .from(auditEntries)
        .where(
          and(
            eq(auditEntries.action, 'account.password_reset_authorized'),
            eq(auditEntries.entityId, account?.id ?? ''),
          ),
        ),
    );
    expect(tenantAudit).toHaveLength(1);
  });

  it('changes a phone, refusing one already in use', async () => {
    const a = await client.clinic();
    const b = await client.clinic();
    const taken = await run(
      'account:change-phone',
      '--phone',
      a.phone,
      '--new-phone',
      b.phone,
      '--reason',
      'new SIM',
    );
    expect(taken).toMatchObject({ code: 1, err: expect.stringContaining('ALREADY_MEMBER') });
    const fresh = newPhone();
    const changed = await run(
      'account:change-phone',
      '--phone',
      a.phone,
      '--new-phone',
      fresh,
      '--reason',
      'new SIM',
    );
    expect(changed.code).toBe(0);
    await client.signIn(fresh);
    // Enrollments keep working (edge case 13).
    await client.http.get('/api/me').set('authorization', bearer(a.owner.accessToken)).expect(200);
  });
});

describe('the JWKS', () => {
  it('publishes the Ed25519 key that signs access tokens', async () => {
    const response = await client.http.get('/api/.well-known/jwks.json').expect(200);
    expect(response.body.keys).toEqual([
      expect.objectContaining({ kty: 'OKP', crv: 'Ed25519', alg: 'EdDSA', use: 'sig' }),
    ]);
  });
});
