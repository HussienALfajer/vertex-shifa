import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  type CurrentDevice,
  currentDeviceSchema,
  deviceTokenMessage,
  deviceTokenSchema,
  deviceWipedSchema,
  enrolledSchema,
  isWeakPin,
  nonceSchema,
  OFFLINE_WINDOW_DAYS,
  offlineWindow,
  pinPolicy,
  proofOfWorkChallengeSchema,
  type Role,
  registeredDeviceSchema,
  type SessionTokens,
  sessionTokensSchema,
  signInResultSchema,
  staffSessionMessage,
  staffSessionPolicy,
} from '@vertex-shifa/contracts';
import type { z } from 'zod';
import type {
  AccessGrant,
  ChangePinResult,
  ClinicLogo,
  DeviceCalls,
  DeviceErrorCode,
  DeviceEvent,
  InstallationView,
  MemberView,
  PreparedKeys,
  RegistrationView,
  SessionOwner,
  UnlockResult,
} from './bridge.js';
import {
  generateKeyPair,
  type KeyPair,
  type PinCost,
  type Protector,
  pinCost,
  signMessage,
  unwrapWithPin,
  wrapWithPin,
} from './keys.js';
import { solveProofOfWork } from './proof-of-work.js';
import { ask, offline, ServerRefusal, type ServerRequest, type Transport } from './server.js';

/** Where the installation keeps its state: one file, encrypted to the Windows account in the app. */
export type StateStore = {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
};

/** A refusal the bridge answers with its code. */
export class DeviceError extends Error {
  override readonly name = 'DeviceError';

  constructor(readonly code: DeviceErrorCode) {
    super(code);
  }
}

type StoredMember = {
  enrollmentId: string;
  membershipId: string;
  name: string;
  roles: Role[];
  phone: string;
  lastConfirmedAt: string;
  userPublicKey: string;
  /** `wrapWithPin` of the user key. */
  wrappedKey: string;
  failedAttempts: number;
};

type StoredRegistration = {
  deviceId: string;
  tenantId: string;
  clinicName: string;
  clinicNameLatin: string | null;
  facilityName: string | null;
  idleLockMinutes: number;
  logo: ClinicLogo | null;
  status: 'active' | 'wiped';
  /** The device key's PKCS #8, sealed by the protector (base64); null once a wipe is confirmed. */
  deviceKey: string | null;
  members: StoredMember[];
};

type StoredState = {
  version: 1;
  /** Rule 24: the highest time the device has seen; never moves back. */
  highestSeenAt: string;
  currentDeviceId: string | null;
  registrations: StoredRegistration[];
};

type Pending = {
  tenantId: string | null;
  deviceId: string | null;
  deviceKey: KeyPair | null;
  userKey: KeyPair;
  wrappedKey: string;
  phone: string;
};

type Unlocked = {
  deviceId: string;
  enrollmentId: string;
  privateKey: Buffer;
  /** Held here only: the renderer gets the access token and its expiry (`AccessGrant`). */
  session: SessionTokens | null;
  /** By the monotonic clock: an unlock outside the window waits this long for its session. */
  unlockedAt: number;
  /** The window was open at some point since the unlock: when it closes, the member is locked. */
  wasConfirmed: boolean;
  /**
   * By the monotonic clock: a session the main process opened confirms this unlock for the
   * window's length, whatever the computer's clock says (it may run ahead of the server's).
   */
  confirmedUntil: number;
};

/** What the installation needs beside its state: the API, the app, a monotonic clock, events. */
export type InstallationOptions = {
  server?: Transport;
  appInfo?: { os: string; appVersion: string };
  /** Milliseconds that never go back (`performance.now()`); tests move it. */
  monotonic?: () => number;
  onEvent?: (event: DeviceEvent) => void;
};

/** The bridge's calls the installation answers; the others are the app's (`ipc.ts`). */
export type InstallationCalls = {
  [M in Exclude<keyof DeviceCalls, 'appInfo' | 'solveProofOfWork'>]: (
    input: DeviceCalls[M]['input'],
  ) => Promise<DeviceCalls[M]['output']>;
};

const DEFAULT_IDLE_LOCK_MINUTES = 15;
/** The clock warning waits for a gap larger than ordinary clock drift between device and server. */
const CLOCK_TOLERANCE_MS = 5 * 60_000;
/** The highest-seen time is written at most once a minute when nothing else changes. */
const HIGHEST_SEEN_WRITE_MS = 60_000;
/** How often the offline window of the unlocked member is checked (rule 24). */
const WINDOW_CHECK_MS = 30_000;
/** An unlock outside the window that no session confirmed within this time is forgotten. */
const UNCONFIRMED_UNLOCK_MS = 2 * 60_000;
const DEVICE_TOKEN_HEADER = 'x-device-token';
const TICKET_HEADER = 'x-sign-in-ticket';

const userKeyContext = (publicKey: string) => `vertex-shifa/user-key/v1\n${publicKey}`;

const emptyState = (now: Date): StoredState => ({
  version: 1,
  highestSeenAt: now.toISOString(),
  currentDeviceId: null,
  registrations: [],
});

/** The renderer's part of a session: never the refresh token. */
function grant(session: SessionTokens): AccessGrant {
  return {
    sessionId: session.sessionId,
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt,
  };
}

