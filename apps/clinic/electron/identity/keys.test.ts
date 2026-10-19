import { publicKeySchema, signatureSchema } from '@vertex-shifa/contracts';
import { describe, expect, it } from 'vitest';
import { generateKeyPair, pinCost, signMessage, unwrapWithPin, wrapWithPin } from './keys.js';
import { testProtector, verifySignature } from './test-support.js';

describe('device and user keys', () => {
  it('makes Ed25519 key pairs whose public key and signatures the API accepts', () => {
    const first = generateKeyPair();
    const second = generateKeyPair();
    expect(publicKeySchema.safeParse(first.publicKey).success).toBe(true);
    expect(first.publicKey).not.toBe(second.publicKey);
    const signature = signMessage(first.privateKey, 'vertex-shifa/test\nnonce');
    expect(signatureSchema.safeParse(signature).success).toBe(true);
    expect(verifySignature(first.publicKey, 'vertex-shifa/test\nnonce', signature)).toBe(true);
    expect(verifySignature(second.publicKey, 'vertex-shifa/test\nnonce', signature)).toBe(false);
  });
});

describe('PIN wrapping', () => {
  const protector = testProtector();

  it('wraps with Argon2id at 64 MiB and 3 passes, then the protector', async () => {
    expect(pinCost).toEqual({ memory: 65_536, passes: 3 });
    const { privateKey } = generateKeyPair();
    const wrapped = await wrapWithPin(privateKey, '258147', 'context', protector);
    // The outer layer is the protector's: without it the value does not even parse.
    const inner = JSON.parse(protector.decrypt(Buffer.from(wrapped, 'base64')).toString('utf8'));
    expect(inner).toMatchObject({ v: 1, memory: 65_536, passes: 3 });
    expect(inner.sealed).not.toBe(privateKey.toString('base64'));
    expect(await unwrapWithPin(wrapped, '258147', 'context', protector)).toEqual(privateKey);
  });

  it('opens with the right PIN only, for the context it was wrapped for', async () => {
    const { privateKey } = generateKeyPair();
    const cost = { memory: 64, passes: 1 };
    const wrapped = await wrapWithPin(privateKey, '258147', 'member-a', protector, cost);
    expect(await unwrapWithPin(wrapped, '258148', 'member-a', protector)).toBeUndefined();
    expect(await unwrapWithPin(wrapped, '258147', 'member-b', protector)).toBeUndefined();
    expect(await unwrapWithPin(wrapped, '258147', 'member-a', protector)).toEqual(privateKey);
  });

  it('never opens without the protector that sealed it (another Windows account)', async () => {
    const { privateKey } = generateKeyPair();
    const wrapped = await wrapWithPin(privateKey, '258147', 'context', protector, {
      memory: 64,
      passes: 1,
    });
    const elsewhere = {
      encrypt: (plain: Buffer) => plain,
      decrypt: () => {
        throw new Error('Not sealed here');
      },
    };
    await expect(unwrapWithPin(wrapped, '258147', 'context', elsewhere)).rejects.toThrow();
  });
});
