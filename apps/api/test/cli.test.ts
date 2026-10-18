import type { INestApplication } from '@nestjs/common';
import { staffMemberships, withTenant } from '@vertex-shifa/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runTenantCommand } from '../src/cli/tenant-commands.js';
import { DATABASE } from '../src/core/database/database.module.js';
import { AuthService } from '../src/modules/platform/identity/index.js';
import { TenancyService } from '../src/modules/platform/tenancy/index.js';
import { createTestApp } from './app.js';

// The S01 acceptance steps 1 and 2, on this run's test database.

let app: INestApplication;
let tenancy: TenancyService;

beforeAll(async () => {
  app = await createTestApp();
  tenancy = app.get(TenancyService);
});
afterAll(() => app.close());

async function run(...argv: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runTenantCommand(
    argv,
    { tenancy, auth: app.get(AuthService) },
    {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
    },
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

async function create() {
  const result = await run('tenant:create', '--name-ar', 'عيادة تجريبية', '--reason', 'test');
  expect(result.code).toBe(0);
  return JSON.parse(result.out) as { id: string; status: string };
}

describe('tenant CLI', () => {
  it('creates a tenant in onboarding and lists it', async () => {
    const tenant = await create();
    expect(tenant.status).toBe('onboarding');
    const listed = await run('tenant:list', '--status', 'onboarding');
    expect(listed.code).toBe(0);
    const ids = (JSON.parse(listed.out) as { items: { id: string }[] }).items.map((t) => t.id);
    expect(ids).toContain(tenant.id);
  });

  it('invites the first owner with the tenant (S02 acceptance step 1), or neither', async () => {
    const created = await run(
      'tenant:create',
      '--name-ar',
      'عيادة تجريبية',
      '--owner-phone',
      '0930 000 101',
      '--owner-name',
      'مالك تجريبي',
      '--reason',
      'test',
    );
    expect(created.code).toBe(0);
    const tenant = JSON.parse(created.out) as { id: string };
    const owners = await withTenant(app.get(DATABASE), tenant.id, (tx) =>
      tx.select().from(staffMemberships),
    );
    expect(owners).toEqual([
      expect.objectContaining({ status: 'invited', roles: ['owner'], invitedName: 'مالك تجريبي' }),
    ]);
    const half = await run(
      'tenant:create',
      '--name-ar',
      'عيادة تجريبية',
      '--owner-phone',
      '0930 000 102',
      '--reason',
      'test',
    );
    expect(half).toMatchObject({ code: 1, err: 'VALIDATION_FAILED: invalid owner-name' });
  });

  it('closes a tenant, then refuses to reactivate it', async () => {
    const tenant = await create();
    const closed = await run(
      'tenant:set-status',
      tenant.id,
      '--status',
      'closed',
      '--reason',
      'test',
    );
    expect(closed.code).toBe(0);
    expect(JSON.parse(closed.out)).toMatchObject({ status: 'closed', statusReason: 'other' });
    const active = await run(
      'tenant:set-status',
      tenant.id,
      '--status',
      'active',
      '--reason',
      'test',
    );
    expect(active).toMatchObject({ code: 1, out: '' });
    expect(active.err).toMatch(/^INVALID_STATUS_TRANSITION: /);
  });

  it('lists and hides a tenant in the directory', async () => {
    const tenant = await create();
    const listed = await run(
      'tenant:set-directory',
      tenant.id,
      '--listed',
      'true',
      '--reason',
      'test',
    );
    expect(JSON.parse(listed.out)).toMatchObject({ directoryListed: true, directoryShown: false });
    const hidden = await run(
      'tenant:set-directory',
      tenant.id,
      '--listed',
      'false',
      '--reason',
      'test',
    );
    expect(JSON.parse(hidden.out)).toMatchObject({ directoryListed: false });
  });

  it('refuses invalid input without touching anything', async () => {
    expect(await run('tenant:create', '--name-ar', 'ع', '--reason', 'test')).toMatchObject({
      code: 1,
      err: 'VALIDATION_FAILED: invalid nameAr',
    });
    expect(
      (await run('tenant:set-status', 'not-a-uuid', '--status', 'closed', '--reason', 'x')).code,
    ).toBe(1);
    expect(
      (
        await run(
          'tenant:set-directory',
          (
            await create()
          ).id,
          '--listed',
          'maybe',
          '--reason',
          'test',
        )
      ).code,
    ).toBe(1);
  });

  it('answers the usage for an unknown command or option', async () => {
    expect((await run('tenant:delete')).code).toBe(2);
    expect((await run('tenant:list', '--force')).code).toBe(2);
    expect((await run()).err).toContain('Usage');
  });
});