/**
 * The identity of one installation of the clinic app (spec S02 rules 18–29, ADR 0021, ADR 0024):
 * its clinic registrations, each with its device key and enrolled members; the PIN that unwraps a
 * member's user key, with the 5-attempt lockout and the 7-day offline window measured against the
 * highest time seen, and enforced during the session too; the unlocked member and their session;
 * the wipe of one registration. Every answer of the API that changes what a member may do here
 * (a registration, an enrollment, a session, a PIN re-enabled, the members' confirmations) comes
 * from the main process's own request, never from the renderer (ADR 0021). Local work runs one
 * call at a time, so two PIN attempts never race past the counter; the requests to the API run
 * outside that queue, so a slow connection never holds the lock screen.
 */
export class Installation {
  private state: StoredState | undefined;
  private persistedHighestSeen = 0;
  private readonly pending = new Map<string, Pending>();
  private unlocked: Unlocked | undefined;
  /**
   * Moves on every change of who is unlocked or which clinic is shown (a lock, an unlock, a switch,
   * a removed member, a wipe): a registration or an enrollment whose answer comes back after one
   * stores what the server created but unlocks nobody.
   */
  private identity = 0;
  private queue: Promise<unknown> = Promise.resolve();
  /** The latest trusted time and the monotonic time it was taken at. */
  private anchor: { time: number; monotonic: number } | undefined;
  private windowTimer: ReturnType<typeof setInterval> | undefined;
  private readonly server: Transport;
  private readonly appInfo: { os: string; appVersion: string };
  private readonly monotonic: () => number;
  private readonly onEvent: (event: DeviceEvent) => void;

  constructor(
    private readonly store: StateStore,
    private readonly protector: Protector,
    private readonly now: () => Date = () => new Date(),
    private readonly cost: PinCost = pinCost,
    options: InstallationOptions = {},
  ) {
    this.server = options.server ?? offline;
    this.appInfo = options.appInfo ?? { os: 'unknown', appVersion: '0.0.0' };
    this.monotonic = options.monotonic ?? (() => performance.now());
    this.onEvent = options.onEvent ?? (() => undefined);
  }

  /** The bridge's calls about identity, by name. */
  readonly calls: InstallationCalls = {
    view: () => this.serial(() => this.view()),
    select: (input) => this.serial(() => this.select(input.deviceId)),
    prepareKeys: (input) => this.serial(() => this.prepareKeys(input)),
    register: (input) => this.register(input),
    enroll: (input) => this.enroll(input),
    discardKeys: (input) =>
      this.serial(async () => {
        this.pending.delete(input.pendingId);
        return null;
      }),
    signDeviceToken: (input) => this.serial(() => this.signDeviceToken(input)),
    unlock: (input) => this.serial(() => this.unlock(input)),
    openSession: (input) => this.openSession(input),
    refreshSession: (input) => this.refreshSession(input),
    dropSession: (input) =>
      this.serial(async () => {
        const unlocked = this.unlocked;
        if (
          unlocked &&
          this.owns(unlocked, input) &&
          unlocked.session?.sessionId === input.sessionId
        ) {
          unlocked.session = null;
        }
        return null;
      }),
    session: () => this.serial(async () => this.currentSession()),
    lock: () =>
      this.serial(async () => {
        this.forgetUnlocked();
        return this.view();
      }),
    refreshDevice: (input) => this.refreshDevice(input.deviceId),
    setLogo: (input) =>
      this.serial(async () => {
        const registration = await this.registration(input.deviceId);
        if (registration.status === 'active') {
          registration.logo = input.logo;
          await this.persist();
        }
        return null;
      }),
    reenablePin: (input) => this.reenablePin(input),
    changePin: (input) => this.serial(() => this.changePin(input)),
    confirmWipe: (input) => this.confirmWipe(input.deviceId),
    dismissWiped: (input) => this.serial(() => this.dismissWiped(input.deviceId)),
  };

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      await this.load();
      return work();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<StoredState> {
    if (!this.state) {
      const text = await this.store.read();
      this.state = text ? (JSON.parse(text) as StoredState) : emptyState(this.now());
      this.persistedHighestSeen = Date.parse(this.state.highestSeenAt);
    }
    return this.state;
  }

  private get loaded(): StoredState {
    if (!this.state) throw new DeviceError('INTERNAL');
    return this.state;
  }

  private async persist(): Promise<void> {
    await this.store.write(JSON.stringify(this.loaded));
    this.persistedHighestSeen = Date.parse(this.loaded.highestSeenAt);
  }

  /**
   * Rule 24: the device clock, but never earlier than the last trusted time plus the monotonic
   * time since, so setting the clock back while the app runs does not stop the window's clock. A
   * new process starts from the highest time seen, so a clock set back before a restart does not
   * stop it either: the window keeps closing from there.
   */
  private trustedNow(): Date {
    const monotonic = this.monotonic();
    const carried = this.anchor
      ? this.anchor.time + (monotonic - this.anchor.monotonic)
      : Date.parse(this.loaded.highestSeenAt);
    const time = Math.max(this.now().getTime(), carried);
    this.anchor = { time, monotonic };
    return new Date(time);
  }

