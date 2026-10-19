import { randomUUID } from 'node:crypto';
import type { Request, Route } from '@playwright/test';
import {
  type CurrentDevice,
  deviceTokenMessage,
  type ErrorCode,
  effectivePermissions,
  enrollSchema,
  errorStatus,
  isWeakPassword,
  type Me,
  openSessionSchema,
  type PermissionKey,
  type Practitioner,
  type Role,
  registerDeviceSchema,
  type SessionTokens,
  signInSchema,
  staffSessionMessage,
  type TenantStatus,
} from '@vertex-shifa/contracts';
import { verifySignature } from '../electron/identity/test-support.js';
import type { DeviceBridge } from './device-bridge.js';

/**
 * An in-memory stand-in for the S02 sign-in, device and session routes of `apps/api/openapi.json`
 * (spec S02 "API and commands"), with the rules the screens react to: the password lock, OTPs (the
 * fake sender's code is `otpCode`), tickets, device keys and user keys checked by their Ed25519
 * signatures, revocation and the wipe confirmation. Synthetic data only.
 */

export const otpCode = '135790';
export const ownerPhone = '+963900000101';
export const receptionistPhone = '+963900000102';
export const ownerPassword = 'synthetic-owner-pass';
export const receptionistPassword = 'synthetic-reception-pass';
/** The PIN of the members the tests sign in before the page opens. */
export const seededPin = '258147';

export type Clinic = {
  tenantId: string;
  nameAr: string;
  nameLatin: string | null;
  status: TenantStatus;
  idleLockMinutes: number;
  branches: { id: string; name: string }[];
};

/** A membership with what the staff screens read and change (`mock-staff.ts`). */
export type Membership = {
  id: string;
  tenantId: string;
  roles: Role[];
  status: 'invited' | 'active' | 'deactivated';
  allFacilities: boolean;
  facilityIds: string[];
  granted: PermissionKey[];
  revoked: PermissionKey[];
  invitationExpiresAt: string | null;
  invitationMessageStatus: 'pending' | 'sent' | 'failed' | null;
  acceptedAt: string | null;
  deactivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
};

export type Account = {
  id: string;
  phone: string;
  name: string | null;
  invitedName: string;
  password: string | null;
  failures: number;
  memberships: Membership[];
};

export type Device = {
  id: string;
  tenantId: string;
  facilityId: string | null;
  name: string;
  publicKey: string;
  status: 'active' | 'revoked';
  wipedAt: string | null;
  revokedAt?: string | null;
};

type Enrollment = {
  id: string;
  deviceId: string;
  membershipId: string;
  publicKey: string;
  lastConfirmedAt: string;
  revokedAt: string | null;
};

export type Session = {
  tokens: SessionTokens;
  membershipId: string;
  deviceId: string;
  enrollmentId: string;
  ended: boolean;
};

export type MockIdentity = {
  clinics: Clinic[];
  accounts: Account[];
  devices: Device[];
  enrollments: Enrollment[];
  sessions: Session[];
  /** OTP challenges by id: the account (none for an unknown phone) and its purpose. */
  challenges: Map<
    string,
    { accountId: string | null; purpose: 'device_sign_in' | 'first_sign_in' }
  >;
  tickets: Map<string, { accountId: string; purpose: 'set_password' | 'signed_in' }>;
  deviceTokens: Map<string, string>;
  /** Doctor profiles (`mock-staff.ts`), archived when the doctor role goes. */
  practitioners: (Practitioner & { archivedAt: string | null })[];
  /** Revokes a device as an owner would from another computer (rule 29). */
  revoke: (deviceId: string) => void;
  /** Ends a session on the server, as a password reset or a deactivation would. */
  endSessions: () => void;
};

const now = () => new Date().toISOString();

/** The clinics are live objects: the mock of S01 routes keeps their branches and status. */
export function createIdentity(clinics: Clinic[]): MockIdentity {
  const identity: MockIdentity = {
    clinics,
    accounts: [],
    devices: [],
    enrollments: [],
    sessions: [],
    challenges: new Map(),
    tickets: new Map(),
    deviceTokens: new Map(),
    practitioners: [],
    revoke: (deviceId) => {
      const device = identity.devices.find((item) => item.id === deviceId);
      if (device) {
        device.status = 'revoked';
        device.revokedAt ??= now();
      }
      for (const enrollment of identity.enrollments) {
        if (enrollment.deviceId === deviceId) enrollment.revokedAt ??= now();
      }
    },
    endSessions: () => {
      for (const session of identity.sessions) session.ended = true;
    },
  };
  return identity;
}

