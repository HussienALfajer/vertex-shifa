import { DrizzleQueryError } from 'drizzle-orm';

/** Whether a failed query broke a unique constraint (SQLSTATE 23505), optionally a named one. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const cause = error instanceof DrizzleQueryError ? error.cause : error;
  if (!(cause instanceof Error) || !('code' in cause) || cause.code !== '23505') return false;
  return constraint === undefined || ('constraint' in cause && cause.constraint === constraint);
}
