import { DomainError } from '@vertex-shifa/contracts';
import { describe, expect, it } from 'vitest';
import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows the limit per key and window, then refuses with RATE_LIMITED', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60_000, () => now);
    limiter.take('a');
    limiter.take('a');
    limiter.take('b');
    expect(() => limiter.take('a')).toThrow(DomainError);
    now = 60_000;
    expect(() => limiter.take('a')).not.toThrow();
  });
});
