import {
  type CurrentDevice,
  deviceTokenMessage,
  type SessionTokens,
  staffSessionMessage,
} from '@vertex-shifa/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PreparedKeys } from './bridge.js';
import { DeviceError, Installation } from './installation.js';
import { memoryStore, testPinCost, testProtector, verifySignature } from './test-support.js';

// Synthetic ids and phones only.
const clinicA = '0199f000-0000-7000-8000-00000000a001';
const clinicB = '0199f000-0000-7000-8000-00000000b001';
const deviceA = '0199f000-0000-7000-8000-00000000a002';
const deviceB = '0199f000-0000-7000-8000-00000000b002';
const owner = {
  enrollmentId: '0199f000-0000-7000-8000-00000000a003',
  membershipId: '0199f000-0000-7000-8000-00000000a004',
};
const receptionist = {
  enrollmentId: '0199f000-0000-7000-8000-00000000a005',
  membershipId: '0199f000-0000-7000-8000-00000000a006',
};
const ownerPhone = '+963900000101';
const receptionistPhone = '+963900000102';
const DAY = 24 * 60 * 60 * 1000;
const start = Date.parse('2026-10-18T09:00:00.000Z');

function session(id = '0199f000-0000-7000-8000-00000000c001'): SessionTokens {
  return {
    sessionId: id,
    accessToken: 'access',
    accessTokenExpiresAt: new Date(start + 15 * 60_000).toISOString(),
    refreshToken: 'refresh',
    expiresAt: new Date(start + 12 * 60 * 60_000).toISOString(),
  };
}

