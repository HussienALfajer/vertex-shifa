import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { describeForLog } from './describe-for-log.js';
import * as schema from './schema/index.js';

/**
 * The bounds of every connection, so a lost server, a held lock or a forgotten transaction fails
 * one request instead of hanging the process: opening a connection, one statement, the wait for a
 * lock, and a transaction left idle (PostgreSQL then closes the connection).
 */
export const DATABASE_TIMEOUTS = {
  connectionMs: 10_000,
  statementMs: 30_000,
  lockMs: 10_000,
  idleInTransactionMs: 60_000,
} as const;

/**
 * A Drizzle database over a node-postgres pool. Apps connect as the app role (`shifa_app`), which
 * cannot bypass row-level security; tenant data is reached only through `withTenant`.
 *
 * A connection the server closes (a restart, `idle_in_transaction_session_timeout`, a terminated
 * backend) never crashes the process: an idle one is dropped by the pool and reported to `onError`,
 * one in use fails its next query, which rejects the request that holds it.
 */
export function createDatabase(
  connectionString: string,
  onError: (description: string) => void = (description) =>
    console.error(`Database pool: ${description}`),
) {
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: DATABASE_TIMEOUTS.connectionMs,
    statement_timeout: DATABASE_TIMEOUTS.statementMs,
    lock_timeout: DATABASE_TIMEOUTS.lockMs,
    idle_in_transaction_session_timeout: DATABASE_TIMEOUTS.idleInTransactionMs,
  });
  pool.on('error', (error) => onError(describeForLog(error)));
  // While a client is checked out the pool's own listener is detached; without this one, the
  // client's `error` event would be unhandled. The holder learns of it from its next query.
  pool.on('connect', (client) => client.on('error', () => {}));
  return drizzle({ client: pool, schema, casing: 'snake_case' });
}

export type Database = ReturnType<typeof createDatabase>;

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
