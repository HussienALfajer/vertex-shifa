import { afterAll, inject } from 'vitest';
import { createDatabase } from '../src/index.js';

/** The run's database as the owner, app and jobs roles; pools close after the file. */
export function connect() {
  const owner = createDatabase(inject('ownerUrl'));
  const app = createDatabase(inject('appUrl'));
  const jobs = createDatabase(inject('jobsUrl'));
  afterAll(async () => {
    await Promise.all([owner.$client.end(), app.$client.end(), jobs.$client.end()]);
  });
  return { owner, app, jobs };
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