describe('Installation', () => {
  let clock: number;
  let store: ReturnType<typeof memoryStore>;
  let installation: Installation;
  const protector = testProtector();
  const open = () => new Installation(store, protector, () => new Date(clock), testPinCost);

  beforeEach(() => {
    clock = start;
    store = memoryStore();
    installation = open();
  });

  async function register(
    tenantId = clinicA,
    deviceId = deviceA,
    pin = '258147',
  ): Promise<PreparedKeys> {
    const keys = await installation.calls.prepareKeys({ tenantId, phone: ownerPhone, pin });
    await installation.calls.completeRegistration({
      pendingId: keys.pendingId,
      deviceId,
      tenantId,
      clinicName: 'عيادة تجريبية',
      clinicNameLatin: null,
      facilityName: null,
      member: { ...owner, name: 'مالك تجريبي', roles: ['owner'] },
      lastConfirmedAt: new Date(clock).toISOString(),
      session: session(),
    });
    return keys;
  }

  async function enrollReceptionist(pin = '369258'): Promise<PreparedKeys> {
    const keys = await installation.calls.prepareKeys({
      deviceId: deviceA,
      phone: receptionistPhone,
      pin,
    });
    await installation.calls.completeEnrollment({
      pendingId: keys.pendingId,
      member: { ...receptionist, name: 'موظف استقبال', roles: ['reception'] },
      lastConfirmedAt: new Date(clock).toISOString(),
      session: session(),
    });
    return keys;
  }

  const code = (work: Promise<unknown>) =>
    work.then(
      () => 'resolved',
      (error: unknown) => (error instanceof DeviceError ? error.code : 'other'),
    );

  it('registers a computer with its own device key and the member unlocked', async () => {
    const keys = await register();
    expect(keys.devicePublicKey).not.toBe(keys.userPublicKey);
    const view = await installation.calls.view(null);
    expect(view.currentDeviceId).toBe(deviceA);
    expect(view.unlocked).toEqual({ deviceId: deviceA, enrollmentId: owner.enrollmentId });
    expect(view.registrations).toMatchObject([
      { deviceId: deviceA, tenantId: clinicA, status: 'active', idleLockMinutes: 15 },
    ]);
    expect(await installation.calls.session(null)).toEqual({
      deviceId: deviceA,
      tenantId: clinicA,
      enrollmentId: owner.enrollmentId,
      session: session(),
    });

    const deviceSignature = await installation.calls.signDeviceToken({
      deviceId: deviceA,
      nonce: 'n1',
    });
    expect(
      verifySignature(
        keys.devicePublicKey ?? '',
        deviceTokenMessage('n1', deviceA),
        deviceSignature,
      ),
    ).toBe(true);
    const userSignature = await installation.calls.signSession({ nonce: 'n2' });
    expect(userSignature.enrollmentId).toBe(owner.enrollmentId);
    expect(
      verifySignature(
        keys.userPublicKey,
        staffSessionMessage('n2', deviceA, owner.enrollmentId),
        userSignature.signature,
      ),
    ).toBe(true);
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
        installation.calls.prepareKeys({ tenantId: clinicA, phone: ownerPhone, pin: '258147' }),
      ),
    ).toBe('ALREADY_REGISTERED');
  });

  it('keeps several clinics apart, and switching clinic locks the current one (rule 26)', async () => {
    const first = await register(clinicA, deviceA);
    const second = await register(clinicB, deviceB);
    expect(first.devicePublicKey).not.toBe(second.devicePublicKey);
    let view = await installation.calls.view(null);
    expect(view.registrations.map((item) => item.deviceId)).toEqual([deviceA, deviceB]);
    expect(view.unlocked?.deviceId).toBe(deviceB);

    view = await installation.calls.select({ deviceId: deviceA });
    expect(view.currentDeviceId).toBe(deviceA);
    expect(view.unlocked).toBeNull();
    expect(await installation.calls.session(null)).toBeNull();
    expect(await code(installation.calls.signSession({ nonce: 'n' }))).toBe('NOT_UNLOCKED');
  });

  it('unlocks with the right PIN and locks again', async () => {
    await register();
    await installation.calls.lock(null);
    expect(
      await installation.calls.unlock({
        deviceId: deviceA,
        enrollmentId: owner.enrollmentId,
        pin: '258147',
      }),
    ).toEqual({
      result: 'unlocked',
      windowOpen: true,
    });
    expect((await installation.calls.view(null)).unlocked?.enrollmentId).toBe(owner.enrollmentId);
    const view = await installation.calls.lock(null);
    expect(view.unlocked).toBeNull();
  });

  it('disables the PIN after five wrong ones in a row, kept across restarts (rule 22)', async () => {
    await register();
    await enrollReceptionist();
    await installation.calls.lock(null);
    const attempt = (pin: string, enrollmentId = owner.enrollmentId) =>
      installation.calls.unlock({ deviceId: deviceA, enrollmentId, pin });

    // A right PIN clears the count.
    for (let i = 0; i < 4; i += 1) await attempt('000000');
    expect((await attempt('258147')).result).toBe('unlocked');
    await installation.calls.lock(null);

    for (let left = 4; left >= 1; left -= 1) {
      expect(await attempt('000000')).toEqual({ result: 'wrong_pin', attemptsLeft: left });
    }
    // The app restarts between the fourth and the fifth attempt: the count is on disk.
    installation = open();
    expect(await attempt('000000')).toEqual({ result: 'pin_disabled' });
    expect(await attempt('258147')).toEqual({ result: 'pin_disabled' });
    const view = await installation.calls.view(null);
    expect(view.registrations[0]?.members).toMatchObject([
      { enrollmentId: owner.enrollmentId, pinDisabled: true, attemptsLeft: 0 },
      { enrollmentId: receptionist.enrollmentId, pinDisabled: false, attemptsLeft: 5 },
    ]);
    // Other members keep working.
    expect((await attempt('369258', receptionist.enrollmentId)).result).toBe('unlocked');

    await installation.calls.reenablePin({ deviceId: deviceA, enrollmentId: owner.enrollmentId });
    expect((await attempt('258147')).result).toBe('unlocked');
  });

  it('counts parallel attempts one at a time', async () => {
    await register();
    await installation.calls.lock(null);
    const results = await Promise.all(
      Array.from({ length: 7 }, () =>
        installation.calls.unlock({
          deviceId: deviceA,
          enrollmentId: owner.enrollmentId,
          pin: '000000',
        }),
      ),
    );
    expect(results.filter((result) => result.result === 'wrong_pin')).toHaveLength(4);
    expect(results.filter((result) => result.result === 'pin_disabled')).toHaveLength(3);
  });

  it('opens the offline window for 7 days after the last confirmation (rule 24)', async () => {
    await register();
    const member = async () => (await installation.calls.view(null)).registrations[0]?.members[0];
    clock = start + 6 * DAY;
    expect(await member()).toMatchObject({ windowOpen: true });
    clock = start + 7 * DAY + 1;
    expect(await member()).toMatchObject({ windowOpen: false });
    await installation.calls.lock(null);
    expect(
      await installation.calls.unlock({
        deviceId: deviceA,
        enrollmentId: owner.enrollmentId,
        pin: '258147',
      }),
    ).toEqual({
      result: 'unlocked',
      windowOpen: false,
    });
    // Outside the window the key only signs a session nonce: nobody is unlocked until a session
    // opened with it confirms the member.
    expect((await installation.calls.view(null)).unlocked).toBeNull();
    expect(await code(installation.calls.signSession({ nonce: 'n' }))).toBe('resolved');
    const owned = { deviceId: deviceA, tenantId: clinicA, enrollmentId: owner.enrollmentId };
    await installation.calls.setSession({ ...owned, session: session() });
    expect((await installation.calls.view(null)).unlocked?.enrollmentId).toBe(owner.enrollmentId);
  });

  it('never stores a session for a member other than the one it was opened for', async () => {
    await register();
    await enrollReceptionist();
    await installation.calls.unlock({
      deviceId: deviceA,
      enrollmentId: receptionist.enrollmentId,
      pin: '369258',
    });
    // The owner's session comes back after the receptionist unlocked.
    const late = { deviceId: deviceA, tenantId: clinicA, enrollmentId: owner.enrollmentId };
    expect(await code(installation.calls.setSession({ ...late, session: session() }))).toBe(
      'NOT_UNLOCKED',
    );
    expect((await installation.calls.session(null))?.session).toBeNull();
  });

  it('never extends the window when the clock is set back, and warns (rule 24, edge case 7)', async () => {
    await register();
    clock = start + 8 * DAY;
    expect((await installation.calls.view(null)).clockBehind).toBe(false);
    // The highest time seen survives a restart.
    installation = open();
    clock = start + 1 * DAY;
    const view = await installation.calls.view(null);
    expect(view.clockBehind).toBe(true);
    expect(view.registrations[0]?.members[0]).toMatchObject({ windowOpen: false });
  });

  it('takes the server’s confirmation time as seen, and a newer confirmation reopens the window', async () => {
    await register();
    clock = start + 8 * DAY;
    const current: CurrentDevice = {
      device: {
        id: deviceA,
        tenantId: clinicA,
        facilityId: null,
        name: 'حاسوب الاستقبال',
        status: 'active',
      },
      tenant: {
        id: clinicA,
        nameAr: 'عيادة تجريبية',
        nameLatin: null,
        status: 'active',
        idleLockMinutes: 5,
      },
      facility: { id: '0199f000-0000-7000-8000-00000000a010', name: 'الفرع الرئيسي' },
      members: [
        {
          ...owner,
          name: 'مالك تجريبي',
          roles: ['owner'],
          lastConfirmedAt: new Date(start + 8 * DAY).toISOString(),
        },
      ],
    };
    const view = await installation.calls.updateDevice({ current });
    expect(view.registrations[0]).toMatchObject({
      idleLockMinutes: 5,
      facilityName: 'الفرع الرئيسي',
    });
    expect(view.registrations[0]?.members[0]).toMatchObject({ windowOpen: true });
  });

  it('deletes the key of a member the server no longer lists on this computer', async () => {
    await register();
    await enrollReceptionist();
    const current: CurrentDevice = {
      device: {
        id: deviceA,
        tenantId: clinicA,
        facilityId: null,
        name: 'حاسوب الاستقبال',
        status: 'active',
      },
      tenant: {
        id: clinicA,
        nameAr: 'عيادة تجريبية',
        nameLatin: null,
        status: 'active',
        idleLockMinutes: 15,
      },
      facility: null,
      members: [
        {
          ...owner,
          name: 'مالك تجريبي',
          roles: ['owner'],
          lastConfirmedAt: new Date(clock).toISOString(),
        },
      ],
    };
    const view = await installation.calls.updateDevice({ current });
    expect(view.registrations[0]?.members.map((member) => member.enrollmentId)).toEqual([
      owner.enrollmentId,
    ]);
    // The receptionist was the one unlocked: locked out with their key.
    expect(view.unlocked).toBeNull();
  });

  it('replaces a member’s enrollment after a forgotten PIN (rule 22)', async () => {
    await register();
    const keys = await installation.calls.prepareKeys({
      deviceId: deviceA,
      phone: ownerPhone,
      pin: '741852',
    });
    const replaced = {
      enrollmentId: '0199f000-0000-7000-8000-00000000a099',
      membershipId: owner.membershipId,
    };
    const view = await installation.calls.completeEnrollment({
      pendingId: keys.pendingId,
      member: { ...replaced, name: 'مالك تجريبي', roles: ['owner'] },
      lastConfirmedAt: new Date(clock).toISOString(),
      session: session(),
    });
    expect(view.registrations[0]?.members.map((member) => member.enrollmentId)).toEqual([
      replaced.enrollmentId,
    ]);
    await installation.calls.lock(null);
    expect(
      (
        await installation.calls.unlock({
          deviceId: deviceA,
          enrollmentId: replaced.enrollmentId,
          pin: '741852',
        })
      ).result,
    ).toBe('unlocked');
  });

  it('changes the PIN on this computer, the current PIN counting as an attempt', async () => {
    await register();
    const change = (currentPin: string, newPin: string) =>
      installation.calls.changePin({
        deviceId: deviceA,
        enrollmentId: owner.enrollmentId,
        currentPin,
        newPin,
      });
    expect(await code(change('258147', '123456'))).toBe('PIN_WEAK');
    expect(await change('000000', '741852')).toEqual({ result: 'wrong_pin', attemptsLeft: 4 });
    expect(await change('258147', '741852')).toEqual({ result: 'changed' });
    await installation.calls.lock(null);
    const unlock = (pin: string) =>
      installation.calls.unlock({ deviceId: deviceA, enrollmentId: owner.enrollmentId, pin });
    expect((await unlock('258147')).result).toBe('wrong_pin');
    expect((await unlock('741852')).result).toBe('unlocked');
  });

  it('wipes one registration, keeps its device key until the wipe is confirmed (rule 29)', async () => {
    await register(clinicA, deviceA);
    await register(clinicB, deviceB);
    await installation.calls.setLogo({
      deviceId: deviceA,
      logo: { contentType: 'image/png', data: 'AAAA' },
    });
    let view = await installation.calls.wipe({ deviceId: deviceA });
    const wiped = view.registrations.find((item) => item.deviceId === deviceA);
    expect(wiped).toMatchObject({ status: 'wiped', wipePending: true, members: [], logo: null });
    expect(wiped?.clinicName).toBe('عيادة تجريبية');
    // Clinic B is untouched, its member still unlocked.
    expect(view.registrations.find((item) => item.deviceId === deviceB)).toMatchObject({
      status: 'active',
      members: [{ enrollmentId: owner.enrollmentId }],
    });
    expect(view.unlocked?.deviceId).toBe(deviceB);

    // The confirmation needs a device token.
    expect(await code(installation.calls.signDeviceToken({ deviceId: deviceA, nonce: 'n' }))).toBe(
      'resolved',
    );
    expect(await code(installation.calls.dismissWiped({ deviceId: deviceA }))).toBe(
      'INVALID_INPUT',
    );
    view = await installation.calls.wipeConfirmed({ deviceId: deviceA });
    expect(view.registrations.find((item) => item.deviceId === deviceA)?.wipePending).toBe(false);
    expect(await code(installation.calls.signDeviceToken({ deviceId: deviceA, nonce: 'n' }))).toBe(
      'NOT_FOUND',
    );
    expect(store.text).not.toContain('AAAA');

    view = await installation.calls.dismissWiped({ deviceId: deviceA });
    expect(view.registrations.map((item) => item.deviceId)).toEqual([deviceB]);
  });

  it('can register the same clinic again after a wipe', async () => {
    await register(clinicA, deviceA);
    await installation.calls.wipe({ deviceId: deviceA });
    await installation.calls.wipeConfirmed({ deviceId: deviceA });
    await register(clinicA, deviceB);
    const view = await installation.calls.view(null);
    expect(view.registrations).toMatchObject([{ deviceId: deviceB, status: 'active' }]);
  });

  it('forgets keys made for a registration the API refused', async () => {
    const keys = await installation.calls.prepareKeys({
      tenantId: clinicA,
      phone: ownerPhone,
      pin: '258147',
    });
    await installation.calls.discardKeys({ pendingId: keys.pendingId });
    expect(
      await code(
        installation.calls.completeRegistration({
          pendingId: keys.pendingId,
          deviceId: deviceA,
          tenantId: clinicA,
          clinicName: 'عيادة تجريبية',
          clinicNameLatin: null,
          facilityName: null,
          member: { ...owner, name: 'مالك تجريبي', roles: ['owner'] },
          lastConfirmedAt: new Date(clock).toISOString(),
          session: session(),
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('stores no private key or PIN in the clear', async () => {
    await register();
    const stored = store.text ?? '';
    expect(stored).not.toContain('258147');
    expect(stored).not.toContain('PRIVATE');
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
