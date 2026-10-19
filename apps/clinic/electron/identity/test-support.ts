import { createPublicKey, randomUUID, verify } from 'node:crypto';
import {
  type CurrentDevice,
  deviceTokenMessage,
  type ErrorCode,
  errorStatus,
  type Role,
  type SessionTokens,
  staffSessionMessage,
} from '@vertex-shifa/contracts';
import type { StateStore } from './installation.js';
import type { PinCost, Protector } from './keys.js';
import type { ServerAnswer, ServerRequest, Transport } from './server.js';

// Stand-ins for the unit tests and the E2E (synthetic only): a protector instead of `safeStorage`,
// a state store in memory, a cheap Argon2id cost, Ed25519 verification as the API does it, and
// for the unit tests an API in memory (`testServer`).

/** Seals with a fixed mask and a marker, so a value it did not seal never opens. */
export function testProtector(): Protector {
  const marker = Buffer.from('test-protector:');
  const mask = (bytes: Buffer) => Buffer.from(bytes.map((byte, index) => byte ^ (index % 251)));
  return {
    encrypt: (plain) => Buffer.concat([marker, mask(plain)]),
    decrypt: (sealed) => {
      if (!sealed.subarray(0, marker.length).equals(marker)) throw new Error('Not sealed here');
      return mask(sealed.subarray(marker.length));
    },
  };
}

export function memoryStore(): StateStore & { text: string | null } {
  const store = {
    text: null as string | null,
    read: async () => store.text,
    write: async (text: string) => {
      store.text = text;
    },
  };
  return store;
}

/** Argon2id's smallest cost: the tests check the logic, `keys.test.ts` the real cost. */
export const testPinCost: PinCost = { memory: 64, passes: 1 };

export function verifySignature(publicKey: string, message: string, signature: string): boolean {
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKey, 'base64').toString('base64url') },
    format: 'jwk',
  });
  return verify(null, Buffer.from(message), key, Buffer.from(signature, 'base64'));
}

type TestAccount = {
  id: string;
  phone: string;
  password: string;
  membershipId: string;
  name: string;
  roles: Role[];
};

type TestEnrollment = {
  id: string;
  deviceId: string;
  membershipId: string;
  publicKey: string;
  lastConfirmedAt: string;
  revokedAt: string | null;
};

/**
 * The API's sign-in, device and session routes the main process asks, in memory, with their
 * signatures checked. `now` is the server's clock; `reachable: false` takes it off the network,
 * `refuse` answers the next request to a path with a code.
 */
