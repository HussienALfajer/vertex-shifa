import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

// Throwaway keys, made for this test.
const tokenKey = generateKeyPairSync('ed25519')
  .privateKey.export({ format: 'der', type: 'pkcs8' })
  .toString('base64');
const env = {
  DATABASE_APP_URL: 'postgres://shifa_app:fake@localhost:5432/db',
  IDENTITY_HASH_KEY: randomBytes(32).toString('base64'),
  IDENTITY_TOKEN_KEY: tokenKey,
  IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

describe('loadConfig', () => {
  it('reads the database URL and the identity keys, with defaults for the rest', () => {
    const config = loadConfig(env);
    expect(config).toMatchObject({
      databaseUrl: 'postgres://shifa_app:fake@localhost:5432/db',
      host: '127.0.0.1',
      port: 3000,
      identity: { powDifficulty: 18, otpSender: 'fake' },
    });
    expect(config.identity.hashKey).toHaveLength(32);
    expect(config.identity.tokenKey.asymmetricKeyType).toBe('ed25519');
    expect(config.identity.encryptionKey).toHaveLength(32);
    expect(config.consoleOrigin).toBe('http://localhost:5174');
  });

  it('keeps only the origin of the console URL, and refuses an encryption key of another size', () => {
    expect(loadConfig({ ...env, CONSOLE_ORIGIN: 'https://console.example/x' }).consoleOrigin).toBe(
      'https://console.example',
    );
    expect(() =>
      loadConfig({ ...env, IDENTITY_ENCRYPTION_KEY: randomBytes(48).toString('base64') }),
    ).toThrow('Invalid API environment: IDENTITY_ENCRYPTION_KEY');
  });

  it('names the bad variables without printing their values', () => {
    const load = () =>
      loadConfig({
        ...env,
        DATABASE_APP_URL: 'mysql://user:fake-password@host/db',
        API_PORT: '70000',
      });
    expect(load).toThrow('Invalid API environment: DATABASE_APP_URL, API_PORT');
    expect(load).not.toThrow(/fake-password/);
  });

  it('refuses short hash keys and token keys that are not Ed25519', () => {
    const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 })
      .privateKey.export({ format: 'der', type: 'pkcs8' })
      .toString('base64');
    const load = () =>
      loadConfig({
        ...env,
        IDENTITY_HASH_KEY: randomBytes(16).toString('base64'),
        IDENTITY_TOKEN_KEY: rsa,
      });
    expect(load).toThrow('Invalid API environment: IDENTITY_HASH_KEY, IDENTITY_TOKEN_KEY');
  });

  it('refuses to start in production with the fake OTP sender, the example keys, a weak proof of work or a console without HTTPS', () => {
    expect(() =>
      loadConfig({ ...env, NODE_ENV: 'production', CONSOLE_ORIGIN: 'https://console.example' }),
    ).toThrow('Invalid API environment: OTP_SENDER');
    const example = {
      ...env,
      NODE_ENV: 'production',
      IDENTITY_HASH_KEY: Buffer.alloc(32).toString('base64'),
      IDENTITY_TOKEN_KEY: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.alloc(32),
      ]).toString('base64'),
      IDENTITY_POW_DIFFICULTY: '8',
      IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    };
    expect(() => loadConfig(example)).toThrow(
      'Invalid API environment: OTP_SENDER, IDENTITY_HASH_KEY, IDENTITY_TOKEN_KEY, IDENTITY_POW_DIFFICULTY, IDENTITY_ENCRYPTION_KEY, CONSOLE_ORIGIN',
    );
    expect(loadConfig({ ...example, NODE_ENV: 'development' }).identity.powDifficulty).toBe(8);
  });
});