  /** Rule 24: moves the highest-seen time forward to `time`, never back. */
  private observe(time: Date): void {
    if (time.getTime() > Date.parse(this.loaded.highestSeenAt)) {
      this.loaded.highestSeenAt = time.toISOString();
    }
  }

  // Views.

  private async view(): Promise<InstallationView> {
    const deviceNow = this.now();
    const now = this.trustedNow();
    this.observe(now);
    if (
      Date.parse(this.loaded.highestSeenAt) - this.persistedHighestSeen >=
      HIGHEST_SEEN_WRITE_MS
    ) {
      // A failed write keeps the time in memory for the next one.
      await this.persist().catch(() => undefined);
    }
    const highestSeenAt = new Date(this.loaded.highestSeenAt);
    const unlocked = this.unlocked;
    return {
      registrations: this.loaded.registrations.map((registration) =>
        this.registrationView(registration, now, highestSeenAt),
      ),
      currentDeviceId: this.loaded.currentDeviceId,
      unlocked:
        unlocked && this.confirmed(unlocked)
          ? { deviceId: unlocked.deviceId, enrollmentId: unlocked.enrollmentId }
          : null,
      clockBehind: deviceNow.getTime() < highestSeenAt.getTime() - CLOCK_TOLERANCE_MS,
    };
  }

  private registrationView(
    registration: StoredRegistration,
    now: Date,
    highestSeenAt: Date,
  ): RegistrationView {
    return {
      deviceId: registration.deviceId,
      tenantId: registration.tenantId,
      clinicName: registration.clinicName,
      clinicNameLatin: registration.clinicNameLatin,
      facilityName: registration.facilityName,
      idleLockMinutes: registration.idleLockMinutes,
      logo: registration.logo,
      status: registration.status,
      wipePending: registration.status === 'wiped' && registration.deviceKey !== null,
      members: registration.members.map((member) => this.memberView(member, now, highestSeenAt)),
    };
  }

  private memberView(member: StoredMember, now: Date, highestSeenAt: Date): MemberView {
    const window = offlineWindow({
      lastConfirmedAt: new Date(member.lastConfirmedAt),
      deviceNow: now,
      highestSeenAt,
    });
    return {
      enrollmentId: member.enrollmentId,
      membershipId: member.membershipId,
      name: member.name,
      roles: member.roles,
      phone: member.phone,
      lastConfirmedAt: member.lastConfirmedAt,
      pinDisabled: member.failedAttempts >= pinPolicy.maxFailures,
      attemptsLeft: Math.max(0, pinPolicy.maxFailures - member.failedAttempts),
      windowOpen: window.open,
      windowClosesAt: window.closesAt.toISOString(),
    };
  }

  private windowOpen(member: StoredMember): boolean {
    const now = this.trustedNow();
    this.observe(now);
    return this.memberView(member, now, new Date(this.loaded.highestSeenAt)).windowOpen;
  }

  // Registrations and enrollments.

  private async registration(deviceId: string): Promise<StoredRegistration> {
    const found = this.loaded.registrations.find((item) => item.deviceId === deviceId);
    if (!found) throw new DeviceError('NOT_FOUND');
    return found;
  }

  private async activeRegistration(deviceId: string): Promise<StoredRegistration> {
    const registration = await this.registration(deviceId);
    if (registration.status !== 'active') throw new DeviceError('NOT_FOUND');
    return registration;
  }

  private activelyRegistered(tenantId: string): boolean {
    return this.loaded.registrations.some(
      (item) => item.tenantId === tenantId && item.status === 'active',
    );
  }

  private member(registration: StoredRegistration, enrollmentId: string): StoredMember {
    const found = registration.members.find((member) => member.enrollmentId === enrollmentId);
    if (!found) throw new DeviceError('NOT_FOUND');
    return found;
  }

  /** Rule 26: switching clinic locks the current one. */
  private async select(deviceId: string): Promise<InstallationView> {
    await this.registration(deviceId);
    if (this.unlocked && this.unlocked.deviceId !== deviceId) this.forgetUnlocked();
    if (this.loaded.currentDeviceId !== deviceId) this.identity += 1;
    this.loaded.currentDeviceId = deviceId;
    await this.persist();
    return this.view();
  }

  /**
   * Rules 18–21: a user key wrapped by the chosen PIN, and for a new registration a device key.
   * Rule 19 (edge case 14): never a second registration to the same clinic.
   */
  private async prepareKeys(input: DeviceCalls['prepareKeys']['input']): Promise<PreparedKeys> {
    if (isWeakPin(input.pin, input.phone)) throw new DeviceError('PIN_WEAK');
    let tenantId: string | null = null;
    let deviceId: string | null = null;
    if ('tenantId' in input) {
      if (this.activelyRegistered(input.tenantId)) throw new DeviceError('ALREADY_REGISTERED');
      tenantId = input.tenantId;
    } else {
      deviceId = (await this.activeRegistration(input.deviceId)).deviceId;
    }
    const userKey = generateKeyPair();
    const pending: Pending = {
      tenantId,
      deviceId,
      deviceKey: tenantId ? generateKeyPair() : null,
      userKey,
      wrappedKey: await wrapWithPin(
        userKey.privateKey,
        input.pin,
        userKeyContext(userKey.publicKey),
        this.protector,
        this.cost,
      ),
      phone: input.phone,
    };
    const pendingId = randomUUID();
    this.pending.set(pendingId, pending);
    return {
      pendingId,
      devicePublicKey: pending.deviceKey?.publicKey ?? null,
      userPublicKey: userKey.publicKey,
    };
  }

