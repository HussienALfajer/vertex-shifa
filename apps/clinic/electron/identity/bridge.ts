// The device bridge between the renderer and the main process (spec S02, ADR 0021): what the
// renderer may ask of the installation's identity. Private keys, PINs' derived keys and refresh
// tokens stay in the main process; the renderer sends PINs, passwords and tickets in and gets
// public keys, signatures, views and access tokens out. A security transition happens only on an
// answer the main process got from the API itself. Types and the channels' names: the renderer,
// the preload and the E2E's stand-in import them.

import type { ErrorCode, Role } from '@vertex-shifa/contracts';

/** The one IPC channel of calls; the main process dispatches `method` to its handler. */
export const DEVICE_CHANNEL = 'device:call';
/** The channel of what the main process tells the renderer on its own (`DeviceEvent`). */
export const DEVICE_EVENT_CHANNEL = 'device:event';

/** Whom a session belongs to: a member on one registration. */
export type SessionOwner = { deviceId: string; tenantId: string; enrollmentId: string };

/**
 * What the renderer gets of a staff session: the short-lived access token only. The refresh
 * token stays in the main process, which refreshes the session itself (`refreshSession`).
 */
export type AccessGrant = { sessionId: string; accessToken: string; accessTokenExpiresAt: string };

/**
 * What the main process tells the renderer: `locked`, it locked the member itself (rule 24: the
 * offline window passed during the session); `suspended` and `resumed`, the computer slept for
 * `sleptMs` by the later of the wall clock and the monotonic clock (rule 25: the idle lock counts
 * the sleep).
 */
export type DeviceEvent =
  | { type: 'locked' }
  | { type: 'suspended' }
  | { type: 'resumed'; sleptMs: number };

/** The clinic's logo for the lock screen, kept from the last session (`GET /api/tenant/logo`). */
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
  /**
   * Rule 18: the main process registers this computer (`POST /api/devices` with the sign-in
   * ticket) with the prepared keys, and the member is unlocked with the session it answers. The
   * names and roles only label the lock screen until the server's own list replaces them.
   */
  register: {
    input: {
      pendingId: string;
      ticket: string;
      facilityId: string | null;
      deviceName: string;
      clinicName: string;
      clinicNameLatin: string | null;
      facilityName: string | null;
      memberName: string;
      roles: Role[];
    };
    output: { view: InstallationView; access: AccessGrant };
  };
  /** Rules 20 and 22: the main process enrolls the member on the prepared registration. */
  enroll: {
    input: { pendingId: string; ticket: string; memberName: string };
    output: { view: InstallationView; access: AccessGrant };
  };
  discardKeys: { input: { pendingId: string }; output: null };
  /** The device key's signature for a device token (`deviceTokenMessage`). */
  signDeviceToken: { input: { deviceId: string; nonce: string }; output: string };
  unlock: {
    input: { deviceId: string; enrollmentId: string; pin: string };
    output: UnlockResult;
  };
  /**
   * Rule 23: the main process opens a staff session for the unlocked member with their key; the
   * session confirms them again (the offline window starts over). Refused (`NOT_UNLOCKED`) unless
   * `owner` is still the member unlocked.
   */
  openSession: { input: SessionOwner; output: AccessGrant };
  /** The main process refreshes the session with the refresh token it keeps. */
  refreshSession: { input: SessionOwner & { sessionId: string }; output: AccessGrant };
  /** The server no longer takes this session's access token: a new one opens on the next request. */
  dropSession: { input: SessionOwner & { sessionId: string }; output: null };
  /** The confirmed unlocked member and their session; null when nobody is (rule 24). */
  session: { input: null; output: (SessionOwner & { access: AccessGrant | null }) | null };
  lock: { input: null; output: InstallationView };
  /** The main process reads `GET /api/devices/current`: the clinic, members, confirmations. */
  refreshDevice: { input: { deviceId: string }; output: InstallationView };
  setLogo: { input: { deviceId: string; logo: ClinicLogo | null }; output: null };
  /**
   * Rule 22: the main process signs in with the member's phone, this password and the device
   * token; the PIN is re-enabled only when the server answers `done` (enrolled on this device).
   * Elsewhere the server sends an OTP and the sign-in goes on as a forgotten PIN.
   */
  reenablePin: {
    input: { deviceId: string; enrollmentId: string; password: string };
    output:
      | { result: 'reenabled'; view: InstallationView }
      | { result: 'otp'; challengeId: string };
  };
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
  /** The API refused a request of the main process: `refusal` is its code. */
  | 'REFUSED'
  | 'INTERNAL';

export type DeviceResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: DeviceErrorCode; refusal?: ErrorCode | 'NETWORK_ERROR' };

/** What the preload exposes as `window.vertexShifaDevice`. */
export type DeviceBridgeWindow = {
  call(method: DeviceMethod, input: unknown): Promise<DeviceResult<unknown>>;
  /** Listens to the main process's events; answers the call that stops listening. */
  onEvent(listener: (event: DeviceEvent) => void): () => void;
};
