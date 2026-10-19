import { describe, expect, it } from 'vitest';
import { solveProofOfWork } from './proof-of-work';

async function zeroBits(challenge: string, nonce: string): Promise<number> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${challenge}:${nonce}`)),
  );
  let bits = 0;
  for (const byte of digest) {
    if (byte !== 0) return bits + Math.clz32(byte) - 24;
    bits += 8;
  }
  return bits;
}

describe('solveProofOfWork', () => {
  it('finds a nonce whose digest starts with the asked zero bits', async () => {
    for (const difficulty of [0, 4, 12]) {
      const nonce = await solveProofOfWork('challenge-1', difficulty);
      expect(await zeroBits('challenge-1', nonce)).toBeGreaterThanOrEqual(difficulty);
    }
  });

  it('gives the first such nonce', async () => {
    const nonce = await solveProofOfWork('challenge-2', 8);
    const earlier = Array.from({ length: Number.parseInt(nonce, 36) }, (_, index) =>
      index.toString(36),
    );
    const bits = await Promise.all(earlier.map((candidate) => zeroBits('challenge-2', candidate)));
    expect(bits.every((value) => value < 8)).toBe(true);
  });
});
