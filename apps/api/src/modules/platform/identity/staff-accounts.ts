import { accounts, type Transaction } from '@vertex-shifa/db';
import { eq, inArray } from 'drizzle-orm';
import type { StaffActor } from '../../../core/access/actor.js';
import type { StaffAccounts } from '../access/index.js';
import { type PlatformAuditActor, recordPlatformAudit } from '../audit/index.js';

/**
 * The account of a phone, created without a password when it has none (spec S02 rule 1). The
 * answer is the same either way; only the platform audit records a creation.
 */
export async function findOrCreateAccount(
  tx: Transaction,
  phone: string,
  actor: PlatformAuditActor,
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

/** The owner acting on a member's account, as the platform audit names them. */
const accountActor = (actor: StaffActor): PlatformAuditActor => ({
  kind: 'staff',
  accountId: actor.accountId,
  deviceId: actor.deviceId,
});

/** Accounts as staff management reaches them (the `STAFF_ACCOUNTS` port of access). */
export class StaffAccountsStore implements StaffAccounts {
  findOrCreate(tx: Transaction, phone: string, actor: StaffActor): Promise<string> {
    return findOrCreateAccount(tx, phone, accountActor(actor));
  }

  async profiles(tx: Transaction, accountIds: string[]) {
    if (accountIds.length === 0) return new Map();
    const rows = await tx
      .select({ id: accounts.id, phone: accounts.phone, nameAr: accounts.nameAr })
      .from(accounts)
      .where(inArray(accounts.id, accountIds));
    return new Map(rows.map((row) => [row.id, { phone: row.phone, nameAr: row.nameAr }]));
  }

  async authorizePasswordReset(
    tx: Transaction,
    accountId: string,
    actor: StaffActor,
    until: Date,
  ): Promise<void> {
    await tx
      .update(accounts)
      .set({ passwordResetAuthorizedUntil: until, updatedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await recordPlatformAudit(tx, {
      actor: accountActor(actor),
      action: 'account.password_reset_authorized',
      entityType: 'account',
      entityId: accountId,
      subjectTenantId: actor.tenantId,
    });
  }
}
