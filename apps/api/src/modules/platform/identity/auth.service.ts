import { Inject, Injectable } from '@nestjs/common';
import {
  type AuditAction,
  assertPasswordStrong,
  type ChangePassword,
  DomainError,
  type Me,
  type OtpChallenge,
  type OtpRequest,
  type OtpVerified,
  type OtpVerify,
  type RegistrationOptions,
  type SetPassword,
  type SignIn,
  type SignInResult,
  signInPolicy,
} from '@vertex-shifa/contracts';
import {
  accounts,
  type Database,
  deviceEnrollments,
  devices,
  enterTenant,
  staffSessions,
  type Transaction,
  withTenant,
} from '@vertex-shifa/db';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PlatformActor, StaffActor, SystemActor, Ticket } from '../../../core/access/actor.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { RateLimiter } from '../../../core/rate-limit/rate-limiter.js';
import {
  acceptInvitation,
  inScope,
  inviteFirstOwner,
  isPendingInvitation,
  linkedTenantIds,
  permissionsOf,
  readMembership,
} from '../access/index.js';
import { recordAudit, recordPlatformAudit } from '../audit/index.js';
import { readFacilitiesInUse, readTenant } from '../tenancy/index.js';
import { OtpChallenges } from './otp-challenges.js';
import { ProofOfWork } from './proof-of-work.js';
import { decoyPasswordHash, hashPassword, KeyedHash, verifyPassword } from './secrets.js';
import { endSessions } from './staff-sessions.js';
import { Tickets } from './tickets.js';
import { TokenSigner } from './tokens.js';
import { isUniqueViolation } from './unique-violation.js';

/** Vertex staff: in the console (PR 4) or through the CLI. */
type StaffOfVertex = PlatformActor | SystemActor;

const MINUTE_MS = 60_000;
/** An authorized password reset is open for 72 hours (spec S02 rule 16). */
const RESET_WINDOW_MS = 72 * 60 * MINUTE_MS;

const invalidCredentials = () =>
  new DomainError('INVALID_CREDENTIALS', 'Unknown phone or wrong password');
const locked = (until: Date) =>
  new DomainError('RATE_LIMITED', `Sign-in locked until ${until.toISOString()}`);

/**
 * Accounts and signing in (spec S02 rules 11–17): proof of work, password sign-in with its lock,
 * OTPs, sign-in tickets, passwords, the clinics an account may register a computer to, and the
 * account changes Vertex support makes. Every answer to a phone that has no account, or no
 * password, is the answer to a wrong password, after the same work (no account enumeration).
 */
