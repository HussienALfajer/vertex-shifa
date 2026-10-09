import 'reflect-metadata';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createDatabase, type Database, outboxEvents, withTenant } from '@vertex-shifa/db';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, inject } from 'vitest';
import { loadConfig } from '../src/core/config/config.js';
import type { QueueJob } from '../src/core/queue/queue-job.js';
import { WorkerModule } from '../src/worker.module.js';

export const testConfig = () =>
  loadConfig({ DATABASE_QUEUE_URL: inject('queueUrl'), DATABASE_JOBS_URL: inject('jobsUrl') });

/** The worker as production starts it, on this run's database, with `jobs`. Close it after use. */
export function startWorker(jobs: Type<QueueJob>[]): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(WorkerModule.forRoot(testConfig(), jobs), {
    logger: false,
  });
}

/** The run's database as the app, jobs and queue roles; pools close after the file. */
export function connect() {
  const app = createDatabase(inject('appUrl'));
  const jobs = createDatabase(inject('jobsUrl'));
  const queue = createDatabase(inject('queueUrl'));
  afterAll(async () => {
    await Promise.all([app.$client.end(), jobs.$client.end(), queue.$client.end()]);
  });
  return { app, jobs, queue };
}

/** One synthetic event of `type` for a new tenant, written by the app role as the API would. */
export async function addEvent(app: Database, type: string) {
  const tenantId = uuidv7();
  const payload = { run: uuidv7() };
  const [row] = await withTenant(app, tenantId, (tx) =>
    tx.insert(outboxEvents).values({ tenantId, type, payload }).returning({ id: outboxEvents.id }),
  );
  if (!row) throw new Error('no outbox event inserted');
  return { id: row.id, tenantId, type, payload };
}

/** When the event was claimed, read in its tenant as the app role; `null` while pending. */
export async function dispatchedAt(app: Database, event: { id: string; tenantId: string }) {
  const [row] = await withTenant(app, event.tenantId, (tx) =>
    tx
      .select({ dispatchedAt: outboxEvents.dispatchedAt })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, event.id)),
  );
  if (!row) throw new Error('outbox event not found');
  return row.dispatchedAt;
}

/** PostgreSQL's message for a refused statement; Drizzle wraps it as the cause of its error. */
export async function refusal(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
    return cause instanceof Error ? cause.message : String(cause);
  }
  throw new Error('expected the database to refuse the statement');
}
