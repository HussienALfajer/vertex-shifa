import { createHash } from 'node:crypto';
import {
  DomainError,
  type ProofOfWorkChallenge,
  type ProofOfWorkSolution,
} from '@vertex-shifa/contracts';
import { type KeyedHash, randomToken, safeEqual } from './secrets.js';
import { SingleUse } from './single-use.js';

/** A challenge is valid for 2 minutes. */
const TTL_MS = 120_000;

/** Leading zero bits of `digest`. */
export function leadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Whether `nonce` solves `challenge` at `difficulty` bits (the contract's rule). */
export function solves(challenge: string, nonce: string, difficulty: number): boolean {
  const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest();
  return leadingZeroBits(digest) >= difficulty;
}

/**
 * The proof of work on sign-in and OTP requests (ADR 0016, spec S02 rule 14). A challenge is
 * stateless (`<id>.<expires>.<difficulty>.<mac>`, the mac a keyed hash) and used once.
 */
export class ProofOfWork {
  private readonly used = new SingleUse();

  constructor(
    private readonly hashes: KeyedHash,
    private readonly difficulty: number,
    private readonly now: () => number = Date.now,
  ) {}

  issue(): ProofOfWorkChallenge {
    const expires = this.now() + TTL_MS;
    const body = `${randomToken(12)}.${expires}.${this.difficulty}`;
    return {
      challenge: `${body}.${this.hashes.hash('pow', body)}`,
      difficulty: this.difficulty,
      expiresAt: new Date(expires).toISOString(),
    };
  }

  /** Accepts a solution once, or refuses with `POW_INVALID`. */
  verify(solution: ProofOfWorkSolution): void {
    const parts = solution.challenge.split('.');
    const [id, expires, difficulty, mac] = parts;
    const body = `${id}.${expires}.${difficulty}`;
    const valid =
      parts.length === 4 &&
      safeEqual(this.hashes.hash('pow', body), mac ?? '') &&
      Number(expires) > this.now() &&
      solves(solution.challenge, solution.nonce, Number(difficulty)) &&
      this.used.use(id as string, Number(expires));
    if (!valid) throw new DomainError('POW_INVALID', 'Invalid proof of work');
  }
}
