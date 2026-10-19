import {
  currentDeviceSchema,
  logoUpload,
  mobilePhoneNumberSchema,
  roleSchema,
  sessionTokensSchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import type { DeviceCalls, DeviceErrorCode, DeviceMethod, DeviceResult } from './bridge.js';
import { DeviceError, type Installation } from './installation.js';
import { solveProofOfWork } from './proof-of-work.js';

// The renderer is untrusted (ADR 0021): every call's input is checked here before it reaches the
// installation, and a refusal goes back as a code only.

const id = z.uuid();
const pin = z.string().regex(/^\d{6}$/);
const nonce = z.string().min(1).max(100);
const member = z.object({
  enrollmentId: id,
  membershipId: id,
  name: z.string().max(100),
  roles: z.array(roleSchema).max(5),
});
// The clinic's logo as the API stores it: a PNG of at most 256 KiB, base64.
const logo = z.object({
  contentType: z.literal('image/png'),
  data: z.base64().max(Math.ceil(logoUpload.maxStoredBytes / 3) * 4),
});

const inputs: { [M in DeviceMethod]: z.ZodType<DeviceCalls[M]['input']> } = {
  view: z.null(),
  appInfo: z.null(),
  solveProofOfWork: z.object({
    challenge: z.string().min(1).max(200),
    difficulty: z.int().min(0).max(32),
  }),
  select: z.object({ deviceId: id }),
  prepareKeys: z.union([
    z.object({ tenantId: id, phone: mobilePhoneNumberSchema, pin }),
    z.object({ deviceId: id, phone: mobilePhoneNumberSchema, pin }),
  ]),
  completeRegistration: z.object({
    pendingId: id,
    deviceId: id,
    tenantId: id,
    clinicName: z.string().max(200),
    clinicNameLatin: z.string().max(200).nullable(),
    facilityName: z.string().max(200).nullable(),
    member,
    lastConfirmedAt: z.iso.datetime(),
    session: sessionTokensSchema,
  }),
  completeEnrollment: z.object({
    pendingId: id,
    member,
    lastConfirmedAt: z.iso.datetime(),
    session: sessionTokensSchema,
  }),
  discardKeys: z.object({ pendingId: id }),
  signDeviceToken: z.object({ deviceId: id, nonce }),
  unlock: z.object({ deviceId: id, enrollmentId: id, pin }),
  signSession: z.object({ nonce }),
  session: z.null(),
  setSession: z.object({
    deviceId: id,
    tenantId: id,
    enrollmentId: id,
    session: sessionTokensSchema.nullable(),
  }),
  lock: z.null(),
  updateDevice: z.object({ current: currentDeviceSchema }),
  setLogo: z.object({ deviceId: id, logo: logo.nullable() }),
  reenablePin: z.object({ deviceId: id, enrollmentId: id }),
  changePin: z.object({ deviceId: id, enrollmentId: id, currentPin: pin, newPin: pin }),
  removeMember: z.object({ deviceId: id, enrollmentId: id }),
  wipe: z.object({ deviceId: id }),
  wipeConfirmed: z.object({ deviceId: id }),
  dismissWiped: z.object({ deviceId: id }),
};

export type AppInfo = DeviceCalls['appInfo']['output'];

/**
 * Answers one bridge call: the method must exist and its input must parse. Errors other than a
 * `DeviceError` are `INTERNAL`, logged by name only by the caller.
 */
export async function handleDeviceCall(
  installation: Installation,
  appInfo: AppInfo,
  method: unknown,
  input: unknown,
): Promise<DeviceResult<unknown>> {
  if (typeof method !== 'string' || !Object.hasOwn(inputs, method)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const name = method as DeviceMethod;
  const parsed = inputs[name].safeParse(input ?? null);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  try {
    if (name === 'appInfo') return { ok: true, value: appInfo };
    if (name === 'solveProofOfWork') {
      const { challenge, difficulty } = parsed.data as DeviceCalls['solveProofOfWork']['input'];
      return { ok: true, value: await solveProofOfWork(challenge, difficulty) };
    }
    const call = installation.calls[name] as (value: unknown) => Promise<unknown>;
    return { ok: true, value: await call(parsed.data) };
  } catch (error) {
    const code: DeviceErrorCode = error instanceof DeviceError ? error.code : 'INTERNAL';
    return { ok: false, code };
  }
}
