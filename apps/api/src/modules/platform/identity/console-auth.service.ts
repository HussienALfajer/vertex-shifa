import { Inject, Injectable } from '@nestjs/common';
import {
  type AuditAction,
  assertPasswordStrong,
  type ChangePassword,
  type ConsoleMe,
  type ConsoleReauth,
  type ConsoleSetUp,
  type ConsoleSetup,
  type ConsoleSignIn,
  type ConsoleSignInResult,
  type ConsoleTotp,
  consolePolicy,
  DomainError,
  type PlatformRole,
  platformRolePermissions,
  signInPolicy,
  ticketTtlSeconds,
  totpCodeSchema,
} from '@vertex-shifa/contracts';
import {
  type Database,
  platformSessions,
  platformUserRecoveryCodes,
  platformUsers,
  type Transaction,
} from '@vertex-shifa/db';
import { and, count, eq, isNull, or, sql } from 'drizzle-orm';
import type { PlatformActor } from '../../../core/access/actor.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { RateLimiter } from '../../../core/rate-limit/rate-limiter.js';
import { recordPlatformAudit } from '../audit/index.js';
import {
  ConsoleSessions,
  endConsoleSessions,
  reauthenticatedUntil,
  sessionsOfUser,
  type WithConsoleCookie,
} from './console-sessions.js';
import { DecoyLocks, signInLocked } from './decoy-locks.js';
import { archiveRecoveryCodes } from './platform-users.service.js';
import { ProofOfWork } from './proof-of-work.js';
import {
  decoyPasswordHash,
  hashPassword,
  KeyedHash,
  randomToken,
  SecretBox,
  safeEqual,
  verifyPassword,
} from './secrets.js';
import { isTokenUsed, useToken } from './single-use.js';
import { TokenSigner } from './tokens.js';
import { matchTotp, newTotpSecret, newTypedCode, totpUri } from './totp.js';

const MINUTE_MS = 60_000;

type PlatformUserRow = typeof platformUsers.$inferSelect;
type Step = 'totp' | 'setup';

const invalidCredentials = () =>
  new DomainError('INVALID_CREDENTIALS', 'Unknown phone or wrong password');
const ticketInvalid = () => new DomainError('TICKET_INVALID', 'Invalid or used console ticket');
const totpInvalid = () => new DomainError('TOTP_INVALID', 'Wrong or used code');

/** A locked user's codes are refused like their password (rule 12). */
function lockedRefusal(user: PlatformUserRow, now: Date): DomainError | undefined {
  if (user.signInLockedUntil && user.signInLockedUntil > now) {
    return signInLocked(user.signInLockedUntil);
  }
  return undefined;
}

/** The AES-GCM context of a user's TOTP secret: the sealed value opens on that row only. */
const totpContext = (userId: string) => `platform_user:${userId}:totp`;

/**
 * Signing in to the console (spec S02 rules 36–39): phone and password, or the one-time setup
 * code, then a TOTP code or a recovery code; the setup that sets the password and enrolls the TOTP
 * secret; re-authentication for sensitive actions; the user's own password. A phone that cannot
 * sign in gets the answer, and the work, of a wrong password.
 */
