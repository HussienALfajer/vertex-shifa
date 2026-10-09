import { sql } from 'drizzle-orm';
import type { Database, Transaction } from './client.js';

/** The transaction setting every RLS policy reads, through `current_tenant_id()` (ADR 0004). */
export const TENANT_SETTING = 'app.tenant_id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Runs `work` in one transaction that sees and writes only `tenantId`'s rows. The setting is
 * transaction-local, so it never leaks to the next user of the pooled connection. `tenantId` comes
 * from the authenticated session or device token, never from client input.
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  work: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!UUID.test(tenantId)) throw new Error('withTenant needs the tenant id as a UUID');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config(${TENANT_SETTING}, ${tenantId}, true)`);
    return work(tx);
  });
}
