import { deviceTokenMessage } from '@vertex-shifa/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeviceEvent, PreparedKeys } from './bridge.js';
import { DeviceError, Installation } from './installation.js';
import { ServerRefusal, type Transport } from './server.js';
import {
  memoryStore,
  testPinCost,
  testProtector,
  testServer,
  verifySignature,
} from './test-support.js';

// Synthetic ids and phones only.
const clinicA = '0199f000-0000-7000-8000-00000000a001';
const clinicB = '0199f000-0000-7000-8000-00000000b001';
const ownerPhone = '+963900000101';
const receptionistPhone = '+963900000102';
const ownerPin = '258147';
const receptionistPin = '369258';
const DAY = 24 * 60 * 60 * 1000;
const start = Date.parse('2026-10-18T09:00:00.000Z');

describe('Installation', () => {
  let clock: number;
  /** The server's clock against this computer's. */
  let serverSkew: number;
  let monotonic: number;
  let store: ReturnType<typeof memoryStore>;
  let server: ReturnType<typeof testServer>;
  let transport: Transport;
  let events: DeviceEvent[];
  let installation: Installation;
  let owner: ReturnType<ReturnType<typeof testServer>['addAccount']>;
  let receptionist: ReturnType<ReturnType<typeof testServer>['addAccount']>;
  const protector = testProtector();
  const open = () =>
    new Installation(store, protector, () => new Date(clock), testPinCost, {
      server: (request) => transport(request),
      appInfo: { os: 'win32 10.0', appVersion: '0.0.0' },
      monotonic: () => monotonic,
      onEvent: (event) => events.push(event),
    });

  beforeEach(() => {
    clock = start;
    serverSkew = 0;
    monotonic = 1_000;
    store = memoryStore();
    server = testServer(() => clock + serverSkew);
    transport = server.transport;
    events = [];
    owner = server.addAccount({
      phone: ownerPhone,
      password: 'synthetic-owner-pass',
      name: 'مالك تجريبي',
      roles: ['owner'],
    });
    receptionist = server.addAccount({
      phone: receptionistPhone,
      password: 'synthetic-reception-pass',
      name: 'موظف استقبال',
      roles: ['reception'],
    });
    installation = open();
  });

  /** Moves both clocks, as time passing does. */
  const pass = (ms: number) => {
    clock += ms;
    monotonic += ms;
  };

  async function register(tenantId = clinicA): Promise<PreparedKeys & { deviceId: string }> {
    const keys = await installation.calls.prepareKeys({
      tenantId,
      phone: ownerPhone,
      pin: ownerPin,
    });
    const { view } = await installation.calls.register({
      pendingId: keys.pendingId,
      ticket: server.ticket(owner),
      facilityId: null,
      deviceName: 'حاسوب الاستقبال',
      clinicName: 'عيادة تجريبية',
      clinicNameLatin: null,
      facilityName: null,
      memberName: 'مالك تجريبي',
      roles: ['owner'],
    });
    return { ...keys, deviceId: view.currentDeviceId ?? '' };
  }

  async function enrollReceptionist(pin = receptionistPin): Promise<string> {
    const deviceId = (await installation.calls.view(null)).currentDeviceId ?? '';
    const keys = await installation.calls.prepareKeys({ deviceId, phone: receptionistPhone, pin });
    const { view } = await installation.calls.enroll({
      pendingId: keys.pendingId,
      ticket: server.ticket(receptionist),
      memberName: 'موظف استقبال',
    });
    return view.unlocked?.enrollmentId ?? '';
  }

  const ownerOf = async () => {
    const view = await installation.calls.view(null);
    const registration = view.registrations.find((item) => item.deviceId === view.currentDeviceId);
    const member = registration?.members.find((item) => item.membershipId === owner.membershipId);
    return {
      deviceId: registration?.deviceId ?? '',
      tenantId: registration?.tenantId ?? '',
      enrollmentId: member?.enrollmentId ?? '',
    };
  };

  const code = (work: Promise<unknown>) =>
    work.then(
      () => 'resolved',
      (error: unknown) =>
        error instanceof DeviceError || error instanceof ServerRefusal ? error.code : 'other',
    );

  it('registers a computer through its own request, with the member unlocked', async () => {
    const keys = await register();
    const view = await installation.calls.view(null);
    expect(view.unlocked?.deviceId).toBe(keys.deviceId);
    expect(view.registrations).toMatchObject([
      { deviceId: keys.deviceId, tenantId: clinicA, status: 'active', idleLockMinutes: 15 },
    ]);
    // The ids, the key and the confirmation are the API's answer to the main process.
    expect(server.devices[0]?.publicKey).toBe(keys.devicePublicKey);
    expect(server.enrollments[0]?.publicKey).toBe(keys.userPublicKey);

    const deviceSignature = await installation.calls.signDeviceToken({
      deviceId: keys.deviceId,
      nonce: 'n1',
    });
    expect(
      verifySignature(
        keys.devicePublicKey ?? '',
        deviceTokenMessage('n1', keys.deviceId),
        deviceSignature,
      ),
    ).toBe(true);
  });

  it('gives the renderer the access token only, never the refresh token (F05)', async () => {
    await register();
    const current = await installation.calls.session(null);
    const issued = server.sessions[0]?.tokens;
    expect(current?.access).toEqual({
      sessionId: issued?.sessionId,
      accessToken: issued?.accessToken,
      accessTokenExpiresAt: issued?.accessTokenExpiresAt,
    });
    expect(JSON.stringify(current)).not.toContain(issued?.refreshToken ?? 'refresh-');

    // The main process refreshes with the refresh token it keeps.
    const ids = await ownerOf();
    const next = await installation.calls.refreshSession({
      ...ids,
      sessionId: issued?.sessionId ?? '',
    });
    expect(next.sessionId).toBe(server.sessions[1]?.tokens.sessionId);
    expect(JSON.stringify(next)).not.toContain('refresh-');
    expect(server.sessions[0]?.ended).toBe(true);
    // The spent session can no longer be refreshed.
    expect(
      await code(installation.calls.refreshSession({ ...ids, sessionId: issued?.sessionId ?? '' })),
    ).toBe('NOT_UNLOCKED');
  });

  it('forgets a refused refresh token, so the next request opens a new session', async () => {
    await register();
    const ids = await ownerOf();
    const sessionId = server.sessions[0]?.tokens.sessionId ?? '';
    server.refuse('/api/sessions/refresh', 'SESSION_ENDED');
    expect(await code(installation.calls.refreshSession({ ...ids, sessionId }))).toBe(
      'SESSION_ENDED',
    );
    expect((await installation.calls.session(null))?.access).toBeNull();
  });

  it('refuses a registration the API refused, and forgets its keys', async () => {
    const keys = await installation.calls.prepareKeys({
      tenantId: clinicA,
      phone: ownerPhone,
      pin: ownerPin,
    });
    const input = {
      pendingId: keys.pendingId,
      ticket: 'ticket-forged',
      facilityId: null,
      deviceName: 'حاسوب الاستقبال',
      clinicName: 'عيادة تجريبية',
      clinicNameLatin: null,
      facilityName: null,
      memberName: 'مالك تجريبي',
      roles: ['owner' as const],
    };
    expect(await code(installation.calls.register(input))).toBe('TICKET_INVALID');
    expect(
      await code(installation.calls.register({ ...input, ticket: server.ticket(owner) })),
    ).toBe('NOT_FOUND');
    expect((await installation.calls.view(null)).registrations).toEqual([]);
  });

  it('refuses an answer that does not parse as the API’s (a forged or broken answer)', async () => {
    await register();
    await installation.calls.lock(null);
    const ids = await ownerOf();
    await installation.calls.unlock({ ...ids, pin: ownerPin });
    transport = async (request) => {
      if (request.path === '/api/sessions') {
        return { status: 200, body: { sessionId: 'not-a-uuid', accessToken: 'forged' } };
      }
      return server.transport(request);
    };
    expect(await code(installation.calls.openSession(ids))).toBe('INTERNAL_ERROR');
    expect((await installation.calls.session(null))?.access).toBeNull();
  });

  it('refuses trivial PINs and the phone’s last six digits (rule 21)', async () => {
    for (const pin of ['111111', '123456', '987654', '000101']) {
      expect(
        await code(installation.calls.prepareKeys({ tenantId: clinicA, phone: ownerPhone, pin })),
      ).toBe('PIN_WEAK');
    }
  });

  it('never holds two registrations to the same clinic (rule 19, edge case 14)', async () => {
    await register();
    expect(
      await code(
        installation.calls.prepareKeys({ tenantId: clinicA, phone: ownerPhone, pin: ownerPin }),
      ),
    ).toBe('ALREADY_REGISTERED');
  });

  it('keeps several clinics apart, and switching clinic locks the current one (rule 26)', async () => {
    const first = await register(clinicA);
    const second = await register(clinicB);
    expect(first.devicePublicKey).not.toBe(second.devicePublicKey);
    let view = await installation.calls.view(null);
    expect(view.registrations.map((item) => item.deviceId)).toEqual([
      first.deviceId,
      second.deviceId,
    ]);
    expect(view.unlocked?.deviceId).toBe(second.deviceId);

    view = await installation.calls.select({ deviceId: first.deviceId });
    expect(view.currentDeviceId).toBe(first.deviceId);
    expect(view.unlocked).toBeNull();
    expect(await installation.calls.session(null)).toBeNull();
  });

  it('unlocks with the right PIN and locks again', async () => {
    await register();
    await installation.calls.lock(null);
    const ids = await ownerOf();
    expect(await installation.calls.unlock({ ...ids, pin: ownerPin })).toEqual({
      result: 'unlocked',
      windowOpen: true,
    });
    expect((await installation.calls.view(null)).unlocked?.enrollmentId).toBe(ids.enrollmentId);
    const view = await installation.calls.lock(null);
    expect(view.unlocked).toBeNull();
  });

  it('disables the PIN after five wrong ones in a row, kept across restarts (rule 22)', async () => {
    await register();
    const receptionistEnrollment = await enrollReceptionist();
    await installation.calls.lock(null);
    const ids = await ownerOf();
    const attempt = (pin: string, enrollmentId = ids.enrollmentId) =>
      installation.calls.unlock({ deviceId: ids.deviceId, enrollmentId, pin });

    // A right PIN clears the count.
    for (let i = 0; i < 4; i += 1) await attempt('000000');
    expect((await attempt(ownerPin)).result).toBe('unlocked');
    await installation.calls.lock(null);

    for (let left = 4; left >= 1; left -= 1) {
      expect(await attempt('000000')).toEqual({ result: 'wrong_pin', attemptsLeft: left });
    }
    // The app restarts between the fourth and the fifth attempt: the count is on disk.
    installation = open();
    expect(await attempt('000000')).toEqual({ result: 'pin_disabled' });
    expect(await attempt(ownerPin)).toEqual({ result: 'pin_disabled' });
    const view = await installation.calls.view(null);
    expect(view.registrations[0]?.members).toMatchObject([
      { enrollmentId: ids.enrollmentId, pinDisabled: true, attemptsLeft: 0 },
      { enrollmentId: receptionistEnrollment, pinDisabled: false, attemptsLeft: 5 },
    ]);
    // Other members keep working.
    expect((await attempt(receptionistPin, receptionistEnrollment)).result).toBe('unlocked');
    await installation.calls.lock(null);

    // Re-enabled only by the server's answer to the main process's own password sign-in.
    const reenable = (password: string) =>
      installation.calls.reenablePin({
        deviceId: ids.deviceId,
        enrollmentId: ids.enrollmentId,
        password,
      });
    expect(await code(reenable('wrong-password'))).toBe('INVALID_CREDENTIALS');
    server.reachable = false;
    expect(await code(reenable('synthetic-owner-pass'))).toBe('NETWORK_ERROR');
    server.reachable = true;
    expect(await attempt(ownerPin)).toEqual({ result: 'pin_disabled' });
    const reenabled = await reenable('synthetic-owner-pass');
    expect(reenabled.result).toBe('reenabled');
    // The sign-in used the phone stored for the member, never one from the renderer.
    const signIn = server.requests.findLast((request) => request.path === '/api/auth/sign-in');
    expect(signIn?.body).toMatchObject({ phone: ownerPhone });
    expect((await attempt(ownerPin)).result).toBe('unlocked');
  });

  it('never re-enables a PIN for a sign-in the server does not finish on this device', async () => {
    await register();
    await installation.calls.lock(null);
    const ids = await ownerOf();
    for (let i = 0; i < 5; i += 1) await installation.calls.unlock({ ...ids, pin: '000000' });
    // The owner's enrollment here was revoked elsewhere: the server sends an OTP instead.
    for (const enrollment of server.enrollments)
      enrollment.revokedAt = new Date(clock).toISOString();
    const result = await installation.calls.reenablePin({
      deviceId: ids.deviceId,
      enrollmentId: ids.enrollmentId,
      password: 'synthetic-owner-pass',
    });
    expect(result.result).toBe('otp');
    expect((await installation.calls.view(null)).registrations[0]?.members[0]).toMatchObject({
      pinDisabled: true,
    });
  });

  it('counts parallel attempts one at a time', async () => {
    await register();
    await installation.calls.lock(null);
    const ids = await ownerOf();
    const results = await Promise.all(
      Array.from({ length: 7 }, () => installation.calls.unlock({ ...ids, pin: '000000' })),
    );
    expect(results.filter((result) => result.result === 'wrong_pin')).toHaveLength(4);
    expect(results.filter((result) => result.result === 'pin_disabled')).toHaveLength(3);
  });

  it('opens the offline window for 7 days; outside it only a session confirms (rule 24)', async () => {
    await register();
    const ids = await ownerOf();
    const member = async () => (await installation.calls.view(null)).registrations[0]?.members[0];
    pass(6 * DAY);
    expect(await member()).toMatchObject({ windowOpen: true });
    pass(DAY + 1);
    expect(await member()).toMatchObject({ windowOpen: false });
    await installation.calls.lock(null);
    expect(await installation.calls.unlock({ ...ids, pin: ownerPin })).toEqual({
      result: 'unlocked',
      windowOpen: false,
    });
    // Nobody is unlocked, and there is no session to use, until a session confirms the member.
    expect((await installation.calls.view(null)).unlocked).toBeNull();
    expect(await installation.calls.session(null)).toBeNull();
    server.reachable = false;
    expect(await code(installation.calls.openSession(ids))).toBe('NETWORK_ERROR');
    expect((await installation.calls.view(null)).unlocked).toBeNull();
    server.reachable = true;
    await installation.calls.openSession(ids);
    expect((await installation.calls.view(null)).unlocked?.enrollmentId).toBe(ids.enrollmentId);
    expect(await member()).toMatchObject({ windowOpen: true });
  });

  it('confirms the member with a session when this computer’s clock runs ahead (edge case 7)', async () => {
    serverSkew = -8 * DAY;
    await register();
    pass(8 * DAY);
    await installation.calls.lock(null);
    const ids = await ownerOf();
    expect(await installation.calls.unlock({ ...ids, pin: ownerPin })).toMatchObject({
      windowOpen: false,
    });
    await installation.calls.openSession(ids);
    expect((await installation.calls.view(null)).unlocked?.enrollmentId).toBe(ids.enrollmentId);
    await installation.checkWindow();
    expect(events).toEqual([]);
    // Confirmed for this unlock only: the stored confirmation keeps the server's time, so the next
    // unlock offline is outside the window, and the session's confirmation ends with the window.
    expect((await installation.calls.view(null)).registrations[0]?.members[0]?.windowOpen).toBe(
      false,
    );
    monotonic += 7 * DAY;
    await installation.checkWindow();
    expect(events).toEqual([{ type: 'locked' }]);
  });

  it('never stretches the window when the clock is set forward for a session (rule 24)', async () => {
    await register();
    // A year ahead, online: the session confirms the member, at the server's time.
    clock += 365 * DAY;
    await installation.calls.lock(null);
    const ids = await ownerOf();
    await installation.calls.unlock({ ...ids, pin: ownerPin });
    await installation.calls.openSession(ids);
    // The clock set back, offline: 8 days later the window is closed.
    clock -= 365 * DAY;
    pass(8 * DAY);
    await installation.calls.lock(null);
    const view = await installation.calls.view(null);
    expect(view.registrations[0]?.members[0]).toMatchObject({ windowOpen: false });
    expect(await installation.calls.unlock({ ...ids, pin: ownerPin })).toMatchObject({
      windowOpen: false,
    });
  });

  it('opens a session only for the member unlocked, never for a claimed one (F02)', async () => {
    await register();
    await enrollReceptionist();
    await installation.calls.lock(null);
    const ids = await ownerOf();
    // Nobody unlocked: a session for the owner is refused without asking the server.
    const before = server.requests.length;
    expect(await code(installation.calls.openSession(ids))).toBe('NOT_UNLOCKED');
    expect(server.requests.length).toBe(before);
    // Another clinic's id with this member, or this member on another clinic: refused too.
    await installation.calls.unlock({ ...ids, pin: ownerPin });
    expect(await code(installation.calls.openSession({ ...ids, tenantId: clinicB }))).toBe(
      'NOT_UNLOCKED',
    );
  });

  it('never stores a session for a member other than the one it was opened for', async () => {
    await register();
    const receptionistEnrollment = await enrollReceptionist();
    await installation.calls.lock(null);
    const ids = await ownerOf();
    await installation.calls.unlock({ ...ids, pin: ownerPin });
    // The receptionist unlocks while the owner's session is on its way.
    transport = async (request) => {
      if (request.path === '/api/sessions') {
        await installation.calls.unlock({
          deviceId: ids.deviceId,
          enrollmentId: receptionistEnrollment,
          pin: receptionistPin,
        });
      }
      return server.transport(request);
    };
    expect(await code(installation.calls.openSession(ids))).toBe('NOT_UNLOCKED');
    const current = await installation.calls.session(null);
    expect(current?.enrollmentId).toBe(receptionistEnrollment);
    expect(current?.access).toBeNull();
  });

  it('locks the member when the window passes during the session, and says so (F06)', async () => {
    await register();
    pass(7 * DAY - 60_000);
    await installation.checkWindow();
    expect((await installation.calls.view(null)).unlocked).not.toBeNull();
    pass(60_000);
    await installation.checkWindow();
    expect(events).toEqual([{ type: 'locked' }]);
    expect((await installation.calls.view(null)).unlocked).toBeNull();
    expect(await installation.calls.session(null)).toBeNull();
  });

  it('keeps the window’s clock running when the computer’s clock is set back (F06)', async () => {
    await register();
    // The clock goes back a year during the session; the monotonic clock goes on.
    clock -= 365 * DAY;
    monotonic += 7 * DAY;
    await installation.checkWindow();
    expect(events).toEqual([{ type: 'locked' }]);
  });

  it('forgets an unlock outside the window that no session confirmed in time', async () => {
    await register();
    pass(8 * DAY);
    await installation.calls.lock(null);
    const ids = await ownerOf();
    await installation.calls.unlock({ ...ids, pin: ownerPin });
    monotonic += 60_000;
    await installation.checkWindow();
    expect(events).toEqual([]);
    monotonic += 60_000;
    await installation.checkWindow();
    expect(events).toEqual([{ type: 'locked' }]);
    expect(await code(installation.calls.openSession(ids))).toBe('NOT_UNLOCKED');
  });

  it('never extends the window when the clock is set back, and warns (rule 24, edge case 7)', async () => {
    await register();
    pass(8 * DAY);
    expect((await installation.calls.view(null)).clockBehind).toBe(false);
    // The highest time seen survives a restart.
    installation = open();
    clock = start + 1 * DAY;
    const view = await installation.calls.view(null);
    expect(view.clockBehind).toBe(true);
    expect(view.registrations[0]?.members[0]).toMatchObject({ windowOpen: false });
  });

  it('reads the server’s confirmations itself, and a newer one reopens the window', async () => {
    await register();
    pass(8 * DAY);
    const ids = await ownerOf();
    expect((await installation.calls.view(null)).registrations[0]?.members[0]).toMatchObject({
      windowOpen: false,
    });
    // Confirmed again from another session on the server.
    const enrollment = server.enrollments.find((item) => item.id === ids.enrollmentId);
    if (enrollment) enrollment.lastConfirmedAt = new Date(clock).toISOString();
    const view = await installation.calls.refreshDevice({ deviceId: ids.deviceId });
    expect(view.registrations[0]).toMatchObject({ idleLockMinutes: 15 });
    expect(view.registrations[0]?.members[0]).toMatchObject({ windowOpen: true });
  });

  it('deletes the key of a member the server no longer lists on this computer', async () => {
    await register();
    const receptionistEnrollment = await enrollReceptionist();
    const ids = await ownerOf();
    const revoked = server.enrollments.find((item) => item.id === receptionistEnrollment);
    if (revoked) revoked.revokedAt = new Date(clock).toISOString();
    const view = await installation.calls.refreshDevice({ deviceId: ids.deviceId });
    expect(view.registrations[0]?.members.map((member) => member.enrollmentId)).toEqual([
      ids.enrollmentId,
    ]);
    // The receptionist was the one unlocked: locked out with their key.
    expect(view.unlocked).toBeNull();
  });

  it('wipes the registration itself when the API answers DEVICE_REVOKED', async () => {
    await register();
    const ids = await ownerOf();
    const device = server.devices[0];
    if (device) device.status = 'revoked';
    expect(await code(installation.calls.refreshDevice({ deviceId: ids.deviceId }))).toBe(
      'DEVICE_REVOKED',
    );
    const view = await installation.calls.view(null);
    expect(view.registrations[0]).toMatchObject({
      status: 'wiped',
      wipePending: true,
      members: [],
    });
    expect(view.unlocked).toBeNull();
  });

  it('replaces a member’s enrollment after a forgotten PIN (rule 22)', async () => {
    await register();
    const ids = await ownerOf();
    const keys = await installation.calls.prepareKeys({
      deviceId: ids.deviceId,
      phone: ownerPhone,
      pin: '741852',
    });
    const { view } = await installation.calls.enroll({
      pendingId: keys.pendingId,
      ticket: server.ticket(owner),
      memberName: 'مالك تجريبي',
    });
    const replaced = view.unlocked?.enrollmentId ?? '';
    expect(replaced).not.toBe(ids.enrollmentId);
    expect(view.registrations[0]?.members.map((member) => member.enrollmentId)).toEqual([replaced]);
    await installation.calls.lock(null);
    expect(
      (
        await installation.calls.unlock({
          deviceId: ids.deviceId,
          enrollmentId: replaced,
          pin: '741852',
        })
      ).result,
    ).toBe('unlocked');
  });

  it('changes the PIN on this computer, the current PIN counting as an attempt', async () => {
    await register();
    const ids = await ownerOf();
    const change = (currentPin: string, newPin: string) =>
      installation.calls.changePin({ ...ids, currentPin, newPin });
    expect(await code(change(ownerPin, '123456'))).toBe('PIN_WEAK');
    expect(await change('000000', '741852')).toEqual({ result: 'wrong_pin', attemptsLeft: 4 });
    expect(await change(ownerPin, '741852')).toEqual({ result: 'changed' });
    await installation.calls.lock(null);
    const unlock = (pin: string) => installation.calls.unlock({ ...ids, pin });
    expect((await unlock(ownerPin)).result).toBe('wrong_pin');
    expect((await unlock('741852')).result).toBe('unlocked');
  });

  it('wipes one registration, keeps its device key until the wipe is confirmed (rule 29)', async () => {
    const first = await register(clinicA);
    const second = await register(clinicB);
    await installation.calls.setLogo({
      deviceId: first.deviceId,
      logo: { contentType: 'image/png', data: 'AAAA' },
    });
    let view = await installation.calls.wipe({ deviceId: first.deviceId });
    const wiped = view.registrations.find((item) => item.deviceId === first.deviceId);
    expect(wiped).toMatchObject({ status: 'wiped', wipePending: true, members: [], logo: null });
    expect(wiped?.clinicName).toBe('عيادة تجريبية');
    // Clinic B is untouched, its member still unlocked.
    expect(view.registrations.find((item) => item.deviceId === second.deviceId)).toMatchObject({
      status: 'active',
    });
    expect(view.unlocked?.deviceId).toBe(second.deviceId);

    // The confirmation needs a device token.
    const sign = () => installation.calls.signDeviceToken({ deviceId: first.deviceId, nonce: 'n' });
    expect(await code(sign())).toBe('resolved');
    expect(await code(installation.calls.dismissWiped({ deviceId: first.deviceId }))).toBe(
      'INVALID_INPUT',
    );
    view = await installation.calls.wipeConfirmed({ deviceId: first.deviceId });
    expect(view.registrations.find((item) => item.deviceId === first.deviceId)?.wipePending).toBe(
      false,
    );
    expect(await code(sign())).toBe('NOT_FOUND');
    expect(store.text).not.toContain('AAAA');

    view = await installation.calls.dismissWiped({ deviceId: first.deviceId });
    expect(view.registrations.map((item) => item.deviceId)).toEqual([second.deviceId]);
  });

  it('can register the same clinic again after a wipe', async () => {
    const first = await register(clinicA);
    await installation.calls.wipe({ deviceId: first.deviceId });
    await installation.calls.wipeConfirmed({ deviceId: first.deviceId });
    const second = await register(clinicA);
    const view = await installation.calls.view(null);
    expect(view.registrations).toMatchObject([{ deviceId: second.deviceId, status: 'active' }]);
  });

  it('forgets keys the renderer discards', async () => {
    const keys = await installation.calls.prepareKeys({
      tenantId: clinicA,
      phone: ownerPhone,
      pin: ownerPin,
    });
    await installation.calls.discardKeys({ pendingId: keys.pendingId });
    expect(
      await code(
        installation.calls.register({
          pendingId: keys.pendingId,
          ticket: server.ticket(owner),
          facilityId: null,
          deviceName: 'حاسوب الاستقبال',
          clinicName: 'عيادة تجريبية',
          clinicNameLatin: null,
          facilityName: null,
          memberName: 'مالك تجريبي',
          roles: ['owner'],
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('stores no private key, PIN or token in the clear', async () => {
    await register();
    const stored = store.text ?? '';
    expect(stored).not.toContain(ownerPin);
    expect(stored).not.toContain('PRIVATE');
    expect(stored).not.toContain('refresh-');
    const parsed = JSON.parse(stored);
    // The device key and every user key are sealed by the protector.
    expect(() =>
      protector.decrypt(Buffer.from(parsed.registrations[0].deviceKey, 'base64')),
    ).not.toThrow();
    expect(() =>
      protector.decrypt(Buffer.from(parsed.registrations[0].members[0].wrappedKey, 'base64')),
    ).not.toThrow();
  });
});
