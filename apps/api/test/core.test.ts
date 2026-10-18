import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Inject,
  Logger,
  Module,
  Post,
  SerializeOptions,
} from '@nestjs/common';
import { contactPhoneSchema, DomainError } from '@vertex-shifa/contracts';
import type { Database } from '@vertex-shifa/db';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  ConsoleRoute,
  NoFeature,
  PatientRoute,
  Public,
  RequiresFeature,
  StaffRoute,
} from '../src/core/access/access.decorators.js';
import { DATABASE } from '../src/core/database/database.module.js';
import { createTestApp } from './app.js';

const probeSchema = z.object({ shown: z.string() }).meta({ id: 'TestProbe' });

/** Routes that exercise the core; registered only in this test. */
@Controller('probe')
class ProbeController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get('staff')
  @StaffRoute('probe.read')
  @NoFeature()
  staff() {}

  @Get('patient')
  @PatientRoute()
  @NoFeature()
  patient() {}

  @Get('console')
  @ConsoleRoute('probe.read')
  @NoFeature()
  console() {}

  @Get('feature')
  @Public()
  @RequiresFeature('probe')
  feature() {}

  @Get('undeclared')
  undeclared() {}

  @Get('conflict')
  @Public()
  @NoFeature()
  conflict() {
    throw new DomainError('CONFLICT', 'Slot already taken');
  }

  @Get('crash')
  @Public()
  @NoFeature()
  crash() {
    throw new TypeError('Unexpected state');
  }

  @Get('database-crash')
  @Public()
  @NoFeature()
  async databaseCrash() {
    await this.db.execute(sql`select ${'synthetic-secret'}::uuid`);
  }

  @Get('serialized')
  @Public()
  @NoFeature()
  @SerializeOptions({ schema: probeSchema })
  serialized() {
    return { shown: 'yes', hidden: 'never leaves the server' };
  }

  @Post('validated')
  @Public()
  @NoFeature()
  @SerializeOptions({ schema: contactPhoneSchema })
  validated(@Body({ schema: contactPhoneSchema }) input: z.output<typeof contactPhoneSchema>) {
    return input;
  }

  @Get('misshapen')
  @Public()
  @NoFeature()
  @SerializeOptions({ schema: probeSchema })
  misshapen() {
    return { shown: 42 };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('API core over HTTP', () => {
  let app: INestApplication;
  const logged = vi.spyOn(Logger.prototype, 'error');

  beforeAll(async () => {
    app = await createTestApp({ imports: [ProbeModule] });
  });
  afterAll(() => app.close());

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it('refuses routes that need a session until sessions exist', async () => {
    for (const path of ['/api/probe/staff', '/api/probe/patient', '/api/probe/console']) {
      const response = await get(path).expect(401);
      expect(response.body).toEqual({ code: 'UNAUTHENTICATED', message: 'No session' });
    }
  });

  it('refuses routes that need a feature until entitlements exist', async () => {
    const response = await get('/api/probe/feature').expect(403);
    expect(response.body.code).toBe('NOT_ENTITLED');
  });

  it('refuses a route that declares nothing', async () => {
    const response = await get('/api/probe/undeclared').expect(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('answers a domain error with its code and status', async () => {
    const response = await get('/api/probe/conflict').expect(409);
    expect(response.body).toEqual({ code: 'CONFLICT', message: 'Slot already taken' });
  });

  it('answers an unknown route with NOT_FOUND', async () => {
    const response = await get('/api/nowhere?phone=synthetic-secret').expect(404);
    expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'Not found' });
  });

  it('answers malformed JSON with VALIDATION_FAILED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/health')
      .set('content-type', 'application/json')
      .send('{"marker":"synthetic-secret" broken')
      .expect(400);
    expect(response.body).toEqual({ code: 'VALIDATION_FAILED', message: 'Malformed request' });
  });

  it('hides unexpected errors behind INTERNAL_ERROR and logs them', async () => {
    logged.mockClear();
    const response = await get('/api/probe/crash').expect(500);
    expect(response.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal error' });
    expect(String(logged.mock.calls[0]?.[0])).toContain('TypeError: Unexpected state');
  });

  it('logs a database error without the values its message quotes', async () => {
    logged.mockClear();
    const response = await get('/api/probe/database-crash').expect(500);
    expect(response.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal error' });
    const line = String(logged.mock.calls[0]?.[0]);
    expect(line).toBe('Database error 22P02');
    expect(line).not.toContain('synthetic-secret');
  });

  it('parses a body by its schema, and refuses one naming the fields, never the values', async () => {
    const post = (body: object) =>
      request(app.getHttpServer()).post('/api/probe/validated').send(body);
    const parsed = await post({ phone: '0900 000 001', whatsapp: true }).expect(201);
    expect(parsed.body).toEqual({ phone: '+963900000001', whatsapp: true });
    const refused = await post({ phone: '011 000 0001', whatsapp: true, note: 'x' }).expect(400);
    expect(refused.body).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Invalid fields: whatsapp',
    });
    const malformed = await post({ phone: '+1 202 000 0001', whatsapp: 'yes' }).expect(400);
    expect(malformed.body.code).toBe('VALIDATION_FAILED');
    expect(malformed.body.message).not.toContain('202');
  });

  it('answers only the fields of the response schema', async () => {
    const response = await get('/api/probe/serialized').expect(200);
    expect(response.body).toEqual({ shown: 'yes' });
  });

  it('refuses to send a response that breaks its schema', async () => {
    const response = await get('/api/probe/misshapen').expect(500);
    expect(response.body.code).toBe('INTERNAL_ERROR');
  });
});
