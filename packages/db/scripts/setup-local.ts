// Prepares a local PostgreSQL 17 for Vertex Shifa: creates or updates the owner role (runs
// migrations, owns the tables; may create the throwaway test databases), the app role (what the
// apps connect as; cannot bypass RLS) and the platform-jobs role (the worker's cross-tenant jobs;
// cannot bypass RLS either, every statement it runs is logged), then the development database
// owned by the owner role.
// Safe to run again: it only creates what is missing and resets the three roles' passwords and
// attributes. It never drops anything and does not migrate (`pnpm db:migrate` does).
// Run from the repository root: `pnpm db:setup-local`, with the four URLs of .env.example in .env
// or the environment. Local machines and CI only: servers get their roles from deploy/.
import pg from 'pg';

const OWNER_ROLE = 'shifa_owner';
const APP_ROLE = 'shifa_app';
const JOBS_ROLE = 'shifa_jobs';

function url(name: string): URL {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: copy .env.example to .env and fill it in`);
  return new URL(value);
}

const admin = url('DATABASE_ADMIN_URL');
const owner = url('DATABASE_OWNER_URL');
const app = url('DATABASE_APP_URL');
const jobs = url('DATABASE_JOBS_URL');
const database = decodeURIComponent(owner.pathname.slice(1));

if (owner.username !== OWNER_ROLE || app.username !== APP_ROLE || jobs.username !== JOBS_ROLE) {
  throw new Error(
    `The owner, app and jobs URLs must use the roles ${OWNER_ROLE}, ${APP_ROLE} and ${JOBS_ROLE}`,
  );
}
if (
  !database ||
  [app, jobs].some((role) => decodeURIComponent(role.pathname.slice(1)) !== database)
) {
  throw new Error('The owner, app and jobs URLs must name the same database');
}

const client = new pg.Client({ connectionString: admin.href });
await client.connect();
try {
  const { rows } = await client.query<{ version: number }>(
    "select current_setting('server_version_num')::int as version",
  );
  if ((rows[0]?.version ?? 0) < 170000) throw new Error('PostgreSQL 17 or later is required');

  async function upsertRole(role: string, password: string, attributes: string) {
    const exists = await client.query('select 1 from pg_roles where rolname = $1', [role]);
    const verb = exists.rowCount ? 'ALTER' : 'CREATE';
    await client.query(
      `${verb} ROLE ${client.escapeIdentifier(role)} WITH LOGIN ${attributes} PASSWORD ${client.escapeLiteral(password)}`,
    );
    process.stdout.write(`${verb === 'CREATE' ? 'created' : 'updated'} role ${role}\n`);
  }

  await upsertRole(
    OWNER_ROLE,
    decodeURIComponent(owner.password),
    'NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION CREATEDB',
  );
  await upsertRole(
    APP_ROLE,
    decodeURIComponent(app.password),
    'NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION NOCREATEDB NOINHERIT',
  );
  await upsertRole(
    JOBS_ROLE,
    decodeURIComponent(jobs.password),
    'NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOREPLICATION NOCREATEDB NOINHERIT',
  );
  // The audit of the platform-jobs role (ADR 0004): every statement it runs goes to the server log.
  // Only a superuser may change log_statement, so its sessions cannot turn this off.
  await client.query(`ALTER ROLE ${JOBS_ROLE} SET log_statement = 'all'`);

  const existing = await client.query<{ owner: string }>(
    'select pg_get_userbyid(datdba) as owner from pg_database where datname = $1',
    [database],
  );
  const current = existing.rows[0];
  if (!current) {
    await client.query(
      `CREATE DATABASE ${client.escapeIdentifier(database)} OWNER ${OWNER_ROLE} ENCODING 'UTF8' TEMPLATE template0`,
    );
    process.stdout.write(`created database ${database}\n`);
  } else if (current.owner !== OWNER_ROLE) {
    throw new Error(
      `Database ${database} exists and belongs to ${current.owner}, not ${OWNER_ROLE}`,
    );
  } else {
    process.stdout.write(`database ${database} exists\n`);
  }
} finally {
  await client.end();
}
