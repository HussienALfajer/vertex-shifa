import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const QUEUE_URL = 'postgres://shifa_queue:fake@localhost:5432/db';
const JOBS_URL = 'postgres://shifa_jobs:fake@localhost:5432/db';

describe('loadConfig', () => {
  it('reads the queue and jobs database URLs', () => {
    expect(loadConfig({ DATABASE_QUEUE_URL: QUEUE_URL, DATABASE_JOBS_URL: JOBS_URL })).toEqual({
      queueDatabaseUrl: QUEUE_URL,
      jobsDatabaseUrl: JOBS_URL,
    });
  });

  it('refuses a URL of another role, so pg-boss never runs as the jobs role', () => {
    expect(() => loadConfig({ DATABASE_QUEUE_URL: JOBS_URL, DATABASE_JOBS_URL: JOBS_URL })).toThrow(
      'Invalid worker environment: DATABASE_QUEUE_URL',
    );
    expect(() =>
      loadConfig({ DATABASE_QUEUE_URL: QUEUE_URL, DATABASE_JOBS_URL: QUEUE_URL }),
    ).toThrow('Invalid worker environment: DATABASE_JOBS_URL');
  });

  it('names the bad variables without printing their values', () => {
    const load = () =>
      loadConfig({ DATABASE_QUEUE_URL: 'mysql://shifa_queue:fake-password@host/db' });
    expect(load).toThrow('Invalid worker environment: DATABASE_QUEUE_URL, DATABASE_JOBS_URL');
    expect(load).not.toThrow(/fake-password/);
  });
});
