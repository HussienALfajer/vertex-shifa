import 'reflect-metadata';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import type { INestApplication, ModuleMetadata } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { inject } from 'vitest';
import { configureApp } from '../src/app.js';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/core/config/config.js';

/** Identity keys made for this test run only; the proof of work is trivial so tests run fast. */
const identityEnv = {
  IDENTITY_HASH_KEY: randomBytes(32).toString('base64'),
  IDENTITY_TOKEN_KEY: generateKeyPairSync('ed25519')
    .privateKey.export({ format: 'der', type: 'pkcs8' })
    .toString('base64'),
  IDENTITY_POW_DIFFICULTY: '4',
  IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
};

/**
 * The API as production builds it, on this run's test database, plus `imports` (test-only
 * modules, which the global guard, filter and serializer cover too). Close it after the test.
 */
export async function createTestApp(
  options: {
    databaseUrl?: string;
    imports?: ModuleMetadata['imports'];
    /** Production's settings of `configureApp` (CORS). */
    production?: boolean;
  } = {},
): Promise<INestApplication> {
  const config = loadConfig({
    DATABASE_APP_URL: options.databaseUrl ?? inject('databaseUrl'),
    ...identityEnv,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.forRoot(config), ...(options.imports ?? [])],
  }).compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }), {
    production: options.production ?? false,
  });
  await app.init();
  return app;
}