/** An account with a membership in `tenantId`: active with a password, or invited without one. */
export function addMember(
  identity: MockIdentity,
  input: {
    tenantId: string;
    phone: string;
    name: string;
    roles: Role[];
    password: string | null;
  },
): Account {
  let account = identity.accounts.find((item) => item.phone === input.phone);
  if (!account) {
    account = {
      id: randomUUID(),
      phone: input.phone,
      name: input.password ? input.name : null,
      invitedName: input.name,
      password: input.password,
      failures: 0,
      memberships: [],
    };
    identity.accounts.push(account);
  }
  const at = now();
  const invited = !input.password;
  account.memberships.push({
    id: randomUUID(),
    tenantId: input.tenantId,
    roles: input.roles,
    status: invited ? 'invited' : 'active',
    allFacilities: true,
    facilityIds: [],
    granted: [],
    revoked: [],
    invitationExpiresAt: invited ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null,
    invitationMessageStatus: invited ? 'pending' : null,
    acceptedAt: invited ? null : at,
    deactivatedAt: null,
    createdAt: at,
    updatedAt: at,
    archivedAt: null,
  });
  return account;
}

/** First sign-in: every pending invitation of the account becomes active (rule 15). */
function accept(membership: Membership) {
  const at = now();
  Object.assign(membership, {
    status: 'active',
    acceptedAt: at,
    invitationExpiresAt: null,
    invitationMessageStatus: null,
    updatedAt: at,
  });
}

function issueSession(
  identity: MockIdentity,
  membershipId: string,
  deviceId: string,
  enrollmentId: string,
): SessionTokens {
  const tokens: SessionTokens = {
    sessionId: randomUUID(),
    accessToken: `access-${randomUUID()}`,
    accessTokenExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    refreshToken: `refresh-${randomUUID()}`,
    expiresAt: new Date(Date.now() + 12 * 60 * 60_000).toISOString(),
  };
  identity.sessions.push({ tokens, membershipId, deviceId, enrollmentId, ended: false });
  return tokens;
}

function enroll(identity: MockIdentity, device: Device, membership: Membership, publicKey: string) {
  for (const previous of identity.enrollments) {
    if (previous.deviceId === device.id && previous.membershipId === membership.id) {
      previous.revokedAt ??= now();
    }
  }
  const enrollment: Enrollment = {
    id: randomUUID(),
    deviceId: device.id,
    membershipId: membership.id,
    publicKey,
    lastConfirmedAt: now(),
    revokedAt: null,
  };
  identity.enrollments.push(enrollment);
  const session = issueSession(identity, membership.id, device.id, enrollment.id);
  return {
    enrollment: {
      id: enrollment.id,
      deviceId: device.id,
      membershipId: membership.id,
      lastConfirmedAt: enrollment.lastConfirmedAt,
    },
    session,
  };
}

/**
 * Registers the computer of `bridge` to the clinic for `account`, as the registration screen
 * would, and leaves the member unlocked with an open session: the app opens signed in.
 */
export async function signInBeforehand(
  identity: MockIdentity,
  bridge: DeviceBridge,
  account: Account,
  tenantId: string,
  options: { facilityId?: string | null; locked?: boolean } = {},
): Promise<Device> {
  const membership = account.memberships.find((item) => item.tenantId === tenantId);
  const clinic = identity.clinics.find((item) => item.tenantId === tenantId);
  if (!membership || !clinic) throw new Error('Not a member of this clinic');
  const keys = await bridge.installation.calls.prepareKeys({
    tenantId,
    phone: account.phone,
    pin: seededPin,
  });
  const device: Device = {
    id: randomUUID(),
    tenantId,
    facilityId: options.facilityId ?? clinic.branches[0]?.id ?? null,
    name: 'حاسوب الاستقبال',
    publicKey: keys.devicePublicKey ?? '',
    status: 'active',
    wipedAt: null,
  };
  identity.devices.push(device);
  const enrolled = enroll(identity, device, membership, keys.userPublicKey);
  await bridge.installation.calls.completeRegistration({
    pendingId: keys.pendingId,
    deviceId: device.id,
    tenantId,
    clinicName: clinic.nameAr,
    clinicNameLatin: clinic.nameLatin,
    facilityName: clinic.branches.find((item) => item.id === device.facilityId)?.name ?? null,
    member: {
      enrollmentId: enrolled.enrollment.id,
      membershipId: membership.id,
      name: account.name ?? account.invitedName,
      roles: membership.roles,
    },
    lastConfirmedAt: enrolled.enrollment.lastConfirmedAt,
    session: enrolled.session,
  });
  // What the app learns from the server once the session opened: the clinic's idle minutes.
  await bridge.installation.calls.updateDevice({ current: currentDeviceOf(identity, device) });
  if (options.locked) await bridge.installation.calls.lock(null);
  return device;
}

