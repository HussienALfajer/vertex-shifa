/** Leading zero bits of `digest`. */
function leadingZeroBits(digest: Uint8Array): number {
  let bits = 0;
  for (const byte of digest) {
    if (byte !== 0) return bits + Math.clz32(byte) - 24;
    bits += 8;
  }
  return bits;
}

/** Digests hashed at once: Web Crypto is asynchronous, so a batch runs in parallel. */
const BATCH = 2_000;

const encoder = new TextEncoder();

/**
 * A nonce such that SHA-256 of `<challenge>:<nonce>` starts with `difficulty` zero bits (ADR 0016,
 * `proofOfWorkChallengeSchema`), as the clinic's main process solves it. In batches through Web
 * Crypto, so the page keeps answering while it works.
 */
export async function solveProofOfWork(challenge: string, difficulty: number): Promise<string> {
  for (let start = 0; ; start += BATCH) {
    const nonces = Array.from({ length: BATCH }, (_, index) => (start + index).toString(36));
    const digests = await Promise.all(
      nonces.map((nonce) =>
        crypto.subtle.digest('SHA-256', encoder.encode(`${challenge}:${nonce}`)),
      ),
    );
    const found = digests.findIndex(
      (digest) => leadingZeroBits(new Uint8Array(digest)) >= difficulty,
    );
    if (found !== -1) return nonces[found] as string;
  }
}