@Injectable()
export class AuthService {
  /** Sign-in, OTP requests and resends: 30 per 10 minutes per address (rule 14). */
  private readonly perAddress = new RateLimiter(30, 10 * MINUTE_MS);
  private readonly challengesPerAddress = new RateLimiter(60, 10 * MINUTE_MS);
  private readonly verificationsPerAddress = new RateLimiter(60, 10 * MINUTE_MS);
  /** Sign-in failures of phones without a password, locked like accounts (rule 12). */
  private readonly decoyLocks = new Map<string, { failures: number; lockedUntil: number }>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KeyedHash) private readonly hashes: KeyedHash,
    @Inject(ProofOfWork) private readonly pow: ProofOfWork,
    @Inject(OtpChallenges) private readonly otps: OtpChallenges,
    @Inject(Tickets) private readonly tickets: Tickets,
    @Inject(TokenSigner) private readonly tokens: TokenSigner,
  ) {}

  proofOfWork(address: string) {
    this.challengesPerAddress.take(this.hashes.hash('address', address));
    return this.pow.issue();
  }

  /**
   * Rule 12: phone and password. On a computer where the person is enrolled (its device token)
   * the answer is a ticket; elsewhere an OTP follows (rule 13).
   */
  async signIn(input: SignIn, address: string, deviceToken?: string): Promise<SignInResult> {
    this.perAddress.take(this.hashes.hash('address', address));
    this.pow.verify(input.proofOfWork);
    const now = new Date();
    const [account] = await this.db.select().from(accounts).where(eq(accounts.phone, input.phone));
    if (!account?.passwordHash) {
      await this.failDecoy(this.hashes.hash('phone', input.phone), input.password, now);
      throw invalidCredentials();
    }
    await this.claimAttempt(account.id, now);
    if (!(await verifyPassword(input.password, account.passwordHash))) {
      await this.attemptFailed(account.id, now);
      throw invalidCredentials();
    }
    await this.attemptSucceeded(account.id);
    const device = deviceToken ? this.tokens.verify(deviceToken, 'device') : undefined;
    if (device && (await this.isEnrolled(device.tid, device.did, account.id))) {
      return {
        step: 'done',
        ticket: this.tickets.issue('signed_in', account.id, {
          tenantId: device.tid,
          deviceId: device.did,
        }),
      };
    }
    return {
      step: 'otp',
      challengeId: await this.otps.start(account, 'device_sign_in', 'RATE_LIMITED'),
    };
  }

  /**
   * Rules 15 and 16: a code for a first sign-in (a pending invitation, no password yet) or an
   * authorized password reset. Any other phone gets a decoy challenge and the same answer.
   */
  async requestOtp(input: OtpRequest, address: string): Promise<OtpChallenge> {
    this.perAddress.take(this.hashes.hash('address', address));
    this.pow.verify(input.proofOfWork);
    const now = new Date();
    const [account] = await this.db.select().from(accounts).where(eq(accounts.phone, input.phone));
    const eligible =
      account !== undefined &&
      (input.purpose === 'first_sign_in'
        ? account.passwordHash === null &&
          (await this.pendingInvitationName(account.id, now)) !== undefined
        : (account.passwordResetAuthorizedUntil ?? new Date(0)) > now);
    const challengeId =
      eligible && account
        ? await this.otps.start(account, input.purpose, 'RATE_LIMITED', { quietFailure: true })
        : this.otps.startDecoy(
            this.hashes.hash('phone', input.phone),
            input.purpose,
            'RATE_LIMITED',
          );
    return { challengeId };
  }

  async resendOtp(challengeId: string, address: string): Promise<OtpChallenge> {
    this.perAddress.take(this.hashes.hash('address', address));
    return { challengeId: await this.otps.resend(challengeId) };
  }

  /** A verified code gives a ticket for the next step: set a password, or act signed in. */
  async verifyOtp(input: OtpVerify, address: string): Promise<OtpVerified> {
    this.verificationsPerAddress.take(this.hashes.hash('address', address));
    const { accountId, purpose } = await this.otps.verify(input.challengeId, input.code);
    const now = new Date();
    const [account] = await this.db
      .update(accounts)
      .set({ phoneVerifiedAt: sql`coalesce(${accounts.phoneVerifiedAt}, now())`, updatedAt: now })
      .where(eq(accounts.id, accountId))
      .returning();
    if (!account) throw new DomainError('OTP_INVALID', 'The account is gone');
    const needsName = account.nameAr === null;
    if (purpose === 'device_sign_in') {
      // The person proved password and phone: their pending invitations become active (rule 27).
      await this.db.transaction((tx) =>
        this.forEachTenant(tx, account.id, () => acceptInvitation(tx, account.id, now)),
      );
      return {
        ticket: this.tickets.issue('signed_in', account.id),
        needsPassword: false,
        needsName,
        suggestedName: account.nameAr,
      };
    }
    if (purpose === 'first_sign_in') {
      const invitedName = await this.pendingInvitationName(account.id, now);
      if (account.passwordHash !== null || invitedName === undefined) {
        throw new DomainError('OTP_EXPIRED', 'The invitation is no longer pending');
      }
      return {
        ticket: this.tickets.issue('set_password', account.id),
        needsPassword: true,
        needsName,
        suggestedName: account.nameAr ?? invitedName,
      };
    }
    if (!account.passwordResetAuthorizedUntil || account.passwordResetAuthorizedUntil <= now) {
      throw new DomainError('OTP_EXPIRED', 'The password reset is no longer authorized');
    }
    return {
      ticket: this.tickets.issue('set_password', account.id),
      needsPassword: true,
      needsName,
      suggestedName: account.nameAr,
    };
  }

  /**
   * The first password (rule 15: pending invitations become active) or a new one after an
   * authorized reset (rule 16: the account's staff sessions end in every tenant; enrollments stay).
   */
  async setPassword(ticket: Ticket, input: SetPassword): Promise<{ ticket: string }> {
    const now = new Date();
    const [account] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, ticket.accountId));
    if (!account) throw new DomainError('TICKET_INVALID', 'The account is gone');
    assertPasswordStrong(input.password, account.phone);
    const reset = account.passwordHash !== null;
    const allowed = reset
      ? (account.passwordResetAuthorizedUntil ?? new Date(0)) > now
      : (await this.pendingInvitationName(account.id, now)) !== undefined;
    if (!allowed) throw new DomainError('TICKET_INVALID', 'No password may be set now');
    const nameAr = input.name ?? account.nameAr;
    if (!nameAr) throw new DomainError('VALIDATION_FAILED', 'Invalid fields: name');
    this.tickets.consume(ticket);
    const passwordHash = await hashPassword(input.password);
    // One transaction: the password, its audit, the end of the account's sessions in every clinic
    // after a reset (rule 16) and the acceptance of its invitations commit together.
    await this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({
          nameAr,
          passwordHash,
          passwordChangedAt: now,
          passwordResetAuthorizedUntil: null,
          failedSignIns: 0,
          signInLockedUntil: null,
          updatedAt: now,
        })
        .where(eq(accounts.id, account.id));
      await recordPlatformAudit(tx, {
        actor: { kind: 'staff', accountId: account.id },
        action: 'account.password_set',
        entityType: 'account',
        entityId: account.id,
      });
      await this.forEachTenant(tx, account.id, async () => {
        const member = await readMembership(tx, { accountId: account.id });
        if (reset && member) {
          await endSessions(tx, eq(staffSessions.membershipId, member.id), 'password_reset', now);
        }
        await acceptInvitation(tx, account.id, now);
      });
    });
    return { ticket: this.tickets.issue('signed_in', account.id) };
  }

  /**
   * Rule 27: the clinics where the account is an active member holding `devices.manage`, with the
   * branches of its scope; closed clinics for owners only. A clinic onboarding without a branch is
   * offered to its owners with no branch (rule 28).
   */
  async registrationOptions(ticket: Ticket): Promise<RegistrationOptions> {
    const clinics: RegistrationOptions['clinics'] = [];
    for (const tenantId of await linkedTenantIds(this.db, ticket.accountId)) {
      const clinic = await withTenant(this.db, tenantId, async (tx) => {
        const tenant = await readTenant(tx, tenantId);
        const member = await readMembership(tx, { accountId: ticket.accountId });
        if (member?.status !== 'active') return undefined;
        const owner = member.roles.includes('owner');
        if (tenant.status === 'closed' && !owner) return undefined;
        if (!permissionsOf(member).includes('devices.manage')) return undefined;
        const inUse = await readFacilitiesInUse(tx);
        const branches = inUse.filter((branch) => inScope(member, branch.id));
        const unplaced = owner && tenant.status === 'onboarding' && inUse.length === 0;
        if (branches.length === 0 && !unplaced) return undefined;
        return {
          tenantId,
          nameAr: tenant.nameAr,
          nameLatin: tenant.nameLatin,
          status: tenant.status as RegistrationOptions['clinics'][number]['status'],
          roles: member.roles,
          branches,
        };
      });
      if (clinic) clinics.push(clinic);
    }
    return { clinics };
  }

  async me(actor: StaffActor): Promise<Me> {
    const [account] = await this.db.select().from(accounts).where(eq(accounts.id, actor.accountId));
    if (!account) throw new DomainError('UNAUTHENTICATED', 'The account is gone');
    return {
      account: { id: account.id, phone: account.phone, nameAr: account.nameAr },
      tenantId: actor.tenantId,
      membershipId: actor.membershipId,
      roles: actor.roles,
      allFacilities: actor.allFacilities,
      facilityIds: actor.facilityIds,
      permissions: actor.permissions,
      deviceId: actor.deviceId,
      facilityId: actor.facilityId,
    };
  }

  /** Changes the member's own password; a wrong current password counts toward the lock. */
  async changePassword(
    actor: StaffActor,
    input: ChangePassword,
  ): Promise<{ passwordChangedAt: string }> {
    const now = new Date();
    const [account] = await this.db.select().from(accounts).where(eq(accounts.id, actor.accountId));
    if (!account?.passwordHash) throw invalidCredentials();
    await this.claimAttempt(account.id, now);
    if (!(await verifyPassword(input.currentPassword, account.passwordHash))) {
      await this.attemptFailed(account.id, now);
      throw invalidCredentials();
    }
    await this.attemptSucceeded(account.id);
    assertPasswordStrong(input.newPassword, account.phone);
    const passwordHash = await hashPassword(input.newPassword);
    await this.db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ passwordHash, passwordChangedAt: now, failedSignIns: 0, updatedAt: now })
        .where(eq(accounts.id, account.id));
      await recordPlatformAudit(tx, {
        actor: { kind: 'staff', accountId: account.id, deviceId: actor.deviceId },
        action: 'account.password_set',
        entityType: 'account',
        entityId: account.id,
      });
    });
    return { passwordChangedAt: now.toISOString() };
  }

  // Vertex staff: the CLI now, the console from PR 4.

  /**
   * Rule 3: the tenant's first owner, invited by Vertex with the tenant, in the tenant's creating
   * transaction. The account is found by phone or created without a password.
   */
  async inviteFirstOwner(
    tx: Transaction,
    tenantId: string,
    owner: { phone: string; name: string },
    actor: StaffOfVertex,
  ): Promise<string> {
    const accountId = await this.findOrCreateAccount(tx, owner.phone, actor);
    return inviteFirstOwner(tx, { tenantId, accountId, invitedName: owner.name, actor });
  }

  /**
   * Rule 17: Vertex support authorizes an owner's password reset (rule 16), after identity checks
   * outside the system. Written to the platform audit and to each tenant where the account owns.
   */
  async authorizePasswordReset(
    actor: StaffOfVertex,
    phone: string,
    reason: string,
  ): Promise<{ accountId: string; passwordResetAuthorizedUntil: string }> {
    const until = new Date(Date.now() + RESET_WINDOW_MS);
    const account = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(accounts)
        .set({ passwordResetAuthorizedUntil: until, updatedAt: new Date() })
        .where(eq(accounts.phone, phone))
        .returning({ id: accounts.id });
      if (!row) throw new DomainError('NOT_FOUND', 'Account not found');
      await recordPlatformAudit(tx, {
        actor,
        action: 'account.password_reset_authorized',
        entityType: 'account',
        entityId: row.id,
        reason,
      });
      await this.auditOwnerTenants(tx, actor, row.id, 'account.password_reset_authorized', reason);
      return row;
    });
    return { accountId: account.id, passwordResetAuthorizedUntil: until.toISOString() };
  }

  /**
   * Rule 17: Vertex support changes an account's phone. Enrollments and PINs keep working; the
   * next OTP goes to the new phone (edge case 13). A phone already in use is `ALREADY_MEMBER`.
   */
  async changePhone(
    actor: StaffOfVertex,
    phone: string,
    newPhone: string,
    reason: string,
  ): Promise<{ accountId: string }> {
    let account: { id: string };
    try {
      account = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(accounts)
          .set({ phone: newPhone, phoneVerifiedAt: null, updatedAt: new Date() })
          .where(eq(accounts.phone, phone))
          .returning({ id: accounts.id });
        if (!row) throw new DomainError('NOT_FOUND', 'Account not found');
        await recordPlatformAudit(tx, {
          actor,
          action: 'account.phone_changed',
          entityType: 'account',
          entityId: row.id,
          reason,
        });
        await this.auditOwnerTenants(tx, actor, row.id, 'account.phone_changed', reason);
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'accounts_phone_unique')) {
        throw new DomainError('ALREADY_MEMBER', 'The phone belongs to another account');
      }
      throw error;
    }
    return { accountId: account.id };
  }

  // Shared steps.

  private async findOrCreateAccount(
    tx: Transaction,
    phone: string,
    actor: StaffOfVertex,
  ): Promise<string> {
    const [created] = await tx
      .insert(accounts)
      .values({ phone })
      .onConflictDoNothing({ target: accounts.phone })
      .returning({ id: accounts.id });
    if (created) {
      await recordPlatformAudit(tx, {
        actor,
        action: 'account.created',
        entityType: 'account',
        entityId: created.id,
      });
      return created.id;
    }
    const [existing] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.phone, phone));
    return (existing as { id: string }).id;
  }

  /** The invited name of the account's first pending invitation, if it has one. */
  private async pendingInvitationName(accountId: string, now: Date): Promise<string | undefined> {
    for (const tenantId of await linkedTenantIds(this.db, accountId)) {
      const member = await withTenant(this.db, tenantId, (tx) => readMembership(tx, { accountId }));
      if (member && isPendingInvitation(member, now)) return member.invitedName;
    }
    return undefined;
  }

  /**
   * Runs `work` in each tenant the account is linked to, inside the caller's transaction, so an
   * account-level change and its effects in every clinic commit together (rules 15 to 17).
   */
  private async forEachTenant(tx: Transaction, accountId: string, work: () => Promise<unknown>) {
    for (const tenantId of await linkedTenantIds(tx, accountId)) {
      await enterTenant(tx, tenantId);
      await work();
    }
  }

  /** Rule 17: a recovery action is also written to the audit of each tenant the account owns. */
  private async auditOwnerTenants(
    tx: Transaction,
    actor: StaffOfVertex,
    accountId: string,
    action: AuditAction,
    reason: string,
  ) {
    await this.forEachTenant(tx, accountId, async () => {
      const member = await readMembership(tx, { accountId });
      if (!member?.roles.includes('owner')) return;
      await recordAudit(tx, member.tenantId, {
        actor,
        action,
        entityType: 'account',
        entityId: accountId,
        reason,
      });
    });
  }

  /** Whether the account is an active member enrolled on the active device (rule 22). */
  private async isEnrolled(tenantId: string, deviceId: string, accountId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const member = await readMembership(tx, { accountId });
      if (member?.status !== 'active') return false;
      const [row] = await tx
        .select({ id: deviceEnrollments.id })
        .from(deviceEnrollments)
        .innerJoin(devices, eq(devices.id, deviceEnrollments.deviceId))
        .where(
          and(
            eq(deviceEnrollments.deviceId, deviceId),
            eq(deviceEnrollments.membershipId, member.id),
            isNull(deviceEnrollments.revokedAt),
            eq(devices.status, 'active'),
          ),
        );
      return row !== undefined;
    });
  }

  /**
   * Rule 12: five failures in a row lock password sign-in for 15 minutes. Each attempt is counted
   * before its password is checked, under the account's row lock, so concurrent attempts never get
   * more than five guesses; a correct password clears the count.
   */
  private async claimAttempt(accountId: string, now: Date) {
    const lockedUntil = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ failures: accounts.failedSignIns, lockedUntil: accounts.signInLockedUntil })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!row) return undefined;
      if (row.lockedUntil && row.lockedUntil > now) return row.lockedUntil;
      if (row.failures >= signInPolicy.maxFailures) return this.lock(tx, accountId, now);
      await tx
        .update(accounts)
        .set({ failedSignIns: row.failures + 1, signInLockedUntil: null, updatedAt: now })
        .where(eq(accounts.id, accountId));
      return undefined;
    });
    if (lockedUntil) throw locked(lockedUntil);
  }

  /** A wrong password: the fifth in a row locks the account. */
  private async attemptFailed(accountId: string, now: Date) {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ failures: accounts.failedSignIns, lockedUntil: accounts.signInLockedUntil })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (row && row.failures >= signInPolicy.maxFailures && !row.lockedUntil) {
        await this.lock(tx, accountId, now);
      }
    });
  }

  private async attemptSucceeded(accountId: string) {
    await this.db
      .update(accounts)
      .set({ failedSignIns: 0, signInLockedUntil: null, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
  }

  private async lock(tx: Transaction, accountId: string, now: Date): Promise<Date> {
    const until = new Date(now.getTime() + signInPolicy.lockMinutes * MINUTE_MS);
    await tx
      .update(accounts)
      .set({ failedSignIns: 0, signInLockedUntil: until, updatedAt: now })
      .where(eq(accounts.id, accountId));
    await recordPlatformAudit(tx, {
      actor: { kind: 'system' },
      action: 'account.sign_in_locked',
      entityType: 'account',
      entityId: accountId,
    });
    return until;
  }

  /**
   * A sign-in for a phone without a password: the same password check against a decoy hash, and
   * the same lock after five failures, then `INVALID_CREDENTIALS`.
   */
  private async failDecoy(phoneKey: string, password: string, now: Date) {
    // As `claimAttempt`: the attempt is counted before the slow check, with no wait in between, so
    // concurrent guesses lock a phone without an account exactly as they lock an account.
    for (const [key, entry] of this.decoyLocks) {
      if (entry.failures === 0 && entry.lockedUntil <= now.getTime()) this.decoyLocks.delete(key);
    }
    const entry = this.decoyLocks.get(phoneKey) ?? { failures: 0, lockedUntil: 0 };
    this.decoyLocks.set(phoneKey, entry);
    if (entry.lockedUntil > now.getTime()) throw locked(new Date(entry.lockedUntil));
    const lock = () => {
      entry.failures = 0;
      entry.lockedUntil = now.getTime() + signInPolicy.lockMinutes * MINUTE_MS;
      return new Date(entry.lockedUntil);
    };
    if (entry.failures >= signInPolicy.maxFailures) throw locked(lock());
    entry.failures += 1;
    await verifyPassword(password, await decoyPasswordHash());
    if (entry.failures >= signInPolicy.maxFailures && entry.lockedUntil <= now.getTime()) lock();
  }
}
