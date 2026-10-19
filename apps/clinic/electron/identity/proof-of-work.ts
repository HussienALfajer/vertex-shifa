import { createHash } from 'node:crypto';

/** Leading zero bits of `digest`. */
function leadingZeroBits(digest: Buffer): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte !== 0) return bits + Math.clz32(byte) - 24;
    bits += 8;
  }
  return bits;
}

const BATCH = 5_000;

/**
 * A nonce such that SHA-256 of `<challenge>:<nonce>` starts with `difficulty` zero bits (ADR 0016,
 * `proofOfWorkChallengeSchema`). Solved in batches that yield between them, so the main process
 * keeps answering the window while it works.
 */
export async function solveProofOfWork(challenge: string, difficulty: number): Promise<string> {
  for (let start = 0; ; start += BATCH) {
    for (let counter = start; counter < start + BATCH; counter += 1) {
      const nonce = counter.toString(36);
      const digest = createHash('sha256').update(`${challenge}:${nonce}`).digest();
      if (leadingZeroBits(digest) >= difficulty) return nonce;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