  /** Prepared keys are used once: a refused or lost answer forgets them. */
  private takePending(pendingId: string, kind: 'register' | 'enroll'): Pending {
    const pending = this.pending.get(pendingId);
    if (!pending || (kind === 'register') !== (pending.deviceKey !== null)) {
      throw new DeviceError('NOT_FOUND');
    }
    this.pending.delete(pendingId);
    return pending;
  }

  private storedMember(
    pending: Pending,
    enrollment: { id: string; membershipId: string; lastConfirmedAt: string },
    name: string,
    roles: Role[],
  ): StoredMember {
    return {
      enrollmentId: enrollment.id,
      membershipId: enrollment.membershipId,
      name,
      roles,
      phone: pending.phone,
      lastConfirmedAt: enrollment.lastConfirmedAt,
      userPublicKey: pending.userKey.publicKey,
      wrappedKey: pending.wrappedKey,
      failedAttempts: 0,
    };
  }

  /**
   * Rule 18: registers this computer to the clinic with the prepared keys (`POST /api/devices`,
   * with the person's sign-in ticket) and enrolls the member, unlocked with the session the API
   * opened. The ids, the confirmation and the session are the API's answer to this request.
   */
  private async register(
    input: DeviceCalls['register']['input'],
  ): Promise<DeviceCalls['register']['output']> {
    const { pending, identity } = await this.serial(async () => ({
      pending: this.takePending(input.pendingId, 'register'),
      identity: this.identity,
    }));
    const { tenantId, deviceKey } = pending;
    if (!tenantId || !deviceKey) throw new DeviceError('INVALID_INPUT');
    const { device, enrollment, session } = await ask(
      this.server,
      {
        method: 'POST',
        path: '/api/devices',
        headers: { [TICKET_HEADER]: input.ticket },
        body: {
          tenantId,
          facilityId: input.facilityId,
          name: input.deviceName,
          publicKey: deviceKey.publicKey,
          os: this.appInfo.os,
          appVersion: this.appInfo.appVersion,
          userPublicKey: pending.userKey.publicKey,
        },
      },
      registeredDeviceSchema,
    );
    if (device.tenantId !== tenantId || enrollment.deviceId !== device.id) {
      throw new ServerRefusal('INTERNAL_ERROR');
    }
    return this.serial(async () => {
      if (this.activelyRegistered(tenantId)) throw new DeviceError('ALREADY_REGISTERED');
      // A wiped registration to the same clinic gives way to the new one.
      this.loaded.registrations = this.loaded.registrations.filter(
        (item) => item.tenantId !== tenantId,
      );
      this.loaded.registrations.push({
        deviceId: device.id,
        tenantId,
        clinicName: input.clinicName,
        clinicNameLatin: input.clinicNameLatin,
        facilityName: input.facilityName,
        idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES,
        logo: null,
        status: 'active',
        deviceKey: this.protector.encrypt(deviceKey.privateKey).toString('base64'),
        members: [this.storedMember(pending, enrollment, input.memberName, input.roles)],
      });
      this.observe(new Date(enrollment.lastConfirmedAt));
      const current = this.identity === identity;
      if (current || !this.loaded.currentDeviceId) this.loaded.currentDeviceId = device.id;
      await this.persist();
      return this.enrolled(current, device.id, enrollment.id, pending.userKey, session);
    });
  }

  /**
   * The member a registration or an enrollment created is unlocked with its session only while
   * nobody locked, unlocked or switched clinic during the request; otherwise their PIN unlocks
   * them like anyone enrolled here, and the session is dropped.
   */
  private async enrolled(
    current: boolean,
    deviceId: string,
    enrollmentId: string,
    key: KeyPair,
    session: SessionTokens,
  ): Promise<{ view: InstallationView; access: AccessGrant | null }> {
    if (!current) {
      key.privateKey.fill(0);
      return { view: await this.view(), access: null };
    }
    this.setUnlocked(deviceId, enrollmentId, key, session);
    return { view: await this.view(), access: grant(session) };
  }