export function testServer(now: () => number) {
  const accounts: TestAccount[] = [];
  const devices: {
    id: string;
    tenantId: string;
    publicKey: string;
    status: 'active' | 'revoked';
  }[] = [];
  const enrollments: TestEnrollment[] = [];
  const sessions: {
    tokens: SessionTokens;
    deviceId: string;
    enrollmentId: string;
    ended: boolean;
  }[] = [];
  const nonces = new Set<string>();
  const deviceTokens = new Map<string, string>();
  const tickets = new Map<string, string>();
  const refusals = new Map<string, ErrorCode>();
  const requests: ServerRequest[] = [];
  const at = () => new Date(now()).toISOString();

  const ok = (body: unknown): ServerAnswer => ({ status: 200, body });
  const refuse = (code: ErrorCode): ServerAnswer => ({
    status: errorStatus[code],
    body: { code, message: code },
  });
  const nonce = () => {
    const value = `nonce-${randomUUID()}`;
    nonces.add(value);
    return ok({ nonce: value, expiresAt: at() });
  };
  const takeNonce = (value: string) => nonces.delete(value);
  const issueSession = (deviceId: string, enrollmentId: string): SessionTokens => {
    const tokens: SessionTokens = {
      sessionId: randomUUID(),
      accessToken: `access-${randomUUID()}`,
      accessTokenExpiresAt: new Date(now() + 15 * 60_000).toISOString(),
      refreshToken: `refresh-${randomUUID()}`,
      expiresAt: new Date(now() + 12 * 60 * 60_000).toISOString(),
    };
    sessions.push({ tokens, deviceId, enrollmentId, ended: false });
    return tokens;
  };
  const enroll = (deviceId: string, account: TestAccount, publicKey: string) => {
    for (const previous of enrollments) {
      if (previous.deviceId === deviceId && previous.membershipId === account.membershipId) {
        previous.revokedAt ??= at();
      }
    }
    const enrollment: TestEnrollment = {
      id: randomUUID(),
      deviceId,
      membershipId: account.membershipId,
      publicKey,
      lastConfirmedAt: at(),
      revokedAt: null,
    };
    enrollments.push(enrollment);
    return {
      enrollment: {
        id: enrollment.id,
        deviceId,
        membershipId: account.membershipId,
        lastConfirmedAt: enrollment.lastConfirmedAt,
      },
      session: issueSession(deviceId, enrollment.id),
    };
  };

  function answer(request: ServerRequest): ServerAnswer {
    const body = (request.body ?? {}) as Record<string, string>;
    const headers = request.headers ?? {};
    const device = devices.find(
      (item) => item.id === deviceTokens.get(headers['x-device-token'] ?? ''),
    );
    const ticketAccount = accounts.find(
      (item) => item.id === tickets.get(headers['x-sign-in-ticket'] ?? ''),
    );
    switch (`${request.method} ${request.path}`) {
      case 'POST /api/auth/pow':
        return ok({ challenge: `pow-${randomUUID()}`, difficulty: 0, expiresAt: at() });
      case 'POST /api/auth/sign-in': {
        const account = accounts.find((item) => item.phone === body.phone);
        if (!account || account.password !== body.password) return refuse('INVALID_CREDENTIALS');
        const enrolled = enrollments.some(
          (item) =>
            item.deviceId === device?.id &&
            item.membershipId === account.membershipId &&
            !item.revokedAt,
        );
        if (!enrolled) return ok({ step: 'otp', challengeId: randomUUID() });
        const ticket = `ticket-${randomUUID()}`;
        tickets.set(ticket, account.id);
        return ok({ step: 'done', ticket });
      }
      case 'POST /api/devices': {
        if (!ticketAccount) return refuse('TICKET_INVALID');
        const id = randomUUID();
        const tenantId = body.tenantId ?? '';
        devices.push({ id, tenantId, publicKey: body.publicKey ?? '', status: 'active' });
        return ok({
          device: { id, tenantId, facilityId: null, name: body.name, status: 'active' },
          ...enroll(id, ticketAccount, body.userPublicKey ?? ''),
        });
      }
      case 'POST /api/devices/token/challenge':
        return nonce();
      case 'POST /api/devices/token': {
        const found = devices.find((item) => item.id === body.deviceId);
        if (!found) return refuse('DEVICE_UNKNOWN');
        const message = deviceTokenMessage(body.nonce ?? '', found.id);
        if (
          !takeNonce(body.nonce ?? '') ||
          !verifySignature(found.publicKey, message, body.signature ?? '')
        ) {
          return refuse('SIGNATURE_INVALID');
        }
        const token = `device-${randomUUID()}`;
        deviceTokens.set(token, found.id);
        return ok({ deviceToken: token, expiresAt: new Date(now() + 300_000).toISOString() });
      }
    }
    if (!device) return refuse('UNAUTHENTICATED');
    if (device.status !== 'active') return refuse('DEVICE_REVOKED');
    switch (`${request.method} ${request.path}`) {
      case 'GET /api/devices/current':
        return ok(currentOf(device));
      case 'POST /api/devices/current/enrollments':
        if (!ticketAccount) return refuse('TICKET_INVALID');
        return ok(enroll(device.id, ticketAccount, body.userPublicKey ?? ''));
      case 'POST /api/sessions/challenge':
        return nonce();
      case 'POST /api/sessions': {
        const enrollment = enrollments.find(
          (item) => item.id === body.enrollmentId && item.deviceId === device.id,
        );
        if (!enrollment || enrollment.revokedAt) return refuse('ENROLLMENT_REVOKED');
        const message = staffSessionMessage(body.nonce ?? '', device.id, enrollment.id);
        if (
          !takeNonce(body.nonce ?? '') ||
          !verifySignature(enrollment.publicKey, message, body.signature ?? '')
        ) {
          return refuse('SIGNATURE_INVALID');
        }
        enrollment.lastConfirmedAt = at();
        return ok(issueSession(device.id, enrollment.id));
      }
      case 'POST /api/sessions/refresh': {
        const session = sessions.find((item) => item.tokens.refreshToken === body.refreshToken);
        if (!session || session.ended || session.deviceId !== device.id) {
          return refuse('SESSION_ENDED');
        }
        session.ended = true;
        return ok(issueSession(device.id, session.enrollmentId));
      }
    }
    return refuse('NOT_FOUND');
  }

  function currentOf({ id: deviceId, tenantId }: { id: string; tenantId: string }): CurrentDevice {
    return {
      device: { id: deviceId, tenantId, facilityId: null, name: 'حاسوب تجريبي', status: 'active' },
      tenant: {
        id: tenantId,
        nameAr: 'عيادة تجريبية',
        nameLatin: null,
        status: 'active',
        idleLockMinutes: 15,
      },
      facility: null,
      members: enrollments
        .filter((item) => item.deviceId === deviceId && !item.revokedAt)
        .flatMap((item) => {
          const account = accounts.find((found) => found.membershipId === item.membershipId);
          if (!account) return [];
          return [
            {
              enrollmentId: item.id,
              membershipId: item.membershipId,
              name: account.name,
              roles: account.roles,
              lastConfirmedAt: item.lastConfirmedAt,
            },
          ];
        }),
    };
  }

  const server = {
    reachable: true,
    requests,
    devices,
    enrollments,
    sessions,
    /** An account with a membership, and a `signed_in` ticket for it. */
    addAccount(input: { phone: string; password: string; name: string; roles: Role[] }) {
      const account: TestAccount = { id: randomUUID(), membershipId: randomUUID(), ...input };
      accounts.push(account);
      return account;
    },
    ticket(account: TestAccount): string {
      const ticket = `ticket-${randomUUID()}`;
      tickets.set(ticket, account.id);
      return ticket;
    },
    refuse(path: string, code: ErrorCode) {
      refusals.set(path, code);
    },
    transport: (async (request) => {
      if (!server.reachable) throw new Error('Offline');
      requests.push(request);
      const refusal = refusals.get(request.path);
      if (refusal) {
        refusals.delete(request.path);
        return refuse(refusal);
      }
      return answer(request);
    }) satisfies Transport,
  };
  return server;
}
