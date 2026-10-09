import { z } from 'zod';

/**
 * What `GET /api/health` answers when the API can serve requests: it is up and reaches its
 * database. When the database is unreachable the API answers `SERVICE_UNAVAILABLE` instead.
 */
export const healthCheckSchema = z
  .object({
    status: z.literal('ok'),
    database: z.literal('ok'),
  })
  .meta({ id: 'HealthCheck' });

export type HealthCheck = z.infer<typeof healthCheckSchema>;
