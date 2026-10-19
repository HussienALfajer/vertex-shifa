import {
  argon2,
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  sign,
} from 'node:crypto';

/**
 * The installation's keys (spec S02 rules 18 and 20, ADR 0021): an Ed25519 device key per clinic
 * registration and an Ed25519 user key per enrolled member. Only public keys leave the device;
 * private keys never reach the renderer.
 */

/** Encrypts to the device's Windows account: Electron `safeStorage` (DPAPI) in the app. */
export type Protector = {
  encrypt(plain: Buffer): Buffer;
  decrypt(sealed: Buffer): Buffer;
};

export type KeyPair = {
  /** Base64 of the raw 32-byte public key, as the API takes it (`publicKeySchema`). */
  publicKey: string;
  /** PKCS #8 DER of the private key. */
  privateKey: Buffer;
};

export function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    publicKey: Buffer.from(jwk.x ?? '', 'base64url').toString('base64'),
    privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }),
  };
}

/** The base64 Ed25519 signature of `message` (UTF-8) by a PKCS #8 private key. */
export function signMessage(privateKey: Buffer, message: string): string {
  const key = createPrivateKey({ key: privateKey, format: 'der', type: 'pkcs8' });
  return sign(null, Buffer.from(message), key).toString('base64');
}

/** Rule 20: Argon2id with 64 MiB and 3 passes (ADR 0021). Tests pass a cheaper cost. */
export type PinCost = { memory: number; passes: number };

export const pinCost: PinCost = { memory: 65_536, passes: 3 };

type WrappedKey = {
  v: 1;
  memory: number;
  passes: number;
  salt: string;
  iv: string;
  sealed: string;
  tag: string;
};

function pinKey(pin: string, salt: Buffer, cost: PinCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      { message: pin, nonce: salt, parallelism: 1, tagLength: 32, ...cost },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/**
 * A member's private key wrapped by the PIN, then by the device: `protector(AES-256-GCM(Argon2id(
 * PIN), key))`. `context` (the registration and enrollment) is authenticated, so a wrapped key
 * copied to another member does not open.
 */
export async function wrapWithPin(
  privateKey: Buffer,
  pin: string,
  context: string,
  protector: Protector,
  cost: PinCost = pinCost,
): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', await pinKey(pin, salt, cost), iv);
  cipher.setAAD(Buffer.from(context));
  const sealed = Buffer.concat([cipher.update(privateKey), cipher.final()]);
  const wrapped: WrappedKey = {
    v: 1,
    ...cost,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    sealed: sealed.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
  return protector.encrypt(Buffer.from(JSON.stringify(wrapped))).toString('base64');
}

/** The private key, or undefined for a wrong PIN (or a key wrapped for another context). */
export async function unwrapWithPin(
  stored: string,
  pin: string,
  context: string,
  protector: Protector,
): Promise<Buffer | undefined> {
  const wrapped = JSON.parse(
    protector.decrypt(Buffer.from(stored, 'base64')).toString('utf8'),
  ) as WrappedKey;
  if (wrapped.v !== 1) return undefined;
  const key = await pinKey(pin, Buffer.from(wrapped.salt, 'base64'), wrapped);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(wrapped.iv, 'base64'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(wrapped.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(wrapped.sealed, 'base64')),
      decipher.final(),
    ]);
  } catch {
    return undefined;
  }
}
