import { Inject, Injectable } from '@nestjs/common';
import {
  type AuditAction,
  assertAdminRemains,
  type CreatePlatformUser,
  consolePolicy,
  DomainError,
  type PlatformUser,
  type PlatformUserSetup,
  type UpdatePlatformUser,
} from '@vertex-shifa/contracts';
import { KeyedHash } from '@vertex-shifa/crypto';
import {
  type Database,
  platformUserRecoveryCodes,
  platformUsers,
  type Transaction,
} from '@vertex-shifa/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { PlatformActor, SystemActor } from '../../../core/access/actor.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { recordPlatformAudit } from '../audit/index.js';
import { endConsoleSessions, sessionsOfUser } from './console-sessions.js';
import { newTypedCode } from './totp.js';
import { isUniqueViolation } from './unique-violation.js';

const HOUR_MS = 60 * 60_000;

/** An admin in the console, or Vertex staff with server access through the CLI. */
type PlatformUserManager = PlatformActor | SystemActor;

type PlatformUserRow = typeof platformUsers.$inferSelect;

export function toPlatformUser(row: PlatformUserRow): PlatformUser {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    role: row.role as PlatformUser['role'],
    status: row.status as PlatformUser['status'],
    setupCodeExpiresAt: row.setupCodeExpiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const notFound = () => new DomainError('NOT_FOUND', 'Platform user not found');

/**
 * Platform users (spec S02 rules 36 and 40): admins create them, change their role, disable and
 * reset them; the CLI creates the first admin and resets the last one. A new or reset user gets a
 * one-time setup code, valid 24 hours, shown once; only its keyed hash is stored.
 */
@Injectable()
export class PlatformUsersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(KeyedHash) private readonly hashes: KeyedHash,
  ) {}

  async list(): Promise<PlatformUser[]> {
    const rows = await this.db
      .select()
      .from(platformUsers)
      .orderBy(asc(platformUsers.name), asc(platformUsers.id));
    return rows.map(toPlatformUser);
  }

  /** Rule 36. A phone that already has a platform user is `CONFLICT`. */
  async create(actor: PlatformUserManager, input: CreatePlatformUser): Promise<PlatformUserSetup> {
    const now = new Date();
    const setup = this.newSetupCode(now);
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(platformUsers)
          .values({
            phone: input.phone,
            name: input.name,
            role: input.role,
            status: 'pending_setup',
            setupCodeHash: setup.hash,
            setupCodeExpiresAt: setup.expiresAt,
          })
          .returning();
        if (!row) throw new Error('The platform user was not stored');
        await this.audit(tx, actor, 'platform_user.created', row.id);
        return this.withSetupCode(row, setup);
      });
    } catch (error) {
      if (isUniqueViolation(error, 'platform_users_phone_unique')) {
        throw new DomainError('CONFLICT', 'The phone already has a platform user');
      }
      throw error;
    }
  }

  /**
   * A role change, or disabling or enabling (rule 40): an admin never demotes or disables
   * themselves, and the last active admin is never demoted or disabled (`LAST_ADMIN`). Disabling
   * ends the user's sessions; an enabled user who never finished setup is pending again.
   */
  async update(
    actor: PlatformUserManager,
    id: string,
    input: UpdatePlatformUser,
  ): Promise<PlatformUser> {
    const now = new Date();
    return this.db.transaction(async (tx) => {
      const { user, activeAdmins } = await this.lockForChange(tx, id);
      const role = input.role ?? user.role;
      const status =
        input.disabled === undefined
          ? user.status
          : input.disabled
            ? 'disabled'
            : user.status !== 'disabled'
              ? user.status
              : user.passwordHash && user.totpSecret
                ? 'active'
                : 'pending_setup';
      const losesAdmin =
        user.role === 'admin' &&
        user.status === 'active' &&
        (role !== 'admin' || status !== 'active');
      if (losesAdmin && actor.kind === 'platform' && actor.userId === id) {
        throw new DomainError('FORBIDDEN', 'An admin cannot demote or disable themselves');
      }
      if (losesAdmin) assertAdminRemains(activeAdmins - 1);
      if (role === user.role && status === user.status) return toPlatformUser(user);
      const [row] = await tx
        .update(platformUsers)
        .set({ role, status, updatedAt: now })
        .where(eq(platformUsers.id, id))
        .returning();
      if (!row) throw notFound();
      if (role !== user.role) await this.audit(tx, actor, 'platform_user.role_changed', id);
      if (status !== user.status) {
        const disabled = status === 'disabled';
        if (disabled) await endConsoleSessions(tx, sessionsOfUser(id), 'user_disabled', now);
        await this.audit(
          tx,
          actor,
          disabled ? 'platform_user.disabled' : 'platform_user.enabled',
          id,
        );
      }
      return toPlatformUser(row);
    });
  }

  /**
   * Rules 36 and 40: a lost password or TOTP. The user is pending setup again with a new setup
   * code; the password, the TOTP secret and the recovery codes are gone, and the sessions end. An
   * admin never resets themselves; a disabled user is enabled first. The CLI may reset the last
   * admin: it is how a lost last admin is recovered.
   */
  async reset(actor: PlatformUserManager, id: string): Promise<PlatformUserSetup> {
    const now = new Date();
    const setup = this.newSetupCode(now);
    return this.db.transaction(async (tx) => {
      const { user, activeAdmins } = await this.lockForChange(tx, id);
      if (actor.kind === 'platform') {
        if (actor.userId === id) {
          throw new DomainError('FORBIDDEN', 'An admin cannot reset themselves');
        }
        if (user.role === 'admin' && user.status === 'active') assertAdminRemains(activeAdmins - 1);
      }
      if (user.status === 'disabled') {
        throw new DomainError('INVALID_STATUS_TRANSITION', 'Enable the user before a reset');
      }
      const [row] = await tx
        .update(platformUsers)
        .set({
          status: 'pending_setup',
          passwordHash: null,
          totpSecret: null,
          totpLastStep: null,
          setupCodeHash: setup.hash,
          setupCodeExpiresAt: setup.expiresAt,
          failedSignIns: 0,
          signInLockedUntil: null,
          updatedAt: now,
        })
        .where(eq(platformUsers.id, id))
        .returning();
      if (!row) throw notFound();
      await archiveRecoveryCodes(tx, id, now);
      await endConsoleSessions(tx, sessionsOfUser(id), 'user_reset', now);
      await this.audit(tx, actor, 'platform_user.reset', id);
      return this.withSetupCode(row, setup);
    });
  }

  /**
   * Locks the active admins, then the user, always in that order, so concurrent changes count the
   * admins one after the other and never deadlock (rule 40 under concurrency).
   */
  private async lockForChange(tx: Transaction, id: string) {
    const admins = await tx
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(and(eq(platformUsers.role, 'admin'), eq(platformUsers.status, 'active')))
      .orderBy(asc(platformUsers.id))
      .for('update');
    const [user] = await tx
      .select()
      .from(platformUsers)
      .where(eq(platformUsers.id, id))
      .for('update');
    if (!user) throw notFound();
    return { user, activeAdmins: admins.length };
  }

  private newSetupCode(now: Date) {
    const code = newTypedCode(3);
    return {
      code,
      hash: this.hashes.hash('console-setup-code', code),
      expiresAt: new Date(now.getTime() + consolePolicy.setupCodeHours * HOUR_MS),
    };
  }

  private withSetupCode(row: PlatformUserRow, setup: { code: string; expiresAt: Date }) {
    return {
      user: toPlatformUser(row),
      setupCode: setup.code,
      setupCodeExpiresAt: setup.expiresAt.toISOString(),
    };
  }

  private audit(tx: Transaction, actor: PlatformUserManager, action: AuditAction, id: string) {
    return recordPlatformAudit(tx, { actor, action, entityType: 'platform_user', entityId: id });
  }
}

/** Archives the user's current recovery codes (a reset, or a new TOTP enrollment). */
export async function archiveRecoveryCodes(tx: Transaction, userId: string, now: Date) {
  await tx
    .update(platformUserRecoveryCodes)
    .set({ archivedAt: now, updatedAt: now })
    .where(
      and(
        eq(platformUserRecoveryCodes.platformUserId, userId),
        isNull(platformUserRecoveryCodes.archivedAt),
      ),
    );
}
