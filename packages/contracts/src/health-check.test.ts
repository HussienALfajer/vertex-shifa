import { describe, expect, it } from 'vitest';
import { healthCheckSchema } from './health-check.js';

describe('health check', () => {
  it('accepts only a healthy answer and drops anything else', () => {
    expect(healthCheckSchema.parse({ status: 'ok', database: 'ok', extra: 1 })).toEqual({
      status: 'ok',
      database: 'ok',
    });
    expect(healthCheckSchema.safeParse({ status: 'ok', database: 'down' }).success).toBe(false);
  });
});
