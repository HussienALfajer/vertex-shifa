import { randomUUID } from 'node:crypto';
import {
  type CurrentDevice,
  deviceTokenMessage,
  isWeakPin,
  offlineWindow,
  pinPolicy,
  type Role,
  type SessionTokens,
  staffSessionMessage,
} from '@vertex-shifa/contracts';
import type {
  ChangePinResult,
  ClinicLogo,
  DeviceCalls,
  DeviceErrorCode,
  InstallationView,
  MemberView,
  PreparedKeys,
  RegistrationView,
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
  session: SessionTokens | null;
  /**
   * Rule 24: within the offline window, or confirmed by a session opened since. Until then the
   * key only signs the session nonce, and the view reports no member unlocked.
   */
  confirmed: boolean;
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

const userKeyContext = (publicKey: string) => `vertex-shifa/user-key/v1\n${publicKey}`;

const emptyState = (now: Date): StoredState => ({
  version: 1,
  highestSeenAt: now.toISOString(),
  currentDeviceId: null,
  registrations: [],
});

/**
 * The identity of one installation of the clinic app (spec S02 rules 18–29, ADR 0021, ADR 0024):
 * its clinic registrations, each with its device key and enrolled members; the PIN that unwraps a
 * member's user key, with the 5-attempt lockout and the 7-day offline window measured against the
 * highest time seen; the unlocked member and their session; the wipe of one registration. Calls
 * run one at a time, so two PIN attempts never race past the counter.
 */
export class Installation {
  private state: StoredState | undefined;
  private persistedHighestSeen = 0;
  private readonly pending = new Map<string, Pending>();
  private unlocked: Unlocked | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly store: StateStore,
    private readonly protector: Protector,
    private readonly now: () => Date = () => new Date(),
    private readonly cost: PinCost = pinCost,
  ) {}

  /** The bridge's calls about identity, by name. */
  readonly calls: InstallationCalls = {
    view: () => this.serial(() => this.view()),
    select: (input) => this.serial(() => this.select(input.deviceId)),
    prepareKeys: (input) => this.serial(() => this.prepareKeys(input)),
    completeRegistration: (input) => this.serial(() => this.completeRegistration(input)),
    completeEnrollment: (input) => this.serial(() => this.completeEnrollment(input)),
    discardKeys: (input) =>
      this.serial(async () => {
        this.pending.delete(input.pendingId);
        return null;
      }),
    signDeviceToken: (input) => this.serial(() => this.signDeviceToken(input)),
    unlock: (input) => this.serial(() => this.unlock(input)),
    signSession: (input) => this.serial(async () => this.signSession(input.nonce)),
    session: () => this.serial(async () => this.currentSession()),
    setSession: (input) => this.serial(async () => this.setSession(input)),
    lock: () =>
      this.serial(async () => {
        this.forgetUnlocked();
        return this.view();
      }),
    updateDevice: (input) => this.serial(() => this.updateDevice(input.current)),
    setLogo: (input) =>
      this.serial(async () => {
        const registration = await this.registration(input.deviceId);
        if (registration.status === 'active') {
          registration.logo = input.logo;
          await this.persist();
        }
        return null;
      }),
    reenablePin: (input) => this.serial(() => this.reenablePin(input)),
    changePin: (input) => this.serial(() => this.changePin(input)),
    removeMember: (input) => this.serial(() => this.removeMember(input)),
    wipe: (input) => this.serial(() => this.wipe(input.deviceId)),
    wipeConfirmed: (input) => this.serial(() => this.wipeConfirmed(input.deviceId)),
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

  /** Rule 24: moves the highest-seen time forward to `time`, never back. */
  private observe(time: Date): void {
    if (time.getTime() > Date.parse(this.loaded.highestSeenAt)) {
      this.loaded.highestSeenAt = time.toISOString();
    }
  }

  // Views.

  private async view(): Promise<InstallationView> {
    const now = this.now();
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
      unlocked: unlocked?.confirmed
        ? { deviceId: unlocked.deviceId, enrollmentId: unlocked.enrollmentId }
        : null,
      clockBehind: now.getTime() < highestSeenAt.getTime() - CLOCK_TOLERANCE_MS,
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

  private member(registration: StoredRegistration, enrollmentId: string): StoredMember {
    const found = registration.members.find((member) => member.enrollmentId === enrollmentId);
    if (!found) throw new DeviceError('NOT_FOUND');
    return found;
  }

  /** Rule 26: switching clinic locks the current one. */
  private async select(deviceId: string): Promise<InstallationView> {
    await this.registration(deviceId);
    if (this.unlocked && this.unlocked.deviceId !== deviceId) this.forgetUnlocked();
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
      const registered = this.loaded.registrations.some(
        (item) => item.tenantId === input.tenantId && item.status === 'active',
      );
      if (registered) throw new DeviceError('ALREADY_REGISTERED');
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
    member: { enrollmentId: string; membershipId: string; name: string; roles: Role[] },
    lastConfirmedAt: string,
  ): StoredMember {
    return {
      ...member,
      phone: pending.phone,
      lastConfirmedAt,
      userPublicKey: pending.userKey.publicKey,
      wrappedKey: pending.wrappedKey,
      failedAttempts: 0,
    };
  }

  /** Rule 18: the API registered the computer and enrolled the member; the session is open. */
  private async completeRegistration(
    input: DeviceCalls['completeRegistration']['input'],
  ): Promise<InstallationView> {
    const pending = this.takePending(input.pendingId, 'register');
    if (pending.tenantId !== input.tenantId || !pending.deviceKey) {
      throw new DeviceError('INVALID_INPUT');
    }
    const registered = this.loaded.registrations.some(
      (item) => item.tenantId === input.tenantId && item.status === 'active',
    );
    if (registered) throw new DeviceError('ALREADY_REGISTERED');
    // A wiped registration to the same clinic gives way to the new one.
    this.loaded.registrations = this.loaded.registrations.filter(
      (item) => item.tenantId !== input.tenantId,
    );
    this.loaded.registrations.push({
      deviceId: input.deviceId,
      tenantId: input.tenantId,
      clinicName: input.clinicName,
      clinicNameLatin: input.clinicNameLatin,
      facilityName: input.facilityName,
      idleLockMinutes: DEFAULT_IDLE_LOCK_MINUTES,
      logo: null,
      status: 'active',
      deviceKey: this.protector.encrypt(pending.deviceKey.privateKey).toString('base64'),
      members: [this.storedMember(pending, input.member, input.lastConfirmedAt)],
    });
    this.observe(new Date(input.lastConfirmedAt));
    this.loaded.currentDeviceId = input.deviceId;
    await this.persist();
    this.setUnlocked(input.deviceId, input.member.enrollmentId, pending.userKey, input.session);
    return this.view();
  }

  /**
   * Rules 20 and 22: a member enrolled on this registration. A member enrolled here before (a
   * forgotten PIN) is replaced with the new key and PIN.
   */
  private async completeEnrollment(
    input: DeviceCalls['completeEnrollment']['input'],
  ): Promise<InstallationView> {
    const pending = this.takePending(input.pendingId, 'enroll');
    const registration = await this.activeRegistration(pending.deviceId ?? '');
    registration.members = [
      ...registration.members.filter(
        (member) =>
          member.membershipId !== input.member.membershipId &&
          member.enrollmentId !== input.member.enrollmentId,
      ),
      this.storedMember(pending, input.member, input.lastConfirmedAt),
    ];
    this.observe(new Date(input.lastConfirmedAt));
    this.loaded.currentDeviceId = registration.deviceId;
    await this.persist();
    this.setUnlocked(
      registration.deviceId,
      input.member.enrollmentId,
      pending.userKey,
      input.session,
    );
    return this.view();
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
   * PIN. Outside the offline window the key only signs a session nonce until a session opened
   * with it confirms the enrollment again (`setSession`).
   */
  private async unlock(input: DeviceCalls['unlock']['input']): Promise<UnlockResult> {
    const registration = await this.activeRegistration(input.deviceId);
    const member = this.member(registration, input.enrollmentId);
    const privateKey = await this.attempt(member, input.pin);
    if (privateKey === 'disabled') return { result: 'pin_disabled' };
    if (!privateKey) return { result: 'wrong_pin', attemptsLeft: this.attemptsLeft(member) };
    this.loaded.currentDeviceId = registration.deviceId;
    await this.persist();
    const now = this.now();
    const { windowOpen } = this.memberView(member, now, new Date(this.loaded.highestSeenAt));
    this.setUnlocked(
      registration.deviceId,
      member.enrollmentId,
      { publicKey: member.userPublicKey, privateKey },
      null,
      windowOpen,
    );
    return { result: 'unlocked', windowOpen };
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

  /** Rule 22: an online password sign-in on this device re-enables the member's PIN. */
  private async reenablePin(input: {
    deviceId: string;
    enrollmentId: string;
  }): Promise<InstallationView> {
    const registration = await this.activeRegistration(input.deviceId);
    this.member(registration, input.enrollmentId).failedAttempts = 0;
    await this.persist();
    return this.view();
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
    confirmed = true,
  ): void {
    this.forgetUnlocked();
    this.unlocked = { deviceId, enrollmentId, privateKey: key.privateKey, session, confirmed };
  }

  /** The unlocked member, their registration's tenant, and their session if one is open. */
  private currentSession(): DeviceCalls['session']['output'] {
    const unlocked = this.unlocked;
    if (!unlocked) return null;
    const registration = this.loaded.registrations.find(
      (item) => item.deviceId === unlocked.deviceId,
    );
    if (!registration) return null;
    return {
      deviceId: unlocked.deviceId,
      tenantId: registration.tenantId,
      enrollmentId: unlocked.enrollmentId,
      session: unlocked.session,
    };
  }

  /**
   * A session for the member it was opened for: refused when another member, or another clinic,
   * was unlocked meanwhile. A session confirms a member unlocked outside the offline window.
   */
  private setSession(input: DeviceCalls['setSession']['input']): null {
    const unlocked = this.requireUnlocked();
    if (unlocked.deviceId !== input.deviceId || unlocked.enrollmentId !== input.enrollmentId) {
      throw new DeviceError('NOT_UNLOCKED');
    }
    unlocked.session = input.session;
    if (input.session) unlocked.confirmed = true;
    return null;
  }

  private forgetUnlocked(): void {
    this.unlocked?.privateKey.fill(0);
    this.unlocked = undefined;
  }

  private requireUnlocked(): Unlocked {
    if (!this.unlocked) throw new DeviceError('NOT_UNLOCKED');
    return this.unlocked;
  }

  /** Rule 23: the member's signature of a session nonce, bound to this device and enrollment. */
  private signSession(nonce: string): DeviceCalls['signSession']['output'] {
    const unlocked = this.requireUnlocked();
    const message = staffSessionMessage(nonce, unlocked.deviceId, unlocked.enrollmentId);
    return {
      deviceId: unlocked.deviceId,
      enrollmentId: unlocked.enrollmentId,
      signature: signMessage(unlocked.privateKey, message),
    };
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
      return [{ ...member, name: server.name, roles: server.roles, lastConfirmedAt }];
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

  private async wipeConfirmed(deviceId: string): Promise<InstallationView> {
    const registration = await this.registration(deviceId);
    if (registration.status !== 'wiped') throw new DeviceError('INVALID_INPUT');
    registration.deviceKey = null;
    await this.persist();
    return this.view();
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
