import {
  argon2,
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
