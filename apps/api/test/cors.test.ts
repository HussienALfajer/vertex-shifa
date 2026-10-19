import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp } from './app.js';

// The clinic app calls the API across origins (spec S02); the console never does.

describe('CORS', () => {
  let app: INestApplication;
  afterEach(() => app.close());

  const preflight = (path: string, origin: string) =>
    request(app.getHttpServer())
      .options(path)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization, content-type, x-device-token');

  it('allows the clinic app, with its session, device and ticket headers', async () => {
    app = await createTestApp({ production: true });
    const response = await preflight('/api/sessions/refresh', 'app://clinic');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('app://clinic');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    const headers = response.headers['access-control-allow-headers'] ?? '';
    for (const header of ['authorization', 'content-type', 'x-device-token', 'x-sign-in-ticket']) {
      expect(headers).toContain(header);
    }
    const read = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'app://clinic');
    expect(read.headers['access-control-allow-origin']).toBe('app://clinic');
  });

  it('refuses any other origin, never reflecting it', async () => {
    app = await createTestApp({ production: true });
    const response = await preflight('/api/auth/sign-in', 'https://evil.example');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows the dev server outside production only', async () => {
    app = await createTestApp({ production: true });
    let response = await preflight('/api/auth/sign-in', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    await app.close();
    app = await createTestApp({ production: false });
    response = await preflight('/api/auth/sign-in', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('answers no CORS on console routes, even to the clinic app', async () => {
    app = await createTestApp({ production: true });
    const response = await preflight('/api/console/auth/sign-in', 'app://clinic');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
