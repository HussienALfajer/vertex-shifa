import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * A migrated throwaway database: the owner, app, jobs and queue role URLs for it, and how to drop
 * it.
 */
export type TestDatabase = {
  ownerUrl: string;
  appUrl: string;
  jobsUrl: string;
  queueUrl: string;
  drop: () => Promise<void>;
};

function url(name: string): URL {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Tests that use the database need a local PostgreSQL 17: copy ` +
        '.env.example to .env, then run pnpm db:setup-local (packages/db/CLAUDE.md).',
    );
  }
  return new URL(value);
}

/** Older than any run: a test database this old was left by a run that was killed before its drop. */
const STALE_AFTER_MS = 2 * 60 * 60_000;

/**
 * Drops the test databases that killed runs left behind (`shifa_test_<time>_<random>`, older than
 * `STALE_AFTER_MS`). One still in use is skipped: without `FORCE` the drop refuses it.
 */
async function dropStaleTestDatabases(admin: pg.Client): Promise<void> {
  const { rows } = await admin.query<{ datname: string }>(
    "SELECT datname FROM pg_database WHERE datname ~ '^shifa_test_[0-9]+_[0-9a-f]+$'",
  );
  const before = Date.now() - STALE_AFTER_MS;
  for (const { datname } of rows) {
    if (Number(datname.split('_')[2]) >= before) continue;
    try {
      await admin.query(`DROP DATABASE IF EXISTS ${datname}`);
    } catch {
      // Still in use, or another run dropped it first: the next run tries again.
    }
  }
}

/**
 * Creates a fresh database as the owner role (from `DATABASE_OWNER_URL`, `DATABASE_APP_URL`,
 * `DATABASE_JOBS_URL` and `DATABASE_QUEUE_URL`) and applies every migration to it, so test runs never share or leave data
 * behind. For a package's or app's test global setup; call `drop` when the run ends. Drops the
 * databases killed runs left first.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const owner = url('DATABASE_OWNER_URL');
  const app = url('DATABASE_APP_URL');
  const jobs = url('DATABASE_JOBS_URL');
  const queue = url('DATABASE_QUEUE_URL');
  const name = `shifa_test_${Date.now()}_${randomBytes(3).toString('hex')}`;

  const admin = new pg.Client({ connectionString: owner.href });
  await admin.connect();
  await dropStaleTestDatabases(admin);
  await admin.query(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`);
  const drop = async () => {
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  };

  owner.pathname = `/${name}`;
  app.pathname = `/${name}`;
  jobs.pathname = `/${name}`;
  queue.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: owner.href, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)),
    });
  } catch (error) {
    await drop();
    throw error;
  } finally {
    await pool.end();
  }

  return { ownerUrl: owner.href, appUrl: app.href, jobsUrl: jobs.href, queueUrl: queue.href, drop };
}
