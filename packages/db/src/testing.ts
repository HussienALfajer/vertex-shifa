import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/** A migrated throwaway database: the owner and app role URLs for it, and how to drop it. */
export type TestDatabase = {
  ownerUrl: string;
  appUrl: string;
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

/**
 * Creates a fresh database as the owner role (from `DATABASE_OWNER_URL` and `DATABASE_APP_URL`)
 * and applies every migration to it, so test runs never share or leave data behind. For a
 * package's or app's test global setup; call `drop` when the run ends.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const owner = url('DATABASE_OWNER_URL');
  const app = url('DATABASE_APP_URL');
  const name = `shifa_test_${Date.now()}_${randomBytes(3).toString('hex')}`;

  const admin = new pg.Client({ connectionString: owner.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`);
  const drop = async () => {
    await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
    await admin.end();
  };

  owner.pathname = `/${name}`;
  app.pathname = `/${name}`;
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

  return { ownerUrl: owner.href, appUrl: app.href, drop };
}
