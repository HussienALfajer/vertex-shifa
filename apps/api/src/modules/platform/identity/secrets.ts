import {
  argon2,
  createCipheriv,
  createDecipheriv,
  createHmac,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify,
} from 'node:crypto';

/**
 * Keyed hashes of secrets the server only compares (OTP codes, refresh tokens, rate-limit keys of
 * phones and addresses): HMAC-SHA-256 with `IDENTITY_HASH_KEY` (spec S02). Each use names its
 * purpose, so a hash made for one never matches another.
 */
export class KeyedHash {
  constructor(private readonly key: Buffer) {}

  hash(purpose: string, value: string): string {
    return createHmac('sha256', this.key).update(`${purpose}\n${value}`).digest('base64url');
  }

  matches(purpose: string, value: string, hash: string): boolean {
    return safeEqual(this.hash(purpose, value), hash);
  }
}

/**
 * Secrets the server must read back (the console TOTP secrets, spec S02), encrypted with
 * AES-256-GCM under `IDENTITY_ENCRYPTION_KEY`. Each one is bound to what it belongs to (`context`,
 * such as `platform_user:<id>:totp`), so a value copied to another row does not decrypt.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {}

  seal(context: string, plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(context));
    const sealed = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv, sealed, cipher.getAuthTag()]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  /** The plaintext, or undefined when the value was altered, moved or sealed with another key. */
  open(context: string, value: string): string | undefined {
    const [version, iv, sealed, tag] = value.split('.');
    if (version !== 'v1' || !iv || sealed === undefined || !tag) return undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      const plain = Buffer.concat([
        decipher.update(Buffer.from(sealed, 'base64url')),
        decipher.final(),
      ]);
      return plain.toString('utf8');
    } catch {
      return undefined;
    }
  }
}

/** Compares two strings in time independent of where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A random URL-safe token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

// Passwords: Argon2id (ADR 0005) in the PHC string format, with OWASP's minimum cost (19 MiB, two
// passes), so a sign-in costs tens of milliseconds.

const ARGON2 = { memory: 19_456, passes: 2, parallelism: 1, tagLength: 32 } as const;

function derive(
  password: string,
  salt: Buffer,
  cost: { memory: number; passes: number; parallelism: number; tagLength: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...cost }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

const b64 = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, ARGON2);
  const { memory, passes, parallelism } = ARGON2;
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${b64(salt)}$${b64(key)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match) return false;
  const [, memory, passes, parallelism, salt, hash] = match;
  const expected = Buffer.from(hash as string, 'base64');
  const key = await derive(password, Buffer.from(salt as string, 'base64'), {
    memory: Number(memory),
    passes: Number(passes),
    parallelism: Number(parallelism),
    tagLength: expected.length,
  });
  return timingSafeEqual(key, expected);
}

let decoy: Promise<string> | undefined;

/**
 * A hash no password matches, checked when the phone has no password, so a sign-in for an unknown
 * phone takes as long as one for a known phone (no account enumeration by timing).
 */
export function decoyPasswordHash(): Promise<string> {
  decoy ??= hashPassword(randomToken());
  return decoy;
}

/** Whether `signature` (base64) is the Ed25519 signature of `message` by `publicKey` (base64). */
export function verifyEd25519(publicKey: string, message: string, signature: string): boolean {
  try {
    const key = createPublicKey({
      key: {
        kty: 'OKP',
        crv: 'Ed25519',
        x: Buffer.from(publicKey, 'base64').toString('base64url'),
      },
      format: 'jwk',
    });
    return verify(null, Buffer.from(message), key, Buffer.from(signature, 'base64'));
  } catch {
    return false;
  }
}