  /**
   * Rules 20 and 22: enrolls the member on this registration (`POST /api/devices/current/
   * enrollments`, with the device token and the sign-in ticket). A member enrolled here before (a
   * forgotten PIN) is replaced with the new key and PIN.
   */
  private async enroll(
    input: DeviceCalls['enroll']['input'],
  ): Promise<DeviceCalls['enroll']['output']> {
    const { pending, deviceId, tenantId, identity } = await this.serial(async () => {
      const taken = this.takePending(input.pendingId, 'enroll');
      const registration = await this.activeRegistration(taken.deviceId ?? '');
      return {
        pending: taken,
        deviceId: registration.deviceId,
        tenantId: registration.tenantId,
        identity: this.identity,
      };
    });
    const { enrollment, session } = await this.asDevice(
      { deviceId, tenantId },
      (token) => ({
        method: 'POST',
        path: '/api/devices/current/enrollments',
        headers: { [DEVICE_TOKEN_HEADER]: token, [TICKET_HEADER]: input.ticket },
        body: { userPublicKey: pending.userKey.publicKey },
      }),
      enrolledSchema,
    );
    if (enrollment.deviceId !== deviceId) throw new ServerRefusal('INTERNAL_ERROR');
    return this.serial(async () => {
      const registration = await this.activeRegistration(deviceId);
      registration.members = [
        ...registration.members.filter(
          (member) =>
            member.membershipId !== enrollment.membershipId &&
            member.enrollmentId !== enrollment.id,
        ),
        this.storedMember(pending, enrollment, input.memberName, []),
      ];
      this.observe(new Date(enrollment.lastConfirmedAt));
      const current = this.identity === identity;
      if (current) this.loaded.currentDeviceId = deviceId;
      await this.persist();
      return this.enrolled(current, deviceId, enrollment.id, pending.userKey, session);
    });
  }

  private async signDeviceToken(input: { deviceId: string; nonce: string }): Promise<string> {
    const registration = await this.registration(input.deviceId);
    if (!registration.deviceKey) throw new DeviceError('NOT_FOUND');
    const privateKey = this.protector.decrypt(Buffer.from(registration.deviceKey, 'base64'));
    try {
      return signMessage(privateKey, deviceTokenMessage(input.nonce, registration.deviceId));
    } finally {
      privateKey.fill(0);
    }
  }

  // PINs.

  /**
   * Rules 22 and 24: the PIN unwraps the member's key. Each attempt is counted, and written, before
   * the PIN is checked, so closing the app never resets the count; the fifth wrong one disables the
   * PIN. Outside the offline window the key only opens a session (`openSession`), which confirms
   * the enrollment again; until then nobody shows as unlocked.
   */
  private async unlock(input: DeviceCalls['unlock']['input']): Promise<UnlockResult> {
    const registration = await this.activeRegistration(input.deviceId);
    const member = this.member(registration, input.enrollmentId);
    const privateKey = await this.attempt(member, input.pin);
    if (privateKey === 'disabled') return { result: 'pin_disabled' };
    if (!privateKey) return { result: 'wrong_pin', attemptsLeft: this.attemptsLeft(member) };
    this.loaded.currentDeviceId = registration.deviceId;
    await this.persist();
    this.setUnlocked(registration.deviceId, member.enrollmentId, {
      publicKey: member.userPublicKey,
      privateKey,
    });
    return { result: 'unlocked', windowOpen: this.windowOpen(member) };
  }

  private attemptsLeft(member: StoredMember): number {
    return Math.max(0, pinPolicy.maxFailures - member.failedAttempts);
  }

  /** The member's private key for a right PIN; undefined for a wrong one; `disabled` after five. */
  private async attempt(
    member: StoredMember,
    pin: string,
  ): Promise<Buffer | undefined | 'disabled'> {
    if (member.failedAttempts >= pinPolicy.maxFailures) return 'disabled';
    member.failedAttempts += 1;
    await this.persist();
    const privateKey = await unwrapWithPin(
      member.wrappedKey,
      pin,
      userKeyContext(member.userPublicKey),
      this.protector,
    );
    if (!privateKey) return member.failedAttempts >= pinPolicy.maxFailures ? 'disabled' : undefined;
    member.failedAttempts = 0;
    await this.persist();
    return privateKey;
  }

  /**
   * Rule 22: an online password sign-in on this device re-enables the member's PIN. The main
   * process signs in itself, with the member's phone as the server lists it now (support may have
   * changed it, edge case 13) and its own device token, and re-enables the PIN only on the
   * server's `done`: the account is enrolled on this device.
   */
  private async reenablePin(
    input: DeviceCalls['reenablePin']['input'],
  ): Promise<DeviceCalls['reenablePin']['output']> {
    await this.refreshDevice(input.deviceId);
    const { deviceId, tenantId, phone, membershipId } = await this.serial(async () => {
      const registration = await this.activeRegistration(input.deviceId);
      const { phone, membershipId } = this.member(registration, input.enrollmentId);
      return {
        deviceId: registration.deviceId,
        tenantId: registration.tenantId,
        phone,
        membershipId,
      };
    });
    const { challenge, difficulty } = await ask(
      this.server,
      { method: 'POST', path: '/api/auth/pow' },
      proofOfWorkChallengeSchema,
    );
    const proofOfWork = { challenge, nonce: await solveProofOfWork(challenge, difficulty) };
    const result = await this.asDevice(
      { deviceId, tenantId, enrollmentId: input.enrollmentId },
      (token) => ({
        method: 'POST',
        path: '/api/auth/sign-in',
        headers: { [DEVICE_TOKEN_HEADER]: token },
        body: { phone, password: input.password, proofOfWork },
      }),
      signInResultSchema,
    );
    if (result.step === 'otp') return { result: 'otp', challengeId: result.challengeId };
    return this.serial(async () => {
      const member = this.member(await this.activeRegistration(deviceId), input.enrollmentId);
      if (member.membershipId !== membershipId) throw new DeviceError('NOT_FOUND');
      member.failedAttempts = 0;
      await this.persist();
      return { result: 'reenabled', view: await this.view() };
    });
  }

