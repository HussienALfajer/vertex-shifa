import { createPublicKey, verify } from 'node:crypto';
import type { StateStore } from './installation.js';
import type { PinCost, Protector } from './keys.js';

// Stand-ins for the unit tests and the E2E (synthetic only): a protector instead of `safeStorage`,
// a state store in memory, a cheap Argon2id cost, and Ed25519 verification as the API does it.

/** Seals with a fixed mask and a marker, so a value it did not seal never opens. */
export function testProtector(): Protector {
  const marker = Buffer.from('test-protector:');
  const mask = (bytes: Buffer) => Buffer.from(bytes.map((byte, index) => byte ^ (index % 251)));
  return {
    encrypt: (plain) => Buffer.concat([marker, mask(plain)]),
    decrypt: (sealed) => {
      if (!sealed.subarray(0, marker.length).equals(marker)) throw new Error('Not sealed here');
      return mask(sealed.subarray(marker.length));
    },
  };
}

export function memoryStore(): StateStore & { text: string | null } {
  const store = {
    text: null as string | null,
    read: async () => store.text,
    write: async (text: string) => {
      store.text = text;
    },
  };
  return store;
}

/** Argon2id's smallest cost: the tests check the logic, `keys.test.ts` the real cost. */
export const testPinCost: PinCost = { memory: 64, passes: 1 };

export function verifySignature(publicKey: string, message: string, signature: string): boolean {
  const key = createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(publicKey, 'base64').toString('base64url') },
    format: 'jwk',
  });
  return verify(null, Buffer.from(message), key, Buffer.from(signature, 'base64'));
}
