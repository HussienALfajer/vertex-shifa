// The device bridge between the renderer and the main process (spec S02, ADR 0021): what the
// renderer may ask of the installation's identity. Private keys and PINs' derived keys stay in the
// main process; the renderer sends PINs in and gets public keys, signatures and views out. Types
// and the channel's name: the renderer, the preload and the E2E's stand-in import them.

import type { CurrentDevice, Role, SessionTokens } from '@vertex-shifa/contracts';

/** The one IPC channel; the main process dispatches `method` to its handler. */
export const DEVICE_CHANNEL = 'device:call';

/** The clinic's logo for the lock screen, kept from the last session (`GET /api/tenant/logo`). */
/** Whom a session belongs to: a member on one registration. */
export type SessionOwner = { deviceId: string; tenantId: string; enrollmentId: string };

export type ClinicLogo = { contentType: 'image/png'; data: string };

/** A member enrolled on a registration, as the lock screen shows them. */
export type MemberView = {
  enrollmentId: string;
  membershipId: string;
  name: string;
  roles: Role[];
  /** For the password sign-ins that re-enable or replace the PIN (rule 22). */
  phone: string;
  lastConfirmedAt: string;
  /** Five wrong PINs in a row disable it until an online password sign-in (rule 22). */
  pinDisabled: boolean;
  attemptsLeft: number;
  /** Rule 24: the PIN unlocks offline until `windowClosesAt`. */
  windowOpen: boolean;
  windowClosesAt: string;
};

/** One clinic registration of the installation (ADR 0024). */
export type RegistrationView = {
  deviceId: string;
  tenantId: string;
  clinicName: string;
  clinicNameLatin: string | null;
  facilityName: string | null;
  idleLockMinutes: number;
  logo: ClinicLogo | null;
  /** `wiped`: the clinic revoked this computer and its data here was deleted (rule 29). */
  status: 'active' | 'wiped';
  /** A wiped registration whose wipe the server has not confirmed yet. */
  wipePending: boolean;
  members: MemberView[];
};

export type InstallationView = {
  registrations: RegistrationView[];
  /** The registration the lock screen shows; switching clinic locks the current one (rule 26). */
  currentDeviceId: string | null;
  /** The member whose PIN unlocked their key, on the current registration. */
  unlocked: { deviceId: string; enrollmentId: string } | null;
  /** The device clock is behind the highest time it has seen (rule 24). */
  clockBehind: boolean;
};

export type UnlockResult =
  | { result: 'unlocked'; windowOpen: boolean }
  | { result: 'wrong_pin'; attemptsLeft: number }
  | { result: 'pin_disabled' };

export type ChangePinResult =
  | { result: 'changed' }
  | { result: 'wrong_pin'; attemptsLeft: number }
  | { result: 'pin_disabled' };

/** Keys made for a registration or an enrollment, kept in memory until the API accepts them. */
export type PreparedKeys = {
  pendingId: string;
  /** A new registration's device key; null when enrolling on an existing one. */
  devicePublicKey: string | null;
  userPublicKey: string;
};

/** Every call the renderer can make: input and output. */
export type DeviceCalls = {
  view: { input: null; output: InstallationView };
  appInfo: { input: null; output: { os: string; appVersion: string } };
  solveProofOfWork: { input: { challenge: string; difficulty: number }; output: string };
  select: { input: { deviceId: string }; output: InstallationView };
  /** Rules 18–21: keys for a new registration (`tenantId`) or a new enrollment (`deviceId`). */
  prepareKeys: {
    input: ({ tenantId: string } | { deviceId: string }) & { phone: string; pin: string };
    output: PreparedKeys;
  };
  completeRegistration: {
    input: {
      pendingId: string;
      deviceId: string;
      tenantId: string;
      clinicName: string;
      clinicNameLatin: string | null;
      facilityName: string | null;
      member: { enrollmentId: string; membershipId: string; name: string; roles: Role[] };
      lastConfirmedAt: string;
      session: SessionTokens;
    };
    output: InstallationView;
  };
  completeEnrollment: {
    input: {
      pendingId: string;
      member: { enrollmentId: string; membershipId: string; name: string; roles: Role[] };
      lastConfirmedAt: string;
      session: SessionTokens;
    };
    output: InstallationView;
  };
  discardKeys: { input: { pendingId: string }; output: null };
  /** The device key's signature for a device token (`deviceTokenMessage`). */
  signDeviceToken: { input: { deviceId: string; nonce: string }; output: string };
  unlock: {
    input: { deviceId: string; enrollmentId: string; pin: string };
    output: UnlockResult;
  };
  /** The unlocked member's signature for a staff session (`staffSessionMessage`). */
  signSession: {
    input: { nonce: string };
    output: { deviceId: string; enrollmentId: string; signature: string };
  };
  /** The unlocked member (confirmed or not) and their session; null when nobody is unlocked. */
  session: { input: null; output: (SessionOwner & { session: SessionTokens | null }) | null };
  /** Refused (`NOT_UNLOCKED`) unless the session's member is still the one unlocked. */
  setSession: { input: SessionOwner & { session: SessionTokens | null }; output: null };
  lock: { input: null; output: InstallationView };
  updateDevice: { input: { current: CurrentDevice }; output: InstallationView };
  setLogo: { input: { deviceId: string; logo: ClinicLogo | null }; output: null };
  reenablePin: { input: { deviceId: string; enrollmentId: string }; output: InstallationView };
  changePin: {
    input: { deviceId: string; enrollmentId: string; currentPin: string; newPin: string };
    output: ChangePinResult;
  };
  removeMember: { input: { deviceId: string; enrollmentId: string }; output: InstallationView };
  /** Rule 29: deletes the registration's keys and data; the device key stays until confirmed. */
  wipe: { input: { deviceId: string }; output: InstallationView };
  wipeConfirmed: { input: { deviceId: string }; output: InstallationView };
  dismissWiped: { input: { deviceId: string }; output: InstallationView };
};

export type DeviceMethod = keyof DeviceCalls;

/** Why the main process refused a call; never a message (it may hold personal data). */
export type DeviceErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'NOT_UNLOCKED'
  | 'PIN_WEAK'
  | 'ALREADY_REGISTERED'
  | 'STORAGE_UNAVAILABLE'
  | 'INTERNAL';

export type DeviceResult<T> = { ok: true; value: T } | { ok: false; code: DeviceErrorCode };

/** What the preload exposes as `window.vertexShifaDevice`. */
export type DeviceBridgeWindow = {
  call(method: DeviceMethod, input: unknown): Promise<DeviceResult<unknown>>;
};
