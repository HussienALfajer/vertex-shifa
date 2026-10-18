import { createHash, generateKeyPairSync, randomInt, sign } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import {
  deviceTokenMessage,
  effectivePermissions,
  invitationPolicy,
  type PermissionKey,
  type Role,
  type SessionTokens,
  staffSessionMessage,
} from '@vertex-shifa/contracts';
import {
  accounts,
  accountTenantLinks,
  areas,
  type Database,
  otpChallenges,
  specialties,
  staffMembershipFacilities,
  staffMemberships,
  withTenant,
} from '@vertex-shifa/db';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { v7 as uuidv7 } from 'uuid';
import type { StaffActor } from '../src/core/access/actor.js';
import { DATABASE } from '../src/core/database/database.module.js';
import {
  AuthService,
  type FakeOtpSender,
  OTP_SENDER,
} from '../src/modules/platform/identity/index.js';
import { TenancyService } from '../src/modules/platform/tenancy/index.js';

// Test helpers that sign staff in over HTTP the way the clinic app does (spec S02). Synthetic
// phones, names and keys only.

const SYSTEM = { kind: 'system' } as const;
export const PASSWORD = 'synthetic clinic passphrase';

let counter = 0;

/** A new synthetic Syrian mobile number. */
export function newPhone(): string {
  return `+9639${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}

/** A new client address, so each flow has its own rate-limit windows (the proxy forwards it). */
export function newAddress(): string {
  counter += 1;
  return `10.${(counter >> 16) & 255}.${(counter >> 8) & 255}.${counter & 255}`;
}

/** Solves a proof-of-work challenge as the clinic app does. */
export function solve(challenge: string, difficulty: number): string {
  for (let nonce = 0; ; nonce += 1) {
    const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest();
    let bits = 0;
    for (const byte of digest) {
      if (byte === 0) {
        bits += 8;
        continue;
      }
      bits += Math.clz32(byte) - 24;
      break;
    }
    if (bits >= difficulty) return String(nonce);
  }
}

/** An Ed25519 key pair as the installation makes it: base64 raw public key, base64 signatures. */
export function newKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
  return {
    publicKey: raw.toString('base64'),
    sign: (message: string) => sign(null, Buffer.from(message), privateKey).toString('base64'),
  };
}

export type Keys = ReturnType<typeof newKeys>;

export type Device = { id: string; tenantId: string; keys: Keys };

export type Session = SessionTokens & { device: Device; userKeys: Keys; enrollmentId: string };

export class StaffClient {
  readonly db: Database;

  constructor(readonly app: INestApplication) {
    this.db = app.get(DATABASE);
  }

  /**
   * Listens on a free loopback port first: helpers build a request while awaiting another one,
   * and supertest closes a server it opened itself once its own requests end.
   */
  static async create(app: INestApplication): Promise<StaffClient> {
    await app.listen(0, '127.0.0.1');
    return new StaffClient(app);
  }

  get http() {
    return request(this.app.getHttpServer());
  }

  async proofOfWork(address: string) {
    const response = await this.http
      .post('/api/auth/pow')
      .set('x-forwarded-for', address)
      .expect(201);
    const { challenge, difficulty } = response.body as { challenge: string; difficulty: number };
    return { challenge, nonce: solve(challenge, difficulty) };
  }

  /** The last OTP the fake sender "sent" to the phone's account. */
  async lastCode(phone: string): Promise<string> {
    const [account] = await this.db.select().from(accounts).where(eq(accounts.phone, phone));
    const code = (this.app.get(OTP_SENDER) as FakeOtpSender).lastCode(account?.id ?? '');
    if (!code) throw new Error('No OTP was sent');
    return code;
  }

  /**
   * Moves the account's earlier OTPs an hour back, so a test may send another at once without
   * waiting out the cooldown and the hourly limit (tested in their own test).
   */
  async forgetOtps(phone: string): Promise<void> {
    const [account] = await this.db.select().from(accounts).where(eq(accounts.phone, phone));
    if (!account) return;
    await this.db
      .update(otpChallenges)
      .set({ createdAt: new Date(Date.now() - 3_600_000) })
      .where(eq(otpChallenges.accountId, account.id));
  }

  /** Rule 15: OTP, name and password; answers a `signed_in` ticket. */
  async firstSignIn(phone: string, password = PASSWORD): Promise<string> {
    await this.forgetOtps(phone);
    const address = newAddress();
    const requested = await this.http
      .post('/api/auth/otp/request')
      .set('x-forwarded-for', address)
      .send({ phone, purpose: 'first_sign_in', proofOfWork: await this.proofOfWork(address) })
      .expect(201);
    const verified = await this.http
      .post('/api/auth/otp/verify')
      .set('x-forwarded-for', address)
      .send({ challengeId: requested.body.challengeId, code: await this.lastCode(phone) })
      .expect(201);
    const set = await this.http
      .post('/api/auth/password')
      .set('x-sign-in-ticket', verified.body.ticket)
      .send({ name: 'موظف تجريبي', password })
      .expect(201);
    return set.body.ticket as string;
  }

  /** Rules 12–13: phone, password and OTP on a computer where the person is not enrolled. */
  async signIn(phone: string, password = PASSWORD): Promise<string> {
    await this.forgetOtps(phone);
    const address = newAddress();
    const signedIn = await this.http
      .post('/api/auth/sign-in')
      .set('x-forwarded-for', address)
      .send({ phone, password, proofOfWork: await this.proofOfWork(address) })
      .expect(201);
    const verified = await this.http
      .post('/api/auth/otp/verify')
      .set('x-forwarded-for', address)
      .send({ challengeId: signedIn.body.challengeId, code: await this.lastCode(phone) })
      .expect(201);
    return verified.body.ticket as string;
  }

  /** Rule 18: registers a computer and enrolls the signing-in member on it. */
  async register(
    ticket: string,
    tenantId: string,
    facilityId: string | null,
    keys = newKeys(),
  ): Promise<Session> {
    const userKeys = newKeys();
    const response = await this.http
      .post('/api/devices')
      .set('x-sign-in-ticket', ticket)
      .send({
        tenantId,
        facilityId,
        name: 'جهاز تجريبي',
        publicKey: keys.publicKey,
        os: 'Windows 11',
        appVersion: '0.1.0',
        userPublicKey: userKeys.publicKey,
      })
      .expect(201);
    const device = { id: response.body.device.id as string, tenantId, keys };
    return {
      ...(response.body.session as SessionTokens),
      device,
      userKeys,
      enrollmentId: response.body.enrollment.id,
    };
  }

  async deviceToken(device: Device): Promise<string> {
    const challenge = await this.http
      .post('/api/devices/token/challenge')
      .send({ tenantId: device.tenantId, deviceId: device.id })
      .expect(201);
    const { nonce } = challenge.body as { nonce: string };
    const response = await this.http
      .post('/api/devices/token')
      .send({
        tenantId: device.tenantId,
        deviceId: device.id,
        nonce,
        signature: device.keys.sign(deviceTokenMessage(nonce, device.id)),
        appVersion: '0.1.0',
      })
      .expect(201);
    return response.body.deviceToken as string;
  }

  /** Rule 20: enrolls the ticket's member on the device. */
  async enroll(device: Device, ticket: string): Promise<Session> {
    const userKeys = newKeys();
    const response = await this.http
      .post('/api/devices/current/enrollments')
      .set('x-device-token', await this.deviceToken(device))
      .set('x-sign-in-ticket', ticket)
      .send({ userPublicKey: userKeys.publicKey })
      .expect(201);
    return {
      ...(response.body.session as SessionTokens),
      device,
      userKeys,
      enrollmentId: response.body.enrollment.id,
    };
  }

  /** Rule 23: opens a session with the member's user key. */
  async openSession(device: Device, enrollmentId: string, userKeys: Keys) {
    const token = await this.deviceToken(device);
    const challenge = await this.http
      .post('/api/sessions/challenge')
      .set('x-device-token', token)
      .expect(201);
    const { nonce } = challenge.body as { nonce: string };
    return this.http
      .post('/api/sessions')
      .set('x-device-token', token)
      .send({
        enrollmentId,
        nonce,
        signature: userKeys.sign(staffSessionMessage(nonce, device.id, enrollmentId)),
      });
  }

  /**
   * A clinic with its owner signed in on a registered computer; with `branch`, the onboarding
   * wizard's first branch exists and the computer has it (rule 28).
   */
  async clinic(options: { branch?: boolean } = {}) {
    const phone = newPhone();
    const auth = this.app.get(AuthService);
    const tenant = await this.app
      .get(TenancyService)
      .createTenant(SYSTEM, { nameAr: 'عيادة تجريبية', reason: 'test' }, (tx, tenantId) =>
        auth.inviteFirstOwner(tx, tenantId, { phone, name: 'مالك تجريبي' }, SYSTEM),
      );
    const ticket = await this.firstSignIn(phone);
    const owner = await this.register(ticket, tenant.id, null);
    const branchId = options.branch ? await this.addBranch(owner) : null;
    return { tenantId: tenant.id, phone, owner, branchId };
  }

  /** Adds a branch as the owner. */
  async addBranch(owner: Session): Promise<string> {
    const created = await this.http
      .post('/api/facilities')
      .set('authorization', `Bearer ${owner.accessToken}`)
      .send(BRANCH(await this.cityId()))
      .expect(201);
    return created.body.id;
  }

  /**
   * A member invited directly in the database (a fixture; `test/staff.test.ts` tests the route),
   * who then signs in for the first time and enrolls on `device`.
   */
  async member(
    tenantId: string,
    device: Device,
    access: {
      roles: Role[];
      facilityIds?: string[];
      granted?: PermissionKey[];
      revoked?: PermissionKey[];
    },
  ): Promise<Session & { phone: string; membershipId: string }> {
    const phone = await this.invite(tenantId, access);
    const session = await this.enroll(device, await this.firstSignIn(phone));
    const membershipId = await this.membershipId(tenantId, phone);
    return { ...session, phone, membershipId };
  }

  /** Writes an invitation as the staff routes do; answers the phone. */
  async invite(
    tenantId: string,
    access: {
      roles: Role[];
      facilityIds?: string[];
      granted?: PermissionKey[];
      revoked?: PermissionKey[];
    },
  ): Promise<string> {
    const phone = newPhone();
    const [account] = await this.db.insert(accounts).values({ phone }).returning();
    const accountId = (account as { id: string }).id;
    await withTenant(this.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(staffMemberships)
        .values({
          tenantId,
          accountId,
          status: 'invited',
          roles: access.roles,
          allFacilities: access.facilityIds === undefined,
          grantedPermissions: access.granted ?? [],
          revokedPermissions: access.revoked ?? [],
          invitedName: 'موظف تجريبي',
          invitationExpiresAt: new Date(Date.now() + invitationPolicy.ttlDays * 86_400_000),
          invitationMessageStatus: 'pending',
        })
        .returning();
      const membershipId = (row as { id: string }).id;
      for (const facilityId of access.facilityIds ?? []) {
        await tx.insert(staffMembershipFacilities).values({ tenantId, membershipId, facilityId });
      }
    });
    await this.db.insert(accountTenantLinks).values({ accountId, linkedTenantId: tenantId });
    return phone;
  }

  /** Moves an invitation's last send 11 minutes back, past the resend cooldown (rule 4). */
  async backdateInvitation(tenantId: string, membershipId: string): Promise<void> {
    const sentAt = Date.now() - 11 * 60_000;
    await withTenant(this.db, tenantId, (tx) =>
      tx
        .update(staffMemberships)
        .set({ invitationExpiresAt: new Date(sentAt + invitationPolicy.ttlDays * 86_400_000) })
        .where(eq(staffMemberships.id, membershipId)),
    );
  }

  /** The first specialties of the seeded list, by position. */
  async specialtyIds(count = 1): Promise<string[]> {
    const rows = await this.db.select().from(specialties).orderBy(specialties.position);
    return rows.slice(0, count).map((row) => row.id);
  }

  async membershipId(tenantId: string, phone: string): Promise<string> {
    const [account] = await this.db.select().from(accounts).where(eq(accounts.phone, phone));
    const [row] = await withTenant(this.db, tenantId, (tx) =>
      tx
        .select({ id: staffMemberships.id })
        .from(staffMemberships)
        .where(eq(staffMemberships.accountId, account?.id ?? '')),
    );
    return (row as { id: string }).id;
  }

  private async cityId(): Promise<string> {
    const rows = await this.db.select().from(areas);
    return rows.find((area) => area.nameLatin === 'Azaz')?.id ?? '';
  }
}

/** A staff actor for service-level tests: an owner of `tenantId`, holding every owner permission. */
export function ownerActor(tenantId: string): StaffActor {
  return {
    kind: 'staff',
    tenantId,
    membershipId: uuidv7(),
    accountId: uuidv7(),
    sessionId: uuidv7(),
    deviceId: uuidv7(),
    facilityId: null,
    roles: ['owner'],
    permissions: effectivePermissions(['owner'], [], []),
    allFacilities: true,
    facilityIds: [],
  };
}

const BRANCH = (areaId: string) => ({
  name: 'الفرع الرئيسي',
  areaId,
  addressDetails: 'شارع تجريبي، بناء 1',
  coordinates: { latitudeE7: 365_864_000, longitudeE7: 370_453_000 },
  contactPhones: [{ phone: '+963900000001', whatsapp: true }],
  defaultCurrency: 'USD',
  workingDays: 63,
  displayNameFormat: 'ticket_only',
  displayCallSound: true,
});
