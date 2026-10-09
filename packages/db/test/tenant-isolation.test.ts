import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, describe, expect, inject, it } from 'vitest';
import {
  auditEntries,
  type Database,
  outboxEvents,
  type Transaction,
  withTenant,
} from '../src/index.js';
import * as schema from '../src/schema/index.js';
import { connect, refusal } from './connections.js';

const { app } = connect();
// One connection only, so a leaked setting would reach the next transaction.
const single: Database = drizzle({
  client: new pg.Pool({ connectionString: inject('appUrl'), max: 1 }),
  schema,
  casing: 'snake_case',
});
afterAll(() => single.$client.end());

const tenantA = uuidv7();
const tenantB = uuidv7();
const RLS_REFUSAL = /new row violates row-level security policy/;

const entry = (tenantId: string) => ({
  tenantId,
  actorKind: 'system',
  action: 'test.ran',
  entityType: 'test',
  occurredAt: new Date(),
});
const event = (tenantId: string) => ({ tenantId, type: 'test.ran', payload: { run: 1 } });

async function currentTenant(db: Database | Transaction) {
  const result = await db.execute<{ tenant: string | null }>(
    sql`select current_tenant_id() as tenant`,
  );
  return result.rows[0]?.tenant;
}

describe('withTenant', () => {
  it('refuses a tenant id that is not a UUID', async () => {
    for (const tenantId of ['', 'tenant-a', `${tenantA}' or true --`]) {
      await expect(withTenant(app, tenantId, async () => 1)).rejects.toThrow(/UUID/);
    }
  });

  it('reads and writes only the rows of its tenant', async () => {
    await withTenant(app, tenantA, (tx) => tx.insert(auditEntries).values(entry(tenantA)));
    await withTenant(app, tenantB, (tx) => tx.insert(auditEntries).values(entry(tenantB)));

    for (const tenant of [tenantA, tenantB]) {
      const seen = await withTenant(app, tenant, (tx) =>
        tx
          .select({ tenantId: auditEntries.tenantId })
          .from(auditEntries)
          .where(inArray(auditEntries.tenantId, [tenantA, tenantB])),
      );
      expect(seen).toEqual([{ tenantId: tenant }]);
    }
  });

  it("refuses to write another tenant's row", async () => {
    expect(
      await refusal(
        withTenant(app, tenantA, (tx) => tx.insert(auditEntries).values(entry(tenantB))),
      ),
    ).toMatch(RLS_REFUSAL);
    expect(
      await refusal(
        withTenant(app, tenantA, (tx) => tx.insert(outboxEvents).values(event(tenantB))),
      ),
    ).toMatch(RLS_REFUSAL);
  });

  it('sees nothing and writes nothing outside a tenant transaction', async () => {
    expect(await currentTenant(app)).toBeNull();
    expect(await app.select().from(auditEntries)).toEqual([]);
    expect(await app.select().from(outboxEvents)).toEqual([]);
    expect(await refusal(app.insert(auditEntries).values(entry(tenantA)))).toMatch(RLS_REFUSAL);
    expect(await refusal(app.insert(outboxEvents).values(event(tenantA)))).toMatch(RLS_REFUSAL);
  });

  it('never leaks its tenant to the next use of the pooled connection', async () => {
    expect(await withTenant(single, tenantA, (tx) => currentTenant(tx))).toBe(tenantA);
    expect(await currentTenant(single)).toBeNull();
    expect(await single.select().from(auditEntries)).toEqual([]);

    await expect(
      withTenant(single, tenantB, async (tx) => {
        await currentTenant(tx);
        throw new Error('work failed');
      }),
    ).rejects.toThrow('work failed');
    expect(await currentTenant(single)).toBeNull();
    expect(await single.select().from(auditEntries)).toEqual([]);
  });
});

describe('outbox_events', () => {
  it('keeps each tenant to its own events', async () => {
    await withTenant(app, tenantA, (tx) => tx.insert(outboxEvents).values(event(tenantA)));
    const seenByB = await withTenant(app, tenantB, (tx) =>
      tx
        .select()
        .from(outboxEvents)
        .where(inArray(outboxEvents.tenantId, [tenantA])),
    );
    expect(seenByB).toEqual([]);
    const [mine] = await withTenant(app, tenantA, (tx) =>
      tx
        .select()
        .from(outboxEvents)
        .where(inArray(outboxEvents.tenantId, [tenantA])),
    );
    expect(mine).toMatchObject({ type: 'test.ran', payload: { run: 1 }, dispatchedAt: null });
  });
});