@Injectable()
export class ConsoleAuthService {
  /** Console sign-ins: 30 per 10 minutes per address (as rule 14). */
  private readonly perAddress = new RateLimiter(30, 10 * MINUTE_MS);
  /** TOTP and recovery codes, at the sign-in step and in re-authentication: per user. */
  private readonly codesPerUser = new RateLimiter(10, 10 * MINUTE_MS);
  private readonly decoys = new DecoyLocks();
  /** Wrong re-authentication codes in a row, by console session. */
  private readonly reauthFailures = new Map<string, number>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KeyedHash) private readonly hashes: KeyedHash,
    @Inject(SecretBox) private readonly secrets: SecretBox,
    @Inject(ProofOfWork) private readonly pow: ProofOfWork,
    @Inject(TokenSigner) private readonly tokens: TokenSigner,
    @Inject(ConsoleSessions) private readonly sessions: ConsoleSessions,
  ) {}

  /**
   * Rules 36 and 37. A set-up user gives the password and goes on to the TOTP step; a pending
   * user gives the setup code and gets a new TOTP secret to enroll. Five failures in a row, of
   * passwords, setup codes, TOTP or recovery codes, lock the sign-in for 15 minutes (as rule 12);
   * the count clears only when a whole sign-in succeeds.
   */
  async signIn(input: ConsoleSignIn, address: string): Promise<ConsoleSignInResult> {
    this.perAddress.take(this.hashes.hash('address', address));
    await this.pow.verify(input.proofOfWork);
    const now = new Date();
    const secret = input.password ?? input.setupCode ?? '';
    const [user] = await this.db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.phone, input.phone));
    if (!user || user.status === 'disabled') {
      // A known phone's failure is audited, a disabled user's too; an unknown phone's is not
      // (rule 41). The answer is the same.
      if (user) {
        await this.db.transaction((tx) => this.audit(tx, user.id, 'platform_user.sign_in_failed'));
      }
      await this.decoys.fail(this.hashes.hash('console-phone', input.phone), secret, now);
      throw invalidCredentials();
    }
    await this.claimAttempt(user.id, now);
    const valid =
      input.setupCode !== undefined
        ? await this.setupCodeMatches(user, input.setupCode, now)
        : await this.passwordMatches(user, secret);
    if (!valid) {
      await this.attemptFailed(user.id, now);
      throw invalidCredentials();
    }
    if (input.setupCode === undefined) return { step: 'totp', ticket: this.issue('totp', user.id) };
    // A new secret for each sign-in with the code: the last one scanned is the one confirmed.
    const totpSecret = newTotpSecret();
    await this.db
      .update(platformUsers)
      .set({
        totpSecret: this.secrets.seal(totpContext(user.id), totpSecret),
        totpLastStep: null,
        updatedAt: now,
      })
      .where(and(eq(platformUsers.id, user.id), eq(platformUsers.status, 'pending_setup')));
    return {
      step: 'setup',
      ticket: this.issue('setup', user.id),
      totpSecret,
      totpUri: totpUri(totpSecret, user.phone),
    };
  }

  /**
   * Rule 36: the password and a valid code of the new TOTP secret make the user active, with ten
   * new recovery codes (shown this once) and a session.
   */
  async setUp(input: ConsoleSetup): Promise<WithConsoleCookie<ConsoleSetUp>> {
    const claims = await this.verifyTicket(input.ticket, 'setup');
    this.codesPerUser.take(claims.uid);
    const now = new Date();
    const recoveryCodes = Array.from({ length: consolePolicy.recoveryCodes }, () =>
      newTypedCode(2),
    );
    const passwordHash = await hashPassword(input.password);
    const outcome = await this.db.transaction(async (tx) => {
      const user = await this.lockUser(tx, claims.uid);
      const pending =
        user?.status === 'pending_setup' &&
        user.totpSecret !== null &&
        (user.setupCodeExpiresAt ?? new Date(0)) > now;
      if (!user) throw ticketInvalid();
      // A step of a user disabled, reset or set up meanwhile: refused and audited (rule 41).
      if (!pending) return this.refusedStep(tx, user.id, ticketInvalid());
      const locked = lockedRefusal(user, now);
      if (locked) return this.refusedStep(tx, user.id, locked);
      assertPasswordStrong(input.password, user.phone);
      if (!(await this.acceptTotp(tx, user, input.code, now))) {
        await this.codeFailed(tx, user, now);
        return totpInvalid();
      }
      await this.consumeTicket(tx, claims);
      await tx
        .update(platformUsers)
        .set({
          status: 'active',
          passwordHash,
          setupCodeHash: null,
          setupCodeExpiresAt: null,
          failedSignIns: 0,
          signInLockedUntil: null,
          updatedAt: now,
        })
        .where(eq(platformUsers.id, user.id));
      await archiveRecoveryCodes(tx, user.id, now);
      await tx.insert(platformUserRecoveryCodes).values(
        recoveryCodes.map((code) => ({
          platformUserId: user.id,
          codeHash: this.hashes.hash('console-recovery-code', code),
        })),
      );
      await this.audit(tx, user.id, 'platform_user.setup_completed');
      const session = await this.sessions.open(tx, user.id, now, true);
      await this.audit(tx, user.id, 'platform_user.signed_in');
      return { user, session };
    });
    if (outcome instanceof DomainError) throw outcome;
    const me = await this.describe(outcome.user, outcome.session.id, now);
    return { body: { ...me, recoveryCodes }, session: outcome.session };
  }

  /**
   * Rule 37: a TOTP code (a step not used before) or an unused recovery code opens the session.
   * A wrong code is audited and counts toward the sign-in lock; the ticket stays usable.
   */
  async verifyTotp(input: ConsoleTotp): Promise<WithConsoleCookie<ConsoleMe>> {
    const claims = await this.verifyTicket(input.ticket, 'totp');
    this.codesPerUser.take(claims.uid);
    const now = new Date();
    const isTotp = totpCodeSchema.safeParse(input.code).success;
    const outcome = await this.db.transaction(async (tx) => {
      const user = await this.lockUser(tx, claims.uid);
      if (!user) throw ticketInvalid();
      if (user.status !== 'active') return this.refusedStep(tx, user.id, ticketInvalid());
      const locked = lockedRefusal(user, now);
      if (locked) return this.refusedStep(tx, user.id, locked);
      const accepted = isTotp
        ? await this.acceptTotp(tx, user, input.code, now)
        : await this.useRecoveryCode(tx, user.id, input.code, now);
      if (!accepted) {
        await this.codeFailed(tx, user, now);
        return totpInvalid();
      }
      await this.consumeTicket(tx, claims);
      await this.attemptSucceeded(tx, user.id, now);
      if (!isTotp) await this.audit(tx, user.id, 'platform_user.recovery_code_used');
      const session = await this.sessions.open(tx, user.id, now, isTotp);
      await this.audit(tx, user.id, 'platform_user.signed_in');
      return { user, session };
    });
    if (outcome instanceof DomainError) throw outcome;
    return {
      body: await this.describe(outcome.user, outcome.session.id, now),
      session: outcome.session,
    };
  }

  /**
   * Rule 38: a TOTP code opens the 5-minute window of sensitive actions. It needs an open session,
   * so the sign-in lock (which anyone knowing the phone can set) does not apply; instead five wrong
   * codes in a row end the session, and guessing goes on only through a new sign-in.
   */
  async reauthenticate(
    actor: PlatformActor,
    input: ConsoleReauth,
  ): Promise<{ reauthenticatedUntil: string }> {
    const now = new Date();
    const outcome = await this.db.transaction(async (tx) => {
      const user = await this.lockUser(tx, actor.userId);
      if (!user) throw new DomainError('SESSION_ENDED', 'The platform user is gone');
      if (!(await this.acceptTotp(tx, user, input.code, now))) {
        await this.audit(tx, user.id, 'platform_user.totp_failed');
        const failures = (this.reauthFailures.get(actor.sessionId) ?? 0) + 1;
        this.reauthFailures.set(actor.sessionId, failures);
        if (failures >= signInPolicy.maxFailures) {
          this.reauthFailures.delete(actor.sessionId);
          const session = eq(platformSessions.id, actor.sessionId);
          await endConsoleSessions(tx, session, 'reauth_failed', now);
        }
        return totpInvalid();
      }
      this.reauthFailures.delete(actor.sessionId);
      await tx
        .update(platformSessions)
        .set({ reauthenticatedAt: now, updatedAt: now })
        .where(eq(platformSessions.id, actor.sessionId));
      await this.audit(tx, user.id, 'platform_user.reauthenticated');
      return reauthenticatedUntil(now, now) as Date;
    });
    if (outcome instanceof DomainError) throw outcome;
    return { reauthenticatedUntil: outcome.toISOString() };
  }

  /** Ends the session of the request; clearing the cookie needs no session. */
  async signOut(actor: PlatformActor): Promise<WithConsoleCookie<{ endedAt: string }>> {
    const now = new Date();
    await this.db.transaction(async (tx) => {
      await endConsoleSessions(tx, eq(platformSessions.id, actor.sessionId), 'signed_out', now);
      await this.audit(tx, actor.userId, 'platform_user.signed_out');
    });
    return { body: { endedAt: now.toISOString() }, session: null };
  }

  async me(actor: PlatformActor): Promise<ConsoleMe> {
    const [user] = await this.db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, actor.userId));
    if (!user) throw new DomainError('SESSION_ENDED', 'The platform user is gone');
    return this.describe(user, actor.sessionId, new Date());
  }

  /**
   * The user's own password: the current one is checked (failures count toward the lock), and
   * the user's other sessions end.
   */
  async changePassword(
    actor: PlatformActor,
    input: ChangePassword,
  ): Promise<{ passwordChangedAt: string }> {
    const now = new Date();
    const [user] = await this.db
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, actor.userId));
    if (!user) throw invalidCredentials();
    await this.claimAttempt(user.id, now);
    if (!(await this.passwordMatches(user, input.currentPassword))) {
      await this.attemptFailed(user.id, now);
      throw invalidCredentials();
    }
    await this.attemptSucceeded(this.db, user.id, now);
    assertPasswordStrong(input.newPassword, user.phone);
    const passwordHash = await hashPassword(input.newPassword);
    await this.db.transaction(async (tx) => {
      // Locked and rechecked: the password verified above may have changed meanwhile (another
      // change, a reset), the user been disabled, or this session ended.
      const [locked] = await tx
        .select({ passwordHash: platformUsers.passwordHash, status: platformUsers.status })
        .from(platformUsers)
        .where(eq(platformUsers.id, user.id))
        .for('update');
      const [session] = await tx
        .select({ endedAt: platformSessions.endedAt })
        .from(platformSessions)
        .where(eq(platformSessions.id, actor.sessionId))
        .for('update');
      if (!session || session.endedAt) {
        throw new DomainError('SESSION_ENDED', 'The console session has ended');
      }
      if (locked?.status !== 'active' || locked.passwordHash !== user.passwordHash) {
        throw invalidCredentials();
      }
      await tx
        .update(platformUsers)
        .set({ passwordHash, updatedAt: now })
        .where(eq(platformUsers.id, user.id));
      await endConsoleSessions(
        tx,
        sessionsOfUser(user.id, actor.sessionId),
        'password_changed',
        now,
      );
      await this.audit(tx, user.id, 'platform_user.password_changed');
    });
    return { passwordChangedAt: now.toISOString() };
  }

  // Shared steps.

  private async describe(user: PlatformUserRow, sessionId: string, now: Date): Promise<ConsoleMe> {
    const [[session], [codes]] = await Promise.all([
      this.db.select().from(platformSessions).where(eq(platformSessions.id, sessionId)),
      this.db
        .select({ remaining: count() })
        .from(platformUserRecoveryCodes)
        .where(
          and(
            eq(platformUserRecoveryCodes.platformUserId, user.id),
            isNull(platformUserRecoveryCodes.usedAt),
            isNull(platformUserRecoveryCodes.archivedAt),
          ),
        ),
    ]);
    if (!session) throw new DomainError('SESSION_ENDED', 'The console session is gone');
    const role = user.role as PlatformRole;
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role,
      permissions: [...platformRolePermissions[role]],
      recoveryCodesRemaining: codes?.remaining ?? 0,
      session: {
        expiresAt: session.expiresAt.toISOString(),
        reauthenticatedUntil:
          reauthenticatedUntil(session.reauthenticatedAt, now)?.toISOString() ?? null,
      },
    };
  }

  /** A signed ticket for the next sign-in step, 10 minutes, used once by the step it opens. */
  private issue(step: Step, userId: string): string {
    return this.tokens.sign(
      'console_step',
      { jti: randomToken(16), step, uid: userId },
      ticketTtlSeconds,
    ).token;
  }

  private async verifyTicket(ticket: string, step: Step) {
    const claims = this.tokens.verify(ticket, 'console_step');
    if (!claims || claims.step !== step) throw ticketInvalid();
    if (await isTokenUsed(this.db, 'console_step', claims.jti)) throw ticketInvalid();
    return claims;
  }

  /** Uses the ticket up in the step's transaction (`used_tokens`): a failed step keeps it. */
  private async consumeTicket(tx: Transaction, claims: { jti: string; exp: number }) {
    const used = await useToken(tx, 'console_step', claims.jti, new Date(claims.exp * 1000));
    if (!used) throw ticketInvalid();
  }

  private async lockUser(tx: Transaction, id: string): Promise<PlatformUserRow | undefined> {
    const [user] = await tx
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, id))
      .for('update');
    return user;
  }

  /**
   * Whether `code` is a TOTP code of the user's secret, within one step of now and later than the
   * last used step, which it then becomes (rule 37: a used step is refused). The caller holds the
   * user's row lock, so two requests never use the same step.
   */
  private async acceptTotp(tx: Transaction, user: PlatformUserRow, code: string, now: Date) {
    const secret = user.totpSecret && this.secrets.open(totpContext(user.id), user.totpSecret);
    if (!secret) return false;
    const step = matchTotp(secret, code, now.getTime(), user.totpLastStep);
    if (step === undefined) return false;
    await tx
      .update(platformUsers)
      .set({ totpLastStep: step, updatedAt: now })
      .where(
        and(
          eq(platformUsers.id, user.id),
          or(isNull(platformUsers.totpLastStep), sql`${platformUsers.totpLastStep} < ${step}`),
        ),
      );
    return true;
  }

  /** Uses up one of the user's current recovery codes. */
  private async useRecoveryCode(tx: Transaction, userId: string, code: string, now: Date) {
    const used = await tx
      .update(platformUserRecoveryCodes)
      .set({ usedAt: now, updatedAt: now })
      .where(
        and(
          eq(platformUserRecoveryCodes.platformUserId, userId),
          eq(platformUserRecoveryCodes.codeHash, this.hashes.hash('console-recovery-code', code)),
          isNull(platformUserRecoveryCodes.usedAt),
          isNull(platformUserRecoveryCodes.archivedAt),
        ),
      )
      .returning({ id: platformUserRecoveryCodes.id });
    return used.length === 1;
  }

  private async passwordMatches(user: PlatformUserRow, password: string): Promise<boolean> {
    if (user.status !== 'active' || !user.passwordHash) {
      await verifyPassword(password, await decoyPasswordHash());
      return false;
    }
    return verifyPassword(password, user.passwordHash);
  }

  /** A pending user's setup code, after the same work as a password check. */
  private async setupCodeMatches(user: PlatformUserRow, code: string, now: Date) {
    await verifyPassword(code, await decoyPasswordHash());
    return (
      user.status === 'pending_setup' &&
      user.setupCodeHash !== null &&
      (user.setupCodeExpiresAt ?? new Date(0)) > now &&
      safeEqual(this.hashes.hash('console-setup-code', code), user.setupCodeHash)
    );
  }

  /**
   * Rule 12 for the console: each attempt is counted before its secret is checked, under the
   * user's row lock, so concurrent attempts never get more than five guesses.
   */
  private async claimAttempt(userId: string, now: Date) {
    const lockedUntil = await this.db.transaction(async (tx) => {
      const user = await this.lockUser(tx, userId);
      if (!user) return undefined;
      if (user.signInLockedUntil && user.signInLockedUntil > now) {
        await this.audit(tx, userId, 'platform_user.sign_in_failed');
        return user.signInLockedUntil;
      }
      if (user.failedSignIns >= signInPolicy.maxFailures) return this.lock(tx, userId, now);
      await tx
        .update(platformUsers)
        .set({ failedSignIns: user.failedSignIns + 1, signInLockedUntil: null, updatedAt: now })
        .where(eq(platformUsers.id, userId));
      return undefined;
    });
    if (lockedUntil) throw signInLocked(lockedUntil);
  }

  private async attemptFailed(userId: string, now: Date) {
    await this.db.transaction(async (tx) => {
      const user = await this.lockUser(tx, userId);
      if (!user) return;
      await this.audit(tx, userId, 'platform_user.sign_in_failed');
      if (user.failedSignIns >= signInPolicy.maxFailures && !user.signInLockedUntil) {
        await this.lock(tx, userId, now);
      }
    });
  }

  /**
   * A wrong TOTP or recovery code (rule 37): audited, and counted with the sign-in failures under
   * the user's row lock, so guessing codes with a known password locks the user as guessing
   * passwords does.
   */
  private async codeFailed(tx: Transaction, user: PlatformUserRow, now: Date) {
    await this.audit(tx, user.id, 'platform_user.totp_failed');
    const failures = user.failedSignIns + 1;
    if (failures >= signInPolicy.maxFailures) {
      await this.lock(tx, user.id, now);
      return;
    }
    await tx
      .update(platformUsers)
      .set({ failedSignIns: failures, updatedAt: now })
      .where(eq(platformUsers.id, user.id));
  }

  private async attemptSucceeded(tx: Transaction | Database, userId: string, now: Date) {
    await tx
      .update(platformUsers)
      .set({ failedSignIns: 0, signInLockedUntil: null, updatedAt: now })
      .where(eq(platformUsers.id, userId));
  }

  private async lock(tx: Transaction, userId: string, now: Date): Promise<Date> {
    const until = new Date(now.getTime() + signInPolicy.lockMinutes * MINUTE_MS);
    await tx
      .update(platformUsers)
      .set({ failedSignIns: 0, signInLockedUntil: until, updatedAt: now })
      .where(eq(platformUsers.id, userId));
    await this.audit(tx, userId, 'platform_user.sign_in_locked');
    return until;
  }

  /** The user's own console actions, in the platform audit. */
  /**
   * A step of an existing user refused before its code is checked (locked, disabled): still a
   * failed attempt, audited (rule 41); the caller returns the refusal so the row commits.
   */
  private async refusedStep(tx: Transaction, userId: string, refusal: DomainError) {
    await this.audit(tx, userId, 'platform_user.sign_in_failed');
    return refusal;
  }

  private audit(tx: Transaction, userId: string, action: AuditAction) {
    return recordPlatformAudit(tx, {
      actor: { kind: 'platform', userId },
      action,
      entityType: 'platform_user',
      entityId: userId,
    });
  }
}