  /** Screen 11: a new PIN for the same key, on this computer only; the current PIN counts. */
  private async changePin(input: DeviceCalls['changePin']['input']): Promise<ChangePinResult> {
    const registration = await this.activeRegistration(input.deviceId);
    const member = this.member(registration, input.enrollmentId);
    if (isWeakPin(input.newPin, member.phone)) throw new DeviceError('PIN_WEAK');
    const privateKey = await this.attempt(member, input.currentPin);
    if (privateKey === 'disabled') return { result: 'pin_disabled' };
    if (!privateKey) return { result: 'wrong_pin', attemptsLeft: this.attemptsLeft(member) };
    try {
      member.wrappedKey = await wrapWithPin(
        privateKey,
        input.newPin,
        userKeyContext(member.userPublicKey),
        this.protector,
        this.cost,
      );
    } finally {
      privateKey.fill(0);
    }
    await this.persist();
    return { result: 'changed' };
  }

  // The unlocked member.

  private setUnlocked(
    deviceId: string,
    enrollmentId: string,
    key: KeyPair,
    session: SessionTokens | null = null,
  ): void {
    this.forgetUnlocked();
    const unlocked: Unlocked = {
      deviceId,
      enrollmentId,
      privateKey: key.privateKey,
      session,
      unlockedAt: this.monotonic(),
      wasConfirmed: false,
      confirmedUntil: 0,
    };
    this.unlocked = unlocked;
    unlocked.wasConfirmed = this.confirmed(unlocked);
    this.windowTimer = setInterval(() => {
      this.checkWindow().catch(() => undefined);
    }, WINDOW_CHECK_MS);
    this.windowTimer.unref?.();
  }

  private forgetUnlocked(): void {
    this.identity += 1;
    this.unlocked?.privateKey.fill(0);
    this.unlocked = undefined;
    if (this.windowTimer) clearInterval(this.windowTimer);
    this.windowTimer = undefined;
  }

  /**
   * Rule 24: the unlocked member counts as unlocked only while their offline window is open, or
   * for the window's length after a session confirmed this unlock.
   */
  private confirmed(unlocked: Unlocked): boolean {
    const member = this.loaded.registrations
      .find((item) => item.deviceId === unlocked.deviceId && item.status === 'active')
      ?.members.find((item) => item.enrollmentId === unlocked.enrollmentId);
    if (!member) return false;
    return this.windowOpen(member) || this.monotonic() < unlocked.confirmedUntil;
  }

  /**
   * Rule 24 during a session: the member is locked once their offline window closes (a session
   * opened since would have confirmed them again), and so is an unlock outside the window that
   * no session confirmed in time; the renderer hears it (`locked`). Runs every 30 seconds while a
   * member is unlocked, and when the computer wakes (`main.ts`).
   */
  checkWindow(): Promise<void> {
    return this.serial(async () => {
      const unlocked = this.unlocked;
      if (!unlocked) return;
      if (this.confirmed(unlocked)) {
        unlocked.wasConfirmed = true;
        return;
      }
      const waited = this.monotonic() - unlocked.unlockedAt;
      if (unlocked.wasConfirmed || waited >= UNCONFIRMED_UNLOCK_MS) {
        this.forgetUnlocked();
        this.onEvent({ type: 'locked' });
      }
    });
  }

  /** The confirmed unlocked member, their registration's tenant, and their session's access. */
  private currentSession(): DeviceCalls['session']['output'] {
    const unlocked = this.unlocked;
    if (!unlocked || !this.confirmed(unlocked)) return null;
    const registration = this.loaded.registrations.find(
      (item) => item.deviceId === unlocked.deviceId,
    );
    if (!registration) return null;
    return {
      deviceId: unlocked.deviceId,
      tenantId: registration.tenantId,
      enrollmentId: unlocked.enrollmentId,
      access: unlocked.session && grant(unlocked.session),
    };
  }

  private owns(unlocked: Unlocked, owner: { deviceId: string; enrollmentId: string }): boolean {
    return unlocked.deviceId === owner.deviceId && unlocked.enrollmentId === owner.enrollmentId;
  }

  /** The unlocked member, when they are `owner` on `owner`'s clinic; otherwise `NOT_UNLOCKED`. */
  private unlockedAs(owner: SessionOwner): Unlocked {
    const unlocked = this.unlocked;
    const registration = this.loaded.registrations.find(
      (item) => item.deviceId === owner.deviceId && item.status === 'active',
    );
    if (!unlocked || !this.owns(unlocked, owner) || registration?.tenantId !== owner.tenantId) {
      throw new DeviceError('NOT_UNLOCKED');
    }
    return unlocked;
  }

  /** `unlocked` is still the member unlocked: nobody locked or unlocked while the API answered. */
  private still(unlocked: Unlocked): Unlocked {
    if (this.unlocked !== unlocked) throw new DeviceError('NOT_UNLOCKED');
    return unlocked;
  }

