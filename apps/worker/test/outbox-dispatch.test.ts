import { type INestApplicationContext, Injectable } from '@nestjs/common';
import type { Job } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { JOBS_ROLE_GRANTS } from '../src/core/queue/queue.module.js';
import type { OutboxJobData, QueueJob } from '../src/core/queue/queue-job.js';
import { addEvent, connect, dispatchedAt, startWorker } from './worker.js';

// The outbox end to end, as in production: two worker instances poll the outbox and work a test
// queue subscribed to `test.ran`. Events are synthetic and belong to tenants made for each test.

const received: Job<OutboxJobData>[] = [];

@Injectable()
class RecordingJob implements QueueJob {
  readonly queue = 'test.recording';
  readonly events = ['test.ran'];

  async work(jobs: Job<OutboxJobData>[]) {
    received.push(...jobs);
  }
}

const { app, queue } = connect();
const workers: INestApplicationContext[] = [];
const WAIT = { timeout: 15_000, interval: 100 };
const receivedIds = () => received.map((job) => job.id);

beforeAll(async () => {
  // Two instances starting together, as replicas would: pg-boss's install, the grants, queues and
  // subscriptions hold under concurrent starts.
  workers.push(...(await Promise.all([startWorker([RecordingJob]), startWorker([RecordingJob])])));
});

afterAll(async () => {
  for (const worker of workers) await worker.close();
});

describe('the outbox dispatcher', () => {
  it('hands every tenant’s pending event to the subscribed queue once, as a job with its id', async () => {
    const events = [await addEvent(app, 'test.ran'), await addEvent(app, 'test.ran')];
    await vi.waitFor(
      () => expect(receivedIds()).toEqual(expect.arrayContaining(events.map((e) => e.id))),
      WAIT,
    );
    for (const event of events) {
      const jobs = received.filter((job) => job.id === event.id);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        name: 'test.recording',
        data: { tenantId: event.tenantId, type: 'test.ran', payload: event.payload },
      });
      expect(await dispatchedAt(app, event)).toBeInstanceOf(Date);
    }
  });

  it('leaves an event pending while its hand-off fails, and dispatches it once it works', async () => {
    await queue.$client.query('REVOKE INSERT ON pgboss.job_common FROM shifa_jobs');
    try {
      const event = await addEvent(app, 'test.ran');
      // Both workers poll every second: several attempts fail and roll their claims back.
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      expect(await dispatchedAt(app, event)).toBeNull();
      expect(receivedIds()).not.toContain(event.id);

      await queue.$client.query(JOBS_ROLE_GRANTS);
      await vi.waitFor(() => expect(receivedIds()).toContain(event.id), WAIT);
      expect(await dispatchedAt(app, event)).toBeInstanceOf(Date);
    } finally {
      await queue.$client.query(JOBS_ROLE_GRANTS);
    }
  });
});
