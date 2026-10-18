import { DomainError } from '@vertex-shifa/contracts';
import { randomToken } from './secrets.js';

/**
 * Ids that may be used once until they expire (tickets, proof-of-work challenges), in the memory
 * of this process: enough while the API runs as one process (ADR 0017), like `RateLimiter`.
 * Expired ids are forgotten, since their tokens are refused anyway.
 */
export class SingleUse {
  private readonly used = new Map<string, number>();
  private lastSweep = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Marks `id` used; false when it already was. */
  use(id: string, expiresAt: number): boolean {
    this.sweep();
    if (this.used.has(id)) return false;
    this.used.set(id, expiresAt);
    return true;
  }

  isUsed(id: string): boolean {
    return this.used.has(id);
  }

  private sweep() {
    const now = this.now();
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [id, expiresAt] of this.used) if (expiresAt <= now) this.used.delete(id);
  }
}

/**
 * Server nonces a device or a member signs (spec S02 rule 23): single use, valid 60 seconds, bound
 * to what they were issued for (`device:<tenant>:<device>`), in this process's memory.
 */
export class Nonces {
  private readonly pending = new Map<string, { binding: string; expiresAt: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  issue(binding: string): { nonce: string; expiresAt: Date } {
    const now = this.now();
    for (const [nonce, entry] of this.pending) {
      if (entry.expiresAt <= now) this.pending.delete(nonce);
    }
    const nonce = randomToken(24);
    const expiresAt = now + this.ttlMs;
    this.pending.set(nonce, { binding, expiresAt });
    return { nonce, expiresAt: new Date(expiresAt) };
  }

  /** Uses up `nonce`, or refuses with `SIGNATURE_INVALID` when unknown, expired, used or bound elsewhere. */
  take(nonce: string, binding: string): void {
    const entry = this.pending.get(nonce);
    this.pending.delete(nonce);
    if (!entry || entry.binding !== binding || entry.expiresAt <= this.now()) {
      throw new DomainError('SIGNATURE_INVALID', 'Unknown or expired nonce');
    }
  }
}
