import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    ownerUrl: string;
    appUrl: string;
  }
}

function url(name: string): URL {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The db tests need a local PostgreSQL 17: copy .env.example to .env, ` +
        'then run pnpm db:setup-local (packages/db/CLAUDE.md).',
    );
  }
  return new URL(value);
}

/**
 * Creates a fresh database for this run as the owner role, applies every migration to it, hands
 * its URLs to the tests and drops it afterwards, so runs never share or leave data behind.
 */
export default async function setup(project: TestProject) {
  const owner = url('DATABASE_OWNER_URL');
  const app = url('DATABASE_APP_URL');
  const name = `shifa_test_${Date.now()}_${randomBytes(3).toString('hex')}`;

  const admin = new pg.Client({ connectionString: owner.href });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8'`);
  const teardown = async () => {
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
    await teardown();
    throw error;
  } finally {
    await pool.end();
  }

  project.provide('ownerUrl', owner.href);
  project.provide('appUrl', app.href);
  return teardown;
}
