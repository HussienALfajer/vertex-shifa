import { createDatabase } from '@vertex-shifa/db';
import { sql } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OutboxDispatcher } from '../src/core/outbox/outbox-dispatcher.js';
import { JOBS_ROLE_GRANTS, QUEUE_SCHEMA } from '../src/core/queue/queue.module.js';
import { addEvent, connect, dispatchedAt, refusal, startWorker, testConfig } from './worker.js';

// pg-boss's tables as the worker leaves them after a start, and the dispatcher's claim, driven
// directly (no worker polls in this file). Events are synthetic, for tenants made per test.

const { app, jobs, queue } = connect();
const DENIED = /permission denied for table/;
const QUEUE = 'test.concurrent';
const EVENT = 'test.raced';
let boss: PgBoss;

beforeAll(async () => {
  // A start installs pg-boss as the queue role and grants the jobs role its hand-off.
  await (await startWorker([])).close();
  boss = new PgBoss({
    connectionString: testConfig().queueDatabaseUrl,
    schema: QUEUE_SCHEMA,
    createSchema: false,
    supervise: false,
    schedule: false,
  });
  await boss.start();
  await boss.createQueue(QUEUE);
  await boss.subscribe(EVENT, QUEUE);
});

afterAll(async () => {
  await boss.stop({ graceful: false });
});

describe('the dispatcher’s claim', () => {
  it('splits pending events between concurrent dispatchers, each handed off once', async () => {
    const events = [];
    for (let i = 0; i < 10; i++) events.push(await addEvent(app, EVENT));
    const second = createDatabase(testConfig().jobsDatabaseUrl);
    try {
      const [a, b] = await Promise.all([
        new OutboxDispatcher(jobs, boss).dispatchBatch(),
        new OutboxDispatcher(second, boss).dispatchBatch(),
      ]);
      expect(a.filter((id) => b.includes(id))).toEqual([]);
      expect([...a, ...b]).toEqual(expect.arrayContaining(events.map((e) => e.id)));
    } finally {
      await second.$client.end();
    }
    for (const event of events) {
      const job = await boss.getJobById(QUEUE, event.id);
      expect(job?.data).toEqual({ tenantId: event.tenantId, type: EVENT, payload: event.payload });
    }
  });

  it('leaves an event nobody subscribes to pending, and claims it once a queue subscribes', async () => {
    const event = await addEvent(app, 'test.later');
    const dispatcher = new OutboxDispatcher(jobs, boss);
    expect(await dispatcher.dispatchBatch()).not.toContain(event.id);
    expect(await dispatchedAt(app, event)).toBeNull();

    await boss.subscribe('test.later', QUEUE);
    expect(await dispatcher.dispatchBatch()).toContain(event.id);
    expect((await boss.getJobById(QUEUE, event.id))?.data).toMatchObject({ type: 'test.later' });
  });

  it('fails and keeps the claim back when the hand-off to pg-boss fails', async () => {
    const event = await addEvent(app, EVENT);
    const dispatcher = new OutboxDispatcher(jobs, boss);
    await queue.$client.query('REVOKE INSERT ON pgboss.job_common FROM shifa_jobs');
    try {
      await expect(dispatcher.dispatchBatch()).rejects.toThrow();
      expect(await dispatchedAt(app, event)).toBeNull();
    } finally {
      await queue.$client.query(JOBS_ROLE_GRANTS);
    }
    expect(await dispatcher.dispatchBatch()).toContain(event.id);
    expect(await boss.getJobById(QUEUE, event.id)).not.toBeNull();
  });

  it('finds pending events through the partial index', async () => {
    const plan = await jobs.transaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const { rows } = await tx.execute<{ 'QUERY PLAN': string }>(
        sql`explain select id from outbox_events
            where dispatched_at is null and type in (select event from pgboss.subscription)
            order by id limit 100 for update skip locked`,
      );
      return rows.map((row) => row['QUERY PLAN']).join('\n');
    });
    expect(plan).toContain('outbox_events_pending_idx');
  });
});

describe('pg-boss’s schema', () => {
  it('holds tables owned by the queue role only', async () => {
    const { rows } = await queue.$client.query<{ owner: string }>(
      `select distinct pg_get_userbyid(relowner) as owner from pg_class
       where relnamespace = $1::regnamespace and relkind in ('r', 'p')`,
      [QUEUE_SCHEMA],
    );
    expect(rows).toEqual([{ owner: 'shifa_queue' }]);
  });

  it('runs no function with its owner’s rights', async () => {
    const { rows } = await queue.$client.query(
      'select proname from pg_proc where pronamespace = $1::regnamespace and prosecdef',
      [QUEUE_SCHEMA],
    );
    expect(rows).toEqual([]);
  });

  it('lets the jobs role see subscribed events, read queue settings and add jobs, nothing more', async () => {
    const { rows: tables } = await queue.$client.query(
      `select c.relname as table, p.privilege
       from pg_class c
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES',
                               'TRIGGER']) as p(privilege)
       where c.relnamespace = $1::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f')
         and has_table_privilege('shifa_jobs', c.oid, p.privilege)
       order by 1, 2`,
      [QUEUE_SCHEMA],
    );
    expect(tables).toEqual([
      { table: 'job_common', privilege: 'INSERT' },
      { table: 'queue', privilege: 'SELECT' },
    ]);
    const { rows: columns } = await queue.$client.query(
      `select c.relname as table, a.attname as column, p.privilege
       from pg_class c
       join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
       cross join unnest(array['SELECT', 'UPDATE', 'REFERENCES']) as p(privilege)
       where c.relnamespace = $1::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'f') and c.relname <> 'queue'
         and has_column_privilege('shifa_jobs', c.oid, a.attnum, p.privilege)
       order by 1, 2, 3`,
      [QUEUE_SCHEMA],
    );
    expect(columns).toEqual([
      { table: 'job_common', column: 'id', privilege: 'SELECT' },
      { table: 'subscription', column: 'event', privilege: 'SELECT' },
    ]);
    // pg-boss makes ids with gen_random_uuid(): no sequence the jobs role could advance.
    const { rows: sequences } = await queue.$client.query(
      `select relname from pg_class where relnamespace = $1::regnamespace and relkind = 'S'`,
      [QUEUE_SCHEMA],
    );
    expect(sequences).toEqual([]);
  });

  it('refuses the jobs role reading job data, changing or removing jobs', async () => {
    expect(await refusal(jobs.$client.query('select data from pgboss.job_common'))).toMatch(DENIED);
    expect(
      await refusal(jobs.$client.query(`update pgboss.job_common set state = 'completed'`)),
    ).toMatch(DENIED);
    expect(await refusal(jobs.$client.query('delete from pgboss.job_common'))).toMatch(DENIED);
  });

  it('keeps the queue role away from tenant data', async () => {
    expect(await refusal(queue.$client.query('select id from outbox_events'))).toMatch(DENIED);
  });
});