/** Enrolls another member on a registered computer, as "Another user" would. */
export async function enrollBeforehand(
  identity: MockIdentity,
  bridge: DeviceBridge,
  account: Account,
  device: Device,
): Promise<void> {
  const membership = account.memberships.find((item) => item.tenantId === device.tenantId);
  if (!membership) throw new Error('Not a member of this clinic');
  const keys = await bridge.installation.calls.prepareKeys({
    deviceId: device.id,
    phone: account.phone,
    pin: seededPin,
  });
  const enrolled = enroll(identity, device, membership, keys.userPublicKey);
  await bridge.installation.calls.completeEnrollment({
    pendingId: keys.pendingId,
    member: {
      enrollmentId: enrolled.enrollment.id,
      membershipId: membership.id,
      name: account.name ?? account.invitedName,
      roles: membership.roles,
    },
    lastConfirmedAt: enrolled.enrollment.lastConfirmedAt,
    session: enrolled.session,
  });
  await bridge.installation.calls.lock(null);
}

/** The member's doctor profile, while they have the doctor role. */
export function practitionerOf(identity: MockIdentity, membershipId: string): Practitioner | null {
  const found = identity.practitioners.find(
    (item) => item.membershipId === membershipId && item.archivedAt === null,
  );
  if (!found) return null;
  const { archivedAt: _, ...practitioner } = found;
  return practitioner;
}

const accountOfMembership = (identity: MockIdentity, membershipId: string) =>
  identity.accounts.find((account) =>
    account.memberships.some((membership) => membership.id === membershipId),
  );

const membershipOfId = (identity: MockIdentity, membershipId: string) =>
  accountOfMembership(identity, membershipId)?.memberships.find(
    (membership) => membership.id === membershipId,
  );

/** `GET /api/devices/current`: what the lock screen shows of a registration. */
export function currentDeviceOf(identity: MockIdentity, device: Device): CurrentDevice {
  const clinic = identity.clinics.find((item) => item.tenantId === device.tenantId) as Clinic;
  return {
    device: {
      id: device.id,
      tenantId: device.tenantId,
      facilityId: device.facilityId,
      name: device.name,
      status: device.status,
    },
    tenant: {
      id: clinic.tenantId,
      nameAr: clinic.nameAr,
      nameLatin: clinic.nameLatin,
      status: clinic.status,
      idleLockMinutes: clinic.idleLockMinutes,
    },
    facility: clinic.branches.find((branch) => branch.id === device.facilityId) ?? null,
    members: identity.enrollments
      .filter((item) => item.deviceId === device.id && !item.revokedAt)
      .flatMap((item) => {
        const account = accountOfMembership(identity, item.membershipId);
        const membership = membershipOfId(identity, item.membershipId);
        if (!account || !membership) return [];
        return [
          {
            enrollmentId: item.id,
            membershipId: item.membershipId,
            name: account.name ?? account.invitedName,
            roles: membership.roles,
            lastConfirmedAt: item.lastConfirmedAt,
          },
        ];
      }),
  };
}

type Answer = (route: Route) => Promise<void>;

/**
 * Answers the identity routes; `undefined` for every other path. `staff` checks the access token
 * of the other routes: the session, its device and its enrollment.
 */
