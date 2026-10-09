import { z } from 'zod';

/** The role pg-boss runs as, in its own schema only (`packages/db/CLAUDE.md`). */
export const QUEUE_ROLE = 'shifa_queue';
/** The audited platform-jobs role the outbox dispatcher claims events as (ADR 0004). */
export const JOBS_ROLE = 'shifa_jobs';

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

/**
 * The worker's environment, checked once at start-up: a missing or malformed value stops the
 * process before it runs anything. Each URL must use its own role, so pg-boss never runs as the
 * jobs role and the dispatcher never claims as the queue role. Error messages name the variable,
 * never its value (the URLs carry passwords).
 */
const configSchema = z
  .object({
    DATABASE_QUEUE_URL: postgresUrl.refine((url) => new URL(url).username === QUEUE_ROLE),
    DATABASE_JOBS_URL: postgresUrl.refine((url) => new URL(url).username === JOBS_ROLE),
  })
  .transform((env) => ({
    queueDatabaseUrl: env.DATABASE_QUEUE_URL,
    jobsDatabaseUrl: env.DATABASE_JOBS_URL,
  }));

export type Config = z.output<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid worker environment: ${names}`);
  }
  return result.data;
}
