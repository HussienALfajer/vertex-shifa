import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, inject, it, vi } from 'vitest';
import { createDatabase, DATABASE_TIMEOUTS } from '../src/index.js';
import { connect } from './connections.js';

// The pool of `createDatabase` (RES-01, RES-02): every connection is bounded, and a connection the
// server closes never crashes the process.

const { app } = connect();
const onError = vi.fn<(description: string) => void>();
const db = createDatabase(inject('appUrl'), onError);
afterAll(() => db.$client.end());

const pid = async (work: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
  const { rows } = await work.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
  return rows[0]?.pid;
};

/** Ends a backend from another connection, as a server restart or an operator would. */
const terminate = (backend: number | undefined) =>
  app.execute(sql`select pg_terminate_backend(${backend}::int)`);

describe('createDatabase', () => {
  it('bounds statements, lock waits and idle transactions on every connection', async () => {
    const { rows } = await db.execute<Record<string, string>>(
      sql`select current_setting('statement_timeout') as statement,
        current_setting('lock_timeout') as lock,
        current_setting('idle_in_transaction_session_timeout') as idle`,
    );
    expect(rows[0]).toEqual({
      statement: `${DATABASE_TIMEOUTS.statementMs / 1000}s`,
      lock: `${DATABASE_TIMEOUTS.lockMs / 1000}s`,
      idle: `${DATABASE_TIMEOUTS.idleInTransactionMs / 60_000}min`,
    });
    expect(db.$client.options.connectionTimeoutMillis).toBe(DATABASE_TIMEOUTS.connectionMs);
  });

  it('reports an idle connection the server closed and keeps serving', async () => {
    await terminate(await pid(db));
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(await pid(db)).toBeTypeOf('number');
  });

  it('fails the transaction whose connection the server closed, without an unhandled error', async () => {
    const transaction = db.transaction(async (tx) => {
      await terminate(await pid(tx));
      // Idle inside the transaction while the server closes the connection under it.
      await new Promise((resolve) => setTimeout(resolve, 200));
      await tx.execute(sql`select 1`);
    });
    await expect(transaction).rejects.toThrow();
    expect(await pid(db)).toBeTypeOf('number');
  });
});