export function identityRoutes(identity: MockIdentity) {
  const refuse =
    (code: ErrorCode): Answer =>
    (route) =>
      route.fulfill({ status: errorStatus[code], json: { code, message: code } });
  const ok =
    (json: unknown, status = 200): Answer =>
    (route) =>
      route.fulfill({ status, json });

  const ticketOf = (request: Request, purpose: 'set_password' | 'signed_in') => {
    const ticket = identity.tickets.get(request.headers()['x-sign-in-ticket'] ?? '');
    return ticket?.purpose === purpose ? ticket : undefined;
  };
  const issueTicket = (accountId: string, purpose: 'set_password' | 'signed_in') => {
    const ticket = `ticket-${randomUUID()}`;
    identity.tickets.set(ticket, { accountId, purpose });
    return ticket;
  };
  const deviceOf = (request: Request) => {
    const id = identity.deviceTokens.get(request.headers()['x-device-token'] ?? '');
    return identity.devices.find((item) => item.id === id);
  };
  const accountOf = (membershipId: string) =>
    identity.accounts.find((account) =>
      account.memberships.some((membership) => membership.id === membershipId),
    );
  const membershipOf = (membershipId: string) =>
    accountOf(membershipId)?.memberships.find((membership) => membership.id === membershipId);

  /** The open session of an access token, or the refusal the session guard would answer. */
  function staff(request: Request): Session | ErrorCode {
    const match = /^Bearer (\S+)$/.exec(request.headers().authorization ?? '');
    const session = identity.sessions.find((item) => item.tokens.accessToken === match?.[1]);
    if (!session) return 'UNAUTHENTICATED';
    if (session.ended) return 'SESSION_ENDED';
    const device = identity.devices.find((item) => item.id === session.deviceId);
    if (device?.status !== 'active') return 'DEVICE_REVOKED';
    const enrollment = identity.enrollments.find((item) => item.id === session.enrollmentId);
    if (enrollment?.revokedAt) return 'ENROLLMENT_REVOKED';
    if (membershipOf(session.membershipId)?.status !== 'active') return 'MEMBERSHIP_INACTIVE';
    return session;
  }

  function handle(request: Request, path: string, method: string): Answer | undefined {
    const body = () => request.postDataJSON() as Record<string, unknown>;

    if (path === '/api/auth/pow' && method === 'POST') {
      return ok({ challenge: `pow-${randomUUID()}`, difficulty: 0, expiresAt: now() });
    }

    if (path === '/api/auth/sign-in' && method === 'POST') {
      const parsed = signInSchema.safeParse(body());
      if (!parsed.success) return refuse('VALIDATION_FAILED');
      const account = identity.accounts.find((item) => item.phone === parsed.data.phone);
      if (!account?.password) return refuse('INVALID_CREDENTIALS');
      if (account.failures >= 5) return refuse('RATE_LIMITED');
      if (account.password !== parsed.data.password) {
        account.failures += 1;
        return refuse(account.failures >= 5 ? 'RATE_LIMITED' : 'INVALID_CREDENTIALS');
      }
      account.failures = 0;
      const device = deviceOf(request);
      const enrolled =
        device?.status === 'active' &&
        identity.enrollments.some(
          (item) =>
            item.deviceId === device.id &&
            !item.revokedAt &&
            account.memberships.some((membership) => membership.id === item.membershipId),
        );
      if (enrolled) return ok({ step: 'done', ticket: issueTicket(account.id, 'signed_in') });
      const challengeId = randomUUID();
      identity.challenges.set(challengeId, { accountId: account.id, purpose: 'device_sign_in' });
      return ok({ step: 'otp', challengeId });
    }

    if (path === '/api/auth/otp/request' && method === 'POST') {
      const { phone } = body() as { phone: string };
      const account = identity.accounts.find(
        (item) =>
          item.phone === phone &&
          item.password === null &&
          item.memberships.some(
            (membership) => membership.status === 'invited' && !membership.archivedAt,
          ),
      );
      const challengeId = randomUUID();
      identity.challenges.set(challengeId, {
        accountId: account?.id ?? null,
        purpose: 'first_sign_in',
      });
      return ok({ challengeId });
    }

    if (path === '/api/auth/otp/resend' && method === 'POST') {
      const { challengeId } = body() as { challengeId: string };
      return identity.challenges.has(challengeId) ? ok({ challengeId }) : refuse('OTP_EXPIRED');
    }

    if (path === '/api/auth/otp/verify' && method === 'POST') {
      const { challengeId, code } = body() as { challengeId: string; code: string };
      const challenge = identity.challenges.get(challengeId);
      if (!challenge) return refuse('OTP_EXPIRED');
      const account = identity.accounts.find((item) => item.id === challenge.accountId);
      if (code !== otpCode || !account) return refuse('OTP_INVALID');
      identity.challenges.delete(challengeId);
      if (challenge.purpose === 'device_sign_in') {
        for (const membership of account.memberships) {
          if (membership.status === 'invited' && !membership.archivedAt) accept(membership);
        }
        return ok({
          ticket: issueTicket(account.id, 'signed_in'),
          needsPassword: false,
          needsName: account.name === null,
          suggestedName: account.name,
        });
      }
      return ok({
        ticket: issueTicket(account.id, 'set_password'),
        needsPassword: true,
        needsName: account.name === null,
        suggestedName: account.name ?? account.invitedName,
      });
    }

    if (path === '/api/auth/password' && method === 'POST') {
      const ticket = ticketOf(request, 'set_password');
      const account = identity.accounts.find((item) => item.id === ticket?.accountId);
      if (!account) return refuse('TICKET_INVALID');
      const { name, password } = body() as { name: string; password: string };
      if (password.length < 10 || isWeakPassword(password, account.phone)) {
        return refuse('PASSWORD_TOO_WEAK');
      }
      account.name = name;
      account.password = password;
      for (const membership of account.memberships) {
        if (membership.status === 'invited' && !membership.archivedAt) accept(membership);
      }
      identity.tickets.delete(request.headers()['x-sign-in-ticket'] ?? '');
      return ok({ ticket: issueTicket(account.id, 'signed_in') });
    }

    if (path === '/api/auth/registration-options' && method === 'GET') {
      const ticket = ticketOf(request, 'signed_in');
      const account = identity.accounts.find((item) => item.id === ticket?.accountId);
      if (!account) return refuse('TICKET_INVALID');
      const clinics = account.memberships.flatMap((membership) => {
        const clinic = identity.clinics.find((item) => item.tenantId === membership.tenantId);
        if (!clinic || membership.status !== 'active') return [];
        if (!effectivePermissions(membership.roles, [], []).includes('devices.manage')) return [];
        return [
          {
            tenantId: clinic.tenantId,
            nameAr: clinic.nameAr,
            nameLatin: clinic.nameLatin,
            status: clinic.status,
            roles: membership.roles,
            branches: clinic.branches,
          },
        ];
      });
      return ok({ clinics });
    }

    if (path === '/api/devices' && method === 'POST') {
      const ticket = ticketOf(request, 'signed_in');
      const account = identity.accounts.find((item) => item.id === ticket?.accountId);
      if (!account) return refuse('TICKET_INVALID');
      const parsed = registerDeviceSchema.safeParse(body());
      if (!parsed.success) return refuse('VALIDATION_FAILED');
      const membership = account.memberships.find((item) => item.tenantId === parsed.data.tenantId);
      if (membership?.status !== 'active') return refuse('FORBIDDEN');
      if (identity.devices.some((item) => item.publicKey === parsed.data.publicKey)) {
        return refuse('CONFLICT');
      }
      identity.tickets.delete(request.headers()['x-sign-in-ticket'] ?? '');
      const device: Device = {
        id: randomUUID(),
        tenantId: parsed.data.tenantId,
        facilityId: parsed.data.facilityId,
        name: parsed.data.name,
        publicKey: parsed.data.publicKey,
        status: 'active',
        wipedAt: null,
      };
      identity.devices.push(device);
      const enrolled = enroll(identity, device, membership, parsed.data.userPublicKey);
      return ok({
        device: {
          id: device.id,
          tenantId: device.tenantId,
          facilityId: device.facilityId,
          name: device.name,
          status: device.status,
        },
        ...enrolled,
      });
    }

    if (path === '/api/devices/token/challenge' && method === 'POST') {
      return ok({ nonce: `nonce-${randomUUID()}`, expiresAt: now() });
    }

    if (path === '/api/devices/token' && method === 'POST') {
      const input = body() as { deviceId: string; nonce: string; signature: string };
      const device = identity.devices.find((item) => item.id === input.deviceId);
      if (!device) return refuse('DEVICE_UNKNOWN');
      const message = deviceTokenMessage(input.nonce, device.id);
      if (!verifySignature(device.publicKey, message, input.signature)) {
        return refuse('SIGNATURE_INVALID');
      }
      if (device.wipedAt) return refuse('DEVICE_REVOKED');
      const token = `device-${randomUUID()}`;
      identity.deviceTokens.set(token, device.id);
      return ok({ deviceToken: token, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
    }

    if (path.startsWith('/api/devices/current') || path.startsWith('/api/sessions')) {
      if (path === '/api/sessions/current/end' && method === 'POST') {
        const session = staff(request);
        if (typeof session !== 'string') session.ended = true;
        return ok({ endedAt: now() });
      }
      const device = deviceOf(request);
      if (!device) return refuse('UNAUTHENTICATED');
      if (path === '/api/devices/current/wiped' && method === 'POST') {
        if (device.status === 'revoked') device.wipedAt ??= now();
        return ok({ wipedAt: device.wipedAt });
      }
      if (device.status !== 'active') return refuse('DEVICE_REVOKED');
      if (path === '/api/devices/current' && method === 'GET')
        return ok(currentDeviceOf(identity, device));
      if (path === '/api/devices/current/enrollments' && method === 'POST') {
        const ticket = ticketOf(request, 'signed_in');
        const account = identity.accounts.find((item) => item.id === ticket?.accountId);
        if (!account) return refuse('TICKET_INVALID');
        const parsed = enrollSchema.safeParse(body());
        if (!parsed.success) return refuse('VALIDATION_FAILED');
        const membership = account.memberships.find((item) => item.tenantId === device.tenantId);
        if (membership?.status !== 'active') return refuse('MEMBERSHIP_INACTIVE');
        identity.tickets.delete(request.headers()['x-sign-in-ticket'] ?? '');
        return ok(enroll(identity, device, membership, parsed.data.userPublicKey));
      }
      if (path === '/api/sessions/challenge' && method === 'POST') {
        return ok({ nonce: `nonce-${randomUUID()}`, expiresAt: now() });
      }
      if (path === '/api/sessions' && method === 'POST') {
        const parsed = openSessionSchema.safeParse(body());
        if (!parsed.success) return refuse('VALIDATION_FAILED');
        const enrollment = identity.enrollments.find(
          (item) => item.id === parsed.data.enrollmentId && item.deviceId === device.id,
        );
        if (!enrollment) return refuse('ENROLLMENT_REVOKED');
        const message = staffSessionMessage(parsed.data.nonce, device.id, enrollment.id);
        if (!verifySignature(enrollment.publicKey, message, parsed.data.signature)) {
          return refuse('SIGNATURE_INVALID');
        }
        if (enrollment.revokedAt) return refuse('ENROLLMENT_REVOKED');
        if (membershipOf(enrollment.membershipId)?.status !== 'active') {
          return refuse('MEMBERSHIP_INACTIVE');
        }
        enrollment.lastConfirmedAt = now();
        return ok(issueSession(identity, enrollment.membershipId, device.id, enrollment.id));
      }
      if (path === '/api/sessions/refresh' && method === 'POST') {
        const { refreshToken } = body() as { refreshToken: string };
        const session = identity.sessions.find((item) => item.tokens.refreshToken === refreshToken);
        if (!session || session.ended || session.deviceId !== device.id) {
          return refuse('SESSION_ENDED');
        }
        session.ended = true;
        return ok(issueSession(identity, session.membershipId, device.id, session.enrollmentId));
      }
      return refuse('NOT_FOUND');
    }

    if (path === '/api/me' || path === '/api/me/password') {
      const session = staff(request);
      if (typeof session === 'string') return refuse(session);
      const account = accountOf(session.membershipId) as Account;
      const membership = membershipOf(session.membershipId) as Membership;
      const device = identity.devices.find((item) => item.id === session.deviceId) as Device;
      if (path === '/api/me/password' && method === 'PUT') {
        const input = body() as { currentPassword: string; newPassword: string };
        if (input.currentPassword !== account.password) return refuse('INVALID_CREDENTIALS');
        if (input.newPassword.length < 10 || isWeakPassword(input.newPassword, account.phone)) {
          return refuse('PASSWORD_TOO_WEAK');
        }
        account.password = input.newPassword;
        return ok({ passwordChangedAt: now() });
      }
      const me: Me = {
        account: { id: account.id, phone: account.phone, nameAr: account.name },
        tenantId: membership.tenantId,
        membershipId: membership.id,
        roles: membership.roles,
        allFacilities: membership.allFacilities,
        facilityIds: membership.facilityIds,
        permissions: effectivePermissions(membership.roles, membership.granted, membership.revoked),
        deviceId: device.id,
        facilityId: device.facilityId,
        practitioner: practitionerOf(identity, membership.id),
      };
      return ok(me);
    }

    return undefined;
  }

  return { handle, staff, refuse };
}