  /**
   * Rule 23: a staff session for the unlocked member, the server's nonce signed with their key
   * here. The server rechecks the device, the enrollment, the membership, the branch and the
   * clinic, and confirms the enrollment again: the offline window starts over.
   */
  private async openSession(owner: SessionOwner): Promise<AccessGrant> {
    const unlocked = await this.serial(async () => this.unlockedAs(owner));
    const session = await this.asDevice(
      owner,
      async (token) => {
        const { nonce } = await ask(
          this.server,
          {
            method: 'POST',
            path: '/api/sessions/challenge',
            headers: { [DEVICE_TOKEN_HEADER]: token },
          },
          nonceSchema,
        );
        const signature = await this.serial(async () =>
          signMessage(
            this.still(unlocked).privateKey,
            staffSessionMessage(nonce, owner.deviceId, owner.enrollmentId),
          ),
        );
        return {
          method: 'POST',
          path: '/api/sessions',
          headers: { [DEVICE_TOKEN_HEADER]: token },
          body: { enrollmentId: owner.enrollmentId, nonce, signature },
        };
      },
      sessionTokensSchema,
    );
    return this.serial(async () => {
      this.still(unlocked).session = session;
      await this.confirmedBy(owner, unlocked, session);
      unlocked.wasConfirmed = this.confirmed(unlocked);
      return grant(session);
    });
  }

  /**
   * The server confirmed the enrollment when it opened `session`: this unlock counts as confirmed
   * for the window's length by the monotonic clock, and the stored confirmation moves to the
   * session's start by the server's clock (its access token's expiry less the token's lifetime),
   * never later than this computer's time. A clock set forward never stretches the window.
   */
  private async confirmedBy(
    owner: SessionOwner,
    unlocked: Unlocked,
    session: SessionTokens,
  ): Promise<void> {
    unlocked.confirmedUntil = this.monotonic() + OFFLINE_WINDOW_DAYS * 24 * 60 * 60_000;
    const member = this.member(await this.activeRegistration(owner.deviceId), owner.enrollmentId);
    const startedAt =
      Date.parse(session.accessTokenExpiresAt) - staffSessionPolicy.accessTokenMinutes * 60_000;
    const confirmedAt = new Date(Math.min(startedAt, this.trustedNow().getTime()));
    if (confirmedAt.getTime() > Date.parse(member.lastConfirmedAt)) {
      member.lastConfirmedAt = confirmedAt.toISOString();
      this.observe(confirmedAt);
      await this.persist();
    }
  }

  /** The session refreshed with the refresh token kept here; the renderer never sees that token. */
  private async refreshSession(
    input: DeviceCalls['refreshSession']['input'],
  ): Promise<AccessGrant> {
    const { unlocked, refreshToken } = await this.serial(async () => {
      const found = this.unlockedAs(input);
      if (!this.confirmed(found) || found.session?.sessionId !== input.sessionId) {
        throw new DeviceError('NOT_UNLOCKED');
      }
      return { unlocked: found, refreshToken: found.session.refreshToken };
    });
    let next: SessionTokens;
    try {
      next = await this.asDevice(
        input,
        (token) => ({
          method: 'POST',
          path: '/api/sessions/refresh',
          headers: { [DEVICE_TOKEN_HEADER]: token },
          body: { refreshToken },
        }),
        sessionTokensSchema,
      );
    } catch (error) {
      if (error instanceof ServerRefusal && error.code !== 'NETWORK_ERROR') {
        // The refresh token is spent or refused: a new session opens on the next request.
        await this.serial(async () => {
          if (this.unlocked === unlocked && unlocked.session?.sessionId === input.sessionId) {
            unlocked.session = null;
          }
        });
      }
      throw error;
    }
    return this.serial(async () => {
      this.still(unlocked).session = next;
      return grant(next);
    });
  }

  // Requests of the device.

  /**
   * A request of the registration's device, with a device token made for it here: the device key
   * signs the server's nonce. A refusal that ends the registration or the member acts here too
   * (`DEVICE_REVOKED` wipes the registration, `ENROLLMENT_REVOKED` deletes the member's key),
   * whatever the renderer does next.
   */
  private async asDevice<T>(
    target: { deviceId: string; tenantId: string; enrollmentId?: string },
    request: (token: string) => ServerRequest | Promise<ServerRequest>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const { deviceId, tenantId, enrollmentId } = target;
    try {
      const { nonce } = await ask(
        this.server,
        { method: 'POST', path: '/api/devices/token/challenge', body: { tenantId, deviceId } },
        nonceSchema,
      );
      const signature = await this.serial(() => this.signDeviceToken({ deviceId, nonce }));
      const { deviceToken } = await ask(
        this.server,
        {
          method: 'POST',
          path: '/api/devices/token',
          body: { tenantId, deviceId, nonce, signature, appVersion: this.appInfo.appVersion },
        },
        deviceTokenSchema,
      );
      return await ask(this.server, await request(deviceToken), schema);
    } catch (error) {
      if (error instanceof ServerRefusal) {
        if (error.code === 'DEVICE_REVOKED') {
          await this.serial(() => this.wipe(deviceId)).catch(() => undefined);
        }
        if (error.code === 'ENROLLMENT_REVOKED' && enrollmentId) {
          await this.serial(() => this.removeMember({ deviceId, enrollmentId })).catch(
            () => undefined,
          );
        }
      }
      throw error;
    }
  }

