import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEVICE_CHANNEL, DEVICE_EVENT_CHANNEL } from './bridge.js';
import { Installation } from './installation.js';
import { handleDeviceCall } from './ipc.js';
import { solveProofOfWork } from './proof-of-work.js';
import { stateFile } from './state-file.js';
import { memoryStore, testPinCost, testProtector } from './test-support.js';

const appInfo = { os: 'win32 10.0', appVersion: '0.0.0' };

describe('device bridge', () => {
  const installation = new Installation(memoryStore(), testProtector(), undefined, testPinCost);
  const call = (method: unknown, input: unknown) =>
    handleDeviceCall(installation, appInfo, method, input);

  it('answers known methods with valid input', async () => {
    expect(await call('appInfo', null)).toEqual({ ok: true, value: appInfo });
    expect(await call('view', undefined)).toMatchObject({ ok: true, value: { registrations: [] } });
  });

  it('refuses unknown methods and invalid input, with a code only', async () => {
    expect(await call('constructor', null)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await call('toString', null)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await call(42, null)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    expect(await call('unlock', { deviceId: 'x', enrollmentId: 'y', pin: '12' })).toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(
      await call('prepareKeys', {
        tenantId: crypto.randomUUID(),
        phone: '+963900000101',
        pin: '123456',
      }),
    ).toEqual({ ok: false, code: 'PIN_WEAK' });
    const owner = {
      deviceId: crypto.randomUUID(),
      tenantId: crypto.randomUUID(),
      enrollmentId: crypto.randomUUID(),
    };
    expect(await call('openSession', owner)).toEqual({ ok: false, code: 'NOT_UNLOCKED' });
  });

  it('has no call that takes a session, a confirmation or a success from the renderer (F02)', async () => {
    const session = {
      sessionId: crypto.randomUUID(),
      accessToken: 'forged',
      accessTokenExpiresAt: '2026-10-18T09:15:00.000Z',
      refreshToken: 'forged',
      expiresAt: '2026-10-18T21:00:00.000Z',
    };
    const ids = { deviceId: crypto.randomUUID(), enrollmentId: crypto.randomUUID() };
    for (const [method, input] of [
      ['setSession', { ...ids, tenantId: crypto.randomUUID(), session }],
      ['signSession', { nonce: 'n' }],
      ['updateDevice', { current: {} }],
      ['completeEnrollment', { pendingId: crypto.randomUUID(), session }],
      ['completeRegistration', { pendingId: crypto.randomUUID(), session }],
    ] as const) {
      expect(await call(method, input)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    }
    // Re-enabling a PIN needs the password the main process signs in with: ids alone are refused.
    expect(await call('reenablePin', ids)).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('has no call that wipes a registration or deletes a member’s key on the renderer’s word (F03)', async () => {
    const ids = { deviceId: crypto.randomUUID(), enrollmentId: crypto.randomUUID() };
    for (const [method, input] of [
      ['wipe', { deviceId: ids.deviceId }],
      ['wipeConfirmed', { deviceId: ids.deviceId }],
      ['removeMember', ids],
    ] as const) {
      expect(await call(method, input)).toEqual({ ok: false, code: 'INVALID_INPUT' });
    }
  });

  it('answers a refusal of the API with its code', async () => {
    const offline = new Installation(memoryStore(), testProtector(), undefined, testPinCost, {
      server: async () => ({ status: 401, body: { code: 'TICKET_INVALID', message: 'x' } }),
    });
    const keys = await offline.calls.prepareKeys({
      tenantId: crypto.randomUUID(),
      phone: '+963900000101',
      pin: '258147',
    });
    expect(
      await handleDeviceCall(offline, appInfo, 'register', {
        pendingId: keys.pendingId,
        ticket: 'ticket',
        facilityId: null,
        deviceName: 'حاسوب',
        clinicName: 'عيادة',
        clinicNameLatin: null,
        facilityName: null,
        memberName: 'مالك',
        roles: ['owner'],
      }),
    ).toEqual({ ok: false, code: 'REFUSED', refusal: 'TICKET_INVALID' });
  });

  it('uses the channels the preload names', async () => {
    const preload = await readFile(new URL('../preload.cts', import.meta.url), 'utf8');
    expect(preload).toContain(`'${DEVICE_CHANNEL}'`);
    expect(preload).toContain(`'${DEVICE_EVENT_CHANNEL}'`);
  });
});

describe('proof of work', () => {
  it('finds a nonce with the leading zero bits asked for', async () => {
    const nonce = await solveProofOfWork('challenge.1.8.mac', 12);
    const digest = createHash('sha256').update(`challenge.1.8.mac:${nonce}`).digest();
    expect(digest[0]).toBe(0);
    expect((digest[1] ?? 0) >> 4).toBe(0);
  });
});

describe('state file', () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('writes the state sealed and reads it back', async () => {
    directory = await mkdtemp(join(tmpdir(), 'vertex-shifa-state-'));
    const path = join(directory, 'identity', 'installation.bin');
    const file = stateFile(path, testProtector());
    expect(await file.read()).toBeNull();
    await file.write('{"phone":"+963900000101"}');
    expect((await readFile(path)).toString('utf8')).not.toContain('+963900000101');
    expect(await file.read()).toBe('{"phone":"+963900000101"}');
  });
});
