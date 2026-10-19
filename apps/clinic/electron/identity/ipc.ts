import {
  logoUpload,
  mobilePhoneNumberSchema,
  passwordPolicy,
  roleSchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import type { DeviceCalls, DeviceErrorCode, DeviceMethod, DeviceResult } from './bridge.js';
import { DeviceError, type Installation } from './installation.js';
import { solveProofOfWork } from './proof-of-work.js';
import { ServerRefusal } from './server.js';

// The renderer is untrusted (ADR 0021): every call's input is checked here before it reaches the
// installation, and a refusal goes back as a code only (the API's code for a refusal of the API).

const id = z.uuid();
const pin = z.string().regex(/^\d{6}$/);
const nonce = z.string().min(1).max(100);
const ticket = z.string().min(1).max(2_000);
const name = z.string().max(200);
const owner = z.object({ deviceId: id, tenantId: id, enrollmentId: id });
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
  register: z.object({
    pendingId: id,
    ticket,
    facilityId: id.nullable(),
    deviceName: name,
    clinicName: name,
    clinicNameLatin: name.nullable(),
    facilityName: name.nullable(),
    memberName: name,
    roles: z.array(roleSchema).max(5),
  }),
  enroll: z.object({ pendingId: id, ticket, memberName: name }),
  discardKeys: z.object({ pendingId: id }),
  signDeviceToken: z.object({ deviceId: id, nonce }),
  unlock: z.object({ deviceId: id, enrollmentId: id, pin }),
  openSession: owner,
  refreshSession: owner.extend({ sessionId: id }),
  dropSession: owner.extend({ sessionId: id }),
  session: z.null(),
  lock: z.null(),
  refreshDevice: z.object({ deviceId: id }),
  setLogo: z.object({ deviceId: id, logo: logo.nullable() }),
  reenablePin: z.object({
    deviceId: id,
    enrollmentId: id,
    password: z.string().min(1).max(passwordPolicy.maxLength),
  }),
  changePin: z.object({ deviceId: id, enrollmentId: id, currentPin: pin, newPin: pin }),
  confirmWipe: z.object({ deviceId: id }),
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
    if (error instanceof ServerRefusal) return { ok: false, code: 'REFUSED', refusal: error.code };
    const code: DeviceErrorCode = error instanceof DeviceError ? error.code : 'INTERNAL';
    return { ok: false, code };
  }
}