  /** The lock screen's data, read by the main process itself from `GET /api/devices/current`. */
  private async refreshDevice(deviceId: string): Promise<InstallationView> {
    const { tenantId } = await this.serial(() => this.activeRegistration(deviceId));
    const current = await this.asDevice(
      { deviceId, tenantId },
      (token) => ({
        method: 'GET',
        path: '/api/devices/current',
        headers: { [DEVICE_TOKEN_HEADER]: token },
      }),
      currentDeviceSchema,
    );
    if (current.device.id !== deviceId) throw new ServerRefusal('INTERNAL_ERROR');
    return this.serial(() => this.updateDevice(current));
  }

  // What the server says about the registration.

  /**
   * The lock screen's data from `GET /api/devices/current`: the clinic, the branch, the members
   * and when the server last confirmed each. A member the server no longer lists was removed from
   * this computer (rule 8): their key is deleted.
   */
  private async updateDevice(current: CurrentDevice): Promise<InstallationView> {
    const registration = await this.registration(current.device.id);
    if (registration.status !== 'active' || registration.tenantId !== current.tenant.id) {
      return this.view();
    }
    registration.clinicName = current.tenant.nameAr;
    registration.clinicNameLatin = current.tenant.nameLatin;
    registration.idleLockMinutes = current.tenant.idleLockMinutes;
    registration.facilityName = current.facility?.name ?? null;
    const listed = new Map(current.members.map((member) => [member.enrollmentId, member]));
    registration.members = registration.members.flatMap((member) => {
      const server = listed.get(member.enrollmentId);
      if (!server) return [];
      this.observe(new Date(server.lastConfirmedAt));
      const lastConfirmedAt =
        Date.parse(server.lastConfirmedAt) > Date.parse(member.lastConfirmedAt)
          ? server.lastConfirmedAt
          : member.lastConfirmedAt;
      return [
        { ...member, name: server.name, phone: server.phone, roles: server.roles, lastConfirmedAt },
      ];
    });
    const unlocked = this.unlocked;
    if (
      unlocked?.deviceId === registration.deviceId &&
      !registration.members.some((member) => member.enrollmentId === unlocked.enrollmentId)
    ) {
      this.forgetUnlocked();
    }
    await this.persist();
    return this.view();
  }

  /** `ENROLLMENT_REVOKED`: the member's key on this computer is deleted. */
  private async removeMember(input: {
    deviceId: string;
    enrollmentId: string;
  }): Promise<InstallationView> {
    const registration = await this.registration(input.deviceId);
    registration.members = registration.members.filter(
      (member) => member.enrollmentId !== input.enrollmentId,
    );
    if (this.unlocked?.enrollmentId === input.enrollmentId) this.forgetUnlocked();
    await this.persist();
    return this.view();
  }

  // Revocation (rule 29).

  /**
   * Deletes what this registration holds on the installation: its members' keys, its clinic's
   * logo (and, from S04, its database). The device key stays until the server confirms the wipe,
   * because the confirmation needs a device token. Other registrations are untouched.
   */
  private async wipe(deviceId: string): Promise<InstallationView> {
    const registration = await this.registration(deviceId);
    registration.status = 'wiped';
    registration.members = [];
    registration.logo = null;
    registration.facilityName = null;
    if (this.unlocked?.deviceId === deviceId) this.forgetUnlocked();
    await this.persist();
    return this.view();
  }

  /**
   * Tells the server a wiped registration's data is gone (`POST /api/devices/current/wiped`),
   * then forgets its device key. The main process asks itself: the server records the wipe of a
   * revoked device only, and refuses a device token once it has (`DEVICE_REVOKED`), which also
   * means confirmed. An active registration is left as it is.
   */
  private async confirmWipe(deviceId: string): Promise<InstallationView> {
    const { status, deviceKey, tenantId } = await this.serial(() => this.registration(deviceId));
    if (status !== 'wiped' || !deviceKey) return this.serial(() => this.view());
    let confirmed: boolean;
    try {
      const { wipedAt } = await this.asDevice(
        { deviceId, tenantId },
        (token) => ({
          method: 'POST',
          path: '/api/devices/current/wiped',
          headers: { [DEVICE_TOKEN_HEADER]: token },
        }),
        deviceWipedSchema,
      );
      confirmed = wipedAt !== null;
    } catch (error) {
      if (!(error instanceof ServerRefusal && error.code === 'DEVICE_REVOKED')) throw error;
      confirmed = true;
    }
    return this.serial(async () => {
      const registration = await this.registration(deviceId);
      if (confirmed && registration.status === 'wiped') {
        registration.deviceKey = null;
        await this.persist();
      }
      return this.view();
    });
  }

  /** The owner read the wipe notice: the registration's name goes too. */
  private async dismissWiped(deviceId: string): Promise<InstallationView> {
    const registration = await this.registration(deviceId);
    if (registration.status !== 'wiped' || registration.deviceKey) {
      throw new DeviceError('INVALID_INPUT');
    }
    this.loaded.registrations = this.loaded.registrations.filter((item) => item !== registration);
    if (this.loaded.currentDeviceId === deviceId) {
      this.loaded.currentDeviceId = this.loaded.registrations[0]?.deviceId ?? null;
    }
    await this.persist();
    return this.view();
  }
}
