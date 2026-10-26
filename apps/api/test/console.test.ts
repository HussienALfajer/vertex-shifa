import type { INestApplication } from '@nestjs/common';
import { DomainError, type ErrorCode } from '@vertex-shifa/contracts';
import { KeyedHash } from '@vertex-shifa/crypto';
import {
  accounts,
  accountTenantLinks,
  auditEntries,
  platformAuditEntries,
  platformSessions,
  platformUsers,
  staffMemberships,
  withTenant,
} from '@vertex-shifa/db';
import { and, asc, eq, gte, ne } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runPlatformUserCommand } from '../src/cli/platform-user-commands.js';
import type { PlatformActor } from '../src/core/access/actor.js';
import { totpCode, totpStep } from '../src/modules/platform/identity/totp.js';
import { createTestApp } from './app.js';
import { CONSOLE_PASSWORD, ConsoleClient, type ConsoleUser, sessionCookie } from './console.js';
import { newPhone, StaffClient } from './staff.js';

// The console tests of spec S02 (Acceptance, "Tests" and step 10): setup code, TOTP enrollment and
// replay refusal, single-use recovery codes, re-authentication, idle and absolute expiry,
// LAST_ADMIN, the platform audit of every request, owner recovery. Synthetic data only.

let app: INestApplication;
let staff: StaffClient;
let client: ConsoleClient;
let admin: ConsoleUser;
let support: ConsoleUser;

beforeAll(async () => {
  app = await createTestApp();
  staff = await StaffClient.create(app);
  client = new ConsoleClient(staff);
  admin = await client.setUp('admin');
  support = await client.setUp('support');
});
afterAll(() => app.close());

async function refusal(work: Promise<unknown>): Promise<ErrorCode> {
  try {
    await work;
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

async function userRow(id: string) {
  const [row] = await staff.db.select().from(platformUsers).where(eq(platformUsers.id, id));
  return row;
}

/** The platform audit rows written for a user, in order. */
async function platformAuditOf(userId: string) {
  return staff.db
    .select({
      action: platformAuditEntries.action,
      entityType: platformAuditEntries.entityType,
      entityId: platformAuditEntries.entityId,
      subjectTenantId: platformAuditEntries.subjectTenantId,
      requestRoute: platformAuditEntries.requestRoute,
    })
    .from(platformAuditEntries)
    .where(eq(platformAuditEntries.actorId, userId))
    .orderBy(platformAuditEntries.id);
}

describe('setup (rule 36)', () => {
  it('signs a new user in with the setup code once, enrolls TOTP and shows ten recovery codes', async () => {
    const created = await client.create('support');
    const wrong = await client.signIn(created.phone, { setupCode: 'AAAA-BBBB-CCCC' });
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    const noPassword = await client.signIn(created.phone, { password: CONSOLE_PASSWORD });
    expect(noPassword.body.code).toBe('INVALID_CREDENTIALS');
    const signedIn = await client.signIn(created.phone, { setupCode: created.setupCode });
    expect(signedIn.status).toBe(201);
    expect(signedIn.body).toMatchObject({ step: 'setup' });
    expect(signedIn.body.totpUri).toContain(`secret=${signedIn.body.totpSecret}`);
    // The secret is stored encrypted, never as given.
    const pending = await userRow(created.id);
    expect(pending?.totpSecret).not.toContain(signedIn.body.totpSecret);
    const { ticket, totpSecret } = signedIn.body;
    const code = totpCode(totpSecret, totpStep(Date.now()));

    const setup = (body: object) => client.call('post', '/api/console/auth/setup').send(body);
    const stale = totpCode(totpSecret, totpStep(Date.now()) - 5);
    expect((await setup({ ticket, password: CONSOLE_PASSWORD, code: stale })).body.code).toBe(
      'TOTP_INVALID',
    );
    expect((await setup({ ticket, password: 'password123', code })).body.code).toBe(
      'PASSWORD_TOO_WEAK',
    );
    const done = await setup({ ticket, password: CONSOLE_PASSWORD, code }).expect(201);
    expect(done.body.recoveryCodes).toHaveLength(10);
    expect(new Set(done.body.recoveryCodes).size).toBe(10);
    expect(done.body).toMatchObject({ role: 'support', recoveryCodesRemaining: 10 });
    expect(done.body.session.reauthenticatedUntil).not.toBeNull();
    const cookie = ([] as string[])
      .concat(done.headers['set-cookie'] ?? [])
      .find((header) => header.startsWith('__Secure-vertex-console='));
    expect(cookie).toMatch(
      /; Path=\/api\/console\/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200$/,
    );
    expect(await userRow(created.id)).toMatchObject({
      status: 'active',
      setupCodeHash: null,
      setupCodeExpiresAt: null,
    });

    // The ticket and the setup code were used up; a used TOTP step is refused.
    expect((await setup({ ticket, password: CONSOLE_PASSWORD, code })).body.code).toBe(
      'TICKET_INVALID',
    );
    const again = await client.signIn(created.phone, { setupCode: created.setupCode });
    expect(again.body.code).toBe('INVALID_CREDENTIALS');
    const actions = (await platformAuditOf(created.id)).map((entry) => entry.action);
    expect(actions).toEqual([
      'platform_user.sign_in_failed',
      'platform_user.sign_in_failed',
      'platform_user.totp_failed',
      'platform_user.setup_completed',
      'platform_user.signed_in',
      'platform_user.sign_in_failed',
    ]);
  });

  it('refuses an expired setup code', async () => {
    const created = await client.create('support');
    await staff.db
      .update(platformUsers)
      .set({ setupCodeExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformUsers.id, created.id));
    const signedIn = await client.signIn(created.phone, { setupCode: created.setupCode });
    expect(signedIn.body.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('sign-in (rule 37)', () => {
  it('takes the password, then a TOTP code whose step was not used before', async () => {
    const signedIn = await client.signIn(admin.phone, { password: CONSOLE_PASSWORD });
    expect(signedIn.body).toEqual({ step: 'totp', ticket: expect.any(String) });
    const totp = (code: string) =>
      client.call('post', '/api/console/auth/totp').send({ ticket: signedIn.body.ticket, code });
    const code = await client.code(admin);
    const stale = totpCode(admin.totpSecret, totpStep(Date.now()) - 5);
    expect((await totp(stale)).body.code).toBe('TOTP_INVALID');
    const done = await totp(code).expect(201);
    expect(sessionCookie(done)).toBeDefined();
    expect(done.body.session.reauthenticatedUntil).not.toBeNull();

    // The same code again, with a new ticket: its step is used (replay refusal).
    const next = await client.signIn(admin.phone, { password: CONSOLE_PASSWORD });
    const replay = await client
      .call('post', '/api/console/auth/totp')
      .send({ ticket: next.body.ticket, code });
    expect(replay.body.code).toBe('TOTP_INVALID');
    // A TOTP ticket is no setup ticket.
    const asSetup = await client
      .call('post', '/api/console/auth/setup')
      .send({ ticket: next.body.ticket, password: CONSOLE_PASSWORD, code });
    expect(asSetup.body.code).toBe('TICKET_INVALID');
    const failed = (await platformAuditOf(admin.id)).filter(
      (entry) => entry.action === 'platform_user.totp_failed',
    );
    expect(failed.length).toBeGreaterThanOrEqual(2);
  });

  it('takes each recovery code once, without opening the re-authentication window', async () => {
    const user = await client.setUp('support');
    const [first] = user.recoveryCodes;
    const withRecovery = async () => {
      const signedIn = await client.signIn(user.phone, { password: CONSOLE_PASSWORD });
      return client
        .call('post', '/api/console/auth/totp')
        .send({ ticket: signedIn.body.ticket, code: first?.toLowerCase() });
    };
    const done = await withRecovery();
    expect(done.status).toBe(201);
    expect(done.body).toMatchObject({ recoveryCodesRemaining: 9 });
    expect(done.body.session.reauthenticatedUntil).toBeNull();
    expect((await withRecovery()).body.code).toBe('TOTP_INVALID');
  });

  it('answers a wrong password, an unknown phone and a disabled user alike, and locks after five failures', async () => {
    const unknown = await client.signIn(newPhone(), { password: CONSOLE_PASSWORD });
    expect(unknown.body.code).toBe('INVALID_CREDENTIALS');
    const user = await client.setUp('support');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wrong = await client.signIn(user.phone, { password: 'wrong console passphrase' });
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    }
    const locked = await client.signIn(user.phone, { password: CONSOLE_PASSWORD });
    expect(locked.body.code).toBe('RATE_LIMITED');
    const actions = (await platformAuditOf(user.id)).map((entry) => entry.action);
    expect(actions).toContain('platform_user.sign_in_locked');
    // Five wrong passwords, and the attempt refused while locked (rule 41).
    expect(actions.filter((action) => action === 'platform_user.sign_in_failed')).toHaveLength(6);
  });
});

describe('the sign-in lock', () => {
  it('counts wrong TOTP and recovery codes with wrong passwords, and clears on a whole sign-in', async () => {
    const user = await client.setUp('support');
    const stale = totpCode(user.totpSecret, totpStep(Date.now()) - 5);
    const signedIn = await client.signIn(user.phone, { password: CONSOLE_PASSWORD });
    const totp = (code: string) =>
      client.call('post', '/api/console/auth/totp').send({ ticket: signedIn.body.ticket, code });
    // The password counted once; four wrong codes make five failures in a row.
    for (const code of [stale, 'AAAA-AAAA', stale, 'BBBB-BBBB']) {
      expect((await totp(code)).body.code).toBe('TOTP_INVALID');
    }
    expect((await totp(await client.code(user))).body.code).toBe('RATE_LIMITED');
    const locked = await client.signIn(user.phone, { password: CONSOLE_PASSWORD });
    expect(locked.body.code).toBe('RATE_LIMITED');
    // A whole sign-in clears the count: a second one starts from zero.
    await staff.db
      .update(platformUsers)
      .set({ signInLockedUntil: null })
      .where(eq(platformUsers.id, user.id));
    await client.signInAgain(user);
    expect((await userRow(user.id))?.failedSignIns).toBe(0);
  });
});

describe('re-authentication (rule 38)', () => {
  it('works while the sign-in is locked from outside, and ends the session after five wrong codes', async () => {
    const user = await client.setUp('support');
    const session = await client.signInAgain(user);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await client.signIn(user.phone, { password: 'wrong console passphrase' });
    }
    expect((await client.signIn(user.phone, { password: CONSOLE_PASSWORD })).body.code).toBe(
      'RATE_LIMITED',
    );
    await client.reauthenticate(session);

    const stale = totpCode(user.totpSecret, totpStep(Date.now()) - 5);
    const reauth = () =>
      client.call('post', '/api/console/auth/reauth', session).send({ code: stale });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await reauth()).body.code).toBe('TOTP_INVALID');
    }
    expect((await client.call('get', '/api/console/me', session)).body.code).toBe('SESSION_ENDED');
    const [ended] = await staff.db
      .select({ endReason: platformSessions.endReason })
      .from(platformSessions)
      .where(eq(platformSessions.id, await sessionIdOf(session)));
    expect(ended?.endReason).toBe('reauth_failed');
  });
});

describe('sessions (rules 38 and 39)', () => {
  it('refuse sensitive actions without a TOTP in the last 5 minutes', async () => {
    const tenant = await staff.clinic({ branch: true });
    const user = await client.setUp('support');
    const [code] = user.recoveryCodes;
    const signedIn = await client.signIn(user.phone, { password: CONSOLE_PASSWORD });
    const viaRecovery = await client
      .call('post', '/api/console/auth/totp')
      .send({ ticket: signedIn.body.ticket, code })
      .expect(201);
    const session = { ...user, cookie: sessionCookie(viaRecovery) ?? '' };
    const directory = () =>
      client
        .call('post', `/api/console/tenants/${tenant.tenantId}/directory`, session)
        .send({ listed: true, reason: 'test' });
    expect((await directory()).body.code).toBe('REAUTH_REQUIRED');
    await client.reauthenticate(session);
    expect((await directory()).status).toBe(201);
    await staff.db
      .update(platformSessions)
      .set({ reauthenticatedAt: new Date(Date.now() - 5 * 60_000 - 1000) })
      .where(eq(platformSessions.platformUserId, user.id));
    expect((await directory()).body.code).toBe('REAUTH_REQUIRED');
    const wrong = await client
      .call('post', '/api/console/auth/reauth', session)
      .send({ code: totpCode(user.totpSecret, totpStep(Date.now()) - 5) });
    expect(wrong.body.code).toBe('TOTP_INVALID');
    // The tenant's own audit names the platform user (rule 41).
    const tenantAudit = await withTenant(staff.db, tenant.tenantId, (tx) =>
      tx
        .select({ action: auditEntries.action, actorKind: auditEntries.actorKind })
        .from(auditEntries)
        .where(eq(auditEntries.actorId, user.id)),
    );
    expect(tenantAudit).toEqual([
      { action: 'tenant.directory_listing_changed', actorKind: 'platform' },
    ]);
  });

  it('end after 30 minutes without a request, and after 12 hours', async () => {
    const idle = await client.signInAgain(support);
    const expired = await client.signInAgain(support);
    const me = (user: ConsoleUser) => client.call('get', '/api/console/me', user);
    // Backdate each session, found by the request its cookie makes.
    const lastSeen = new Date(Date.now() - 30 * 60_000 - 1000);
    await staff.db
      .update(platformSessions)
      .set({ lastSeenAt: lastSeen })
      .where(eq(platformSessions.id, await sessionIdOf(idle)));
    await staff.db
      .update(platformSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformSessions.id, await sessionIdOf(expired)));
    expect((await me(idle)).body.code).toBe('SESSION_ENDED');
    expect((await me(expired)).body.code).toBe('SESSION_ENDED');
    const ended = await staff.db
      .select({ id: platformSessions.id, endReason: platformSessions.endReason })
      .from(platformSessions)
      .where(eq(platformSessions.platformUserId, support.id));
    expect(ended).toEqual(
      expect.arrayContaining([
        { id: await sessionIdOf(idle), endReason: 'idle' },
        { id: await sessionIdOf(expired), endReason: 'expired' },
      ]),
    );
  });

  it('refuse writes from another origin, and requests without the cookie', async () => {
    const session = await client.signInAgain(admin);
    const write = staff.http.post('/api/console/auth/reauth').set('cookie', session.cookie);
    expect((await write.send({ code: '000000' })).body.code).toBe('FORBIDDEN');
    const elsewhere = await staff.http
      .post('/api/console/auth/reauth')
      .set('cookie', session.cookie)
      .set('origin', 'https://elsewhere.example')
      .send({ code: '000000' });
    expect(elsewhere.body.code).toBe('FORBIDDEN');
    const signIn = await staff.http.post('/api/console/auth/sign-in').send({});
    expect(signIn.body.code).toBe('FORBIDDEN');
    // Both refused writes are in the platform audit, and neither counted as activity.
    const refused = (await platformAuditOf(admin.id)).filter(
      (entry) =>
        entry.action === 'console.request' &&
        entry.requestRoute === 'POST /api/console/auth/reauth',
    );
    expect(refused.length).toBeGreaterThanOrEqual(2);
    // Reads need no origin; a bearer token or a device token is no console session.
    expect((await staff.http.get('/api/console/me').set('cookie', session.cookie)).status).toBe(
      200,
    );
    const withoutCookie = await client.call('get', '/api/console/me');
    expect(withoutCookie.body.code).toBe('UNAUTHENTICATED');
    const forged = await client
      .call('get', '/api/console/me')
      .set('cookie', '__Secure-vertex-console=forged');
    expect(forged.body.code).toBe('UNAUTHENTICATED');
  });

  it('sign out, clearing the cookie', async () => {
    const session = await client.signInAgain(admin);
    const out = await client.call('post', '/api/console/auth/sign-out', session).expect(201);
    expect(([] as string[]).concat(out.headers['set-cookie'] ?? [])).toEqual([
      '__Secure-vertex-console=; Path=/api/console/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
    ]);
    expect((await client.call('get', '/api/console/me', session)).body.code).toBe('SESSION_ENDED');
  });

  it("change the user's own password, ending their other sessions", async () => {
    const user = await client.setUp('support');
    const other = await client.signInAgain(user);
    const change = (currentPassword: string, newPassword: string) =>
      client.call('put', '/api/console/me/password', user).send({ currentPassword, newPassword });
    expect((await change('wrong console passphrase', 'another console passphrase')).body.code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect((await change(CONSOLE_PASSWORD, 'password123')).body.code).toBe('PASSWORD_TOO_WEAK');
    expect((await change(CONSOLE_PASSWORD, 'another console passphrase')).status).toBe(200);
    expect((await client.call('get', '/api/console/me', user)).status).toBe(200);
    expect((await client.call('get', '/api/console/me', other)).body.code).toBe('SESSION_ENDED');
  });
});

/** The id of the session a cookie names, by the keyed hash the server stores. */
async function sessionIdOf(user: ConsoleUser): Promise<string> {
  const token = user.cookie.slice(user.cookie.indexOf('=') + 1);
  const [row] = await staff.db
    .select({ id: platformSessions.id })
    .from(platformSessions)
    .where(eq(platformSessions.tokenHash, app.get(KeyedHash).hash('console-session', token)));
  if (!row) throw new Error('No such session');
  return row.id;
}

describe('the platform audit (rule 41)', () => {
  it('records every console request with its route, ids and subject tenant, refused ones too', async () => {
    const tenant = await staff.clinic();
    const session = await client.signInAgain(support);
    const before = (await platformAuditOf(support.id)).length;
    await client.call('get', '/api/console/me', session).expect(200);
    await client.call('get', `/api/console/tenants?status=onboarding`, session).expect(200);
    const refused = await client.call('get', '/api/console/platform-users', session);
    expect(refused.body.code).toBe('FORBIDDEN');
    await staff.db
      .update(platformSessions)
      .set({ reauthenticatedAt: null })
      .where(eq(platformSessions.platformUserId, support.id));
    const status = await client
      .call('post', `/api/console/tenants/${tenant.tenantId}/status`, session)
      .send({ status: 'closed', reason: 'test' });
    expect(status.body.code).toBe('REAUTH_REQUIRED');
    const rows = (await platformAuditOf(support.id)).slice(before);
    expect(rows).toEqual([
      {
        action: 'console.request',
        entityType: 'platform_user',
        entityId: support.id,
        subjectTenantId: null,
        requestRoute: 'GET /api/console/me',
      },
      {
        action: 'console.request',
        entityType: 'tenant',
        entityId: null,
        subjectTenantId: null,
        requestRoute: 'GET /api/console/tenants',
      },
      {
        action: 'console.request',
        entityType: 'platform_user',
        entityId: null,
        subjectTenantId: null,
        requestRoute: 'GET /api/console/platform-users',
      },
      {
        action: 'console.request',
        entityType: 'tenant',
        entityId: tenant.tenantId,
        subjectTenantId: tenant.tenantId,
        requestRoute: 'POST /api/console/tenants/:id/status',
      },
    ]);
  });
});

describe('the platform audit of refused and failed attempts (rule 41, owner 2026-10-19)', () => {
  /** Platform audit rows of `action` (and `route`) written since `since`, by anyone. */
  async function rowsSince(since: Date, action: string, route?: string) {
    return staff.db
      .select({ actorId: platformAuditEntries.actorId })
      .from(platformAuditEntries)
      .where(
        and(
          eq(platformAuditEntries.action, action),
          gte(platformAuditEntries.createdAt, since),
          route ? eq(platformAuditEntries.requestRoute, route) : undefined,
        ),
      );
  }

  it('records a request of a known session that is over: signed out, idle, expired, user disabled', async () => {
    const user = await client.setUp('support');
    const me = (session: ConsoleUser) => client.call('get', '/api/console/me', session);
    const signedOut = await client.signInAgain(user);
    const signedOutId = await sessionIdOf(signedOut);
    await client.call('post', '/api/console/auth/sign-out', signedOut).expect(201);
    const idle = await client.signInAgain(user);
    const idleId = await sessionIdOf(idle);
    await staff.db
      .update(platformSessions)
      .set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) })
      .where(eq(platformSessions.id, idleId));
    const expired = await client.signInAgain(user);
    const expiredId = await sessionIdOf(expired);
    await staff.db
      .update(platformSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformSessions.id, expiredId));
    // Disabled without its sessions ended (a missed end): the request ends and records it.
    const disabled = await client.signInAgain(user);
    const disabledId = await sessionIdOf(disabled);
    const before = (await platformAuditOf(user.id)).length;
    for (const session of [signedOut, idle, expired]) {
      expect((await me(session)).body.code).toBe('SESSION_ENDED');
    }
    await staff.db
      .update(platformUsers)
      .set({ status: 'disabled' })
      .where(eq(platformUsers.id, user.id));
    expect((await me(disabled)).body.code).toBe('SESSION_ENDED');
    const rows = (await platformAuditOf(user.id)).slice(before);
    expect(rows).toEqual(
      [signedOutId, idleId, expiredId, disabledId].map(() => ({
        action: 'console.request',
        entityType: 'platform_user',
        entityId: user.id,
        subjectTenantId: null,
        requestRoute: 'GET /api/console/me',
      })),
    );
    const ends = await staff.db
      .select({ id: platformSessions.id, endReason: platformSessions.endReason })
      .from(platformSessions)
      .where(eq(platformSessions.platformUserId, user.id));
    expect(ends).toEqual(
      expect.arrayContaining([
        { id: signedOutId, endReason: 'signed_out' },
        { id: idleId, endReason: 'idle' },
        { id: expiredId, endReason: 'expired' },
        { id: disabledId, endReason: 'user_disabled' },
      ]),
    );
  });

  it('records nothing for a request without a session token or with an unknown one', async () => {
    const since = new Date();
    const route = '/api/console/platform-users';
    expect((await client.call('get', route)).body.code).toBe('UNAUTHENTICATED');
    const unknown = await client
      .call('get', route)
      .set('cookie', '__Secure-vertex-console=unknown-synthetic-token');
    expect(unknown.body.code).toBe('UNAUTHENTICATED');
    expect(await rowsSince(since, 'console.request', `GET ${route}`)).toEqual([]);
  });

  it('records failed sign-ins of existing users, disabled or locked, never of unknown phones', async () => {
    const since = new Date();
    expect((await client.signIn(newPhone(), { password: CONSOLE_PASSWORD })).body.code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect(await rowsSince(since, 'platform_user.sign_in_failed')).toEqual([]);

    const disabled = await client.setUp('support');
    await staff.db
      .update(platformUsers)
      .set({ status: 'disabled' })
      .where(eq(platformUsers.id, disabled.id));
    expect((await client.signIn(disabled.phone, { password: CONSOLE_PASSWORD })).body.code).toBe(
      'INVALID_CREDENTIALS',
    );
    expect((await platformAuditOf(disabled.id)).at(-1)?.action).toBe(
      'platform_user.sign_in_failed',
    );

    // Disabled between the password and the TOTP step.
    const later = await client.setUp('support');
    const beforeDisable = await client.signIn(later.phone, { password: CONSOLE_PASSWORD });
    await staff.db
      .update(platformUsers)
      .set({ status: 'disabled' })
      .where(eq(platformUsers.id, later.id));
    const afterDisable = await client
      .call('post', '/api/console/auth/totp')
      .send({ ticket: beforeDisable.body.ticket, code: later.recoveryCodes[0] });
    expect(afterDisable.body.code).toBe('TICKET_INVALID');
    expect((await platformAuditOf(later.id)).at(-1)?.action).toBe('platform_user.sign_in_failed');

    // Locked between the password and the TOTP step, or between the setup code and setup.
    const lock = (id: string) =>
      staff.db
        .update(platformUsers)
        .set({ signInLockedUntil: new Date(Date.now() + 15 * 60_000) })
        .where(eq(platformUsers.id, id));
    const user = await client.setUp('support');
    const signedIn = await client.signIn(user.phone, { password: CONSOLE_PASSWORD });
    await lock(user.id);
    const totp = await client
      .call('post', '/api/console/auth/totp')
      .send({ ticket: signedIn.body.ticket, code: await client.code(user) });
    expect(totp.body.code).toBe('RATE_LIMITED');
    expect((await platformAuditOf(user.id)).at(-1)?.action).toBe('platform_user.sign_in_failed');

    const created = await client.create('support');
    const setupStep = await client.signIn(created.phone, { setupCode: created.setupCode });
    await lock(created.id);
    const setup = await client.call('post', '/api/console/auth/setup').send({
      ticket: setupStep.body.ticket,
      password: CONSOLE_PASSWORD,
      code: totpCode(setupStep.body.totpSecret, totpStep(Date.now())),
    });
    expect(setup.body.code).toBe('RATE_LIMITED');
    expect((await platformAuditOf(created.id)).at(-1)?.action).toBe('platform_user.sign_in_failed');
  });
});

describe('platform users (rules 36 and 40)', () => {
  it('are managed by admins only, with re-authentication for changes', async () => {
    const session = await client.signInAgain(admin);
    const forSupport = await client.signInAgain(support);
    expect((await client.call('get', '/api/console/platform-users', forSupport)).body.code).toBe(
      'FORBIDDEN',
    );
    const listed = await client.call('get', '/api/console/platform-users', session).expect(200);
    expect(listed.body.map((user: { id: string }) => user.id)).toEqual(
      expect.arrayContaining([admin.id, support.id]),
    );
    expect(JSON.stringify(listed.body)).not.toMatch(/passwordHash|totpSecret|setupCodeHash/);
    await staff.db
      .update(platformSessions)
      .set({ reauthenticatedAt: null })
      .where(eq(platformSessions.platformUserId, admin.id));
    const phone = newPhone();
    const create = () =>
      client
        .call('post', '/api/console/platform-users', session)
        .send({ phone, name: 'موظف دعم', role: 'support' });
    expect((await create()).body.code).toBe('REAUTH_REQUIRED');
    await client.reauthenticate(session);
    const created = await create().expect(201);
    expect(created.body).toMatchObject({
      user: { phone, role: 'support', status: 'pending_setup' },
      setupCode: expect.stringMatching(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/),
    });
    expect((await create()).body.code).toBe('CONFLICT');
  });

  it('change roles, disable and enable, and reset, ending the sessions of the user', async () => {
    const session = await client.signInAgain(admin);
    const user = await client.setUp('support');
    const patch = (body: object) =>
      client.call('patch', `/api/console/platform-users/${user.id}`, session).send(body);
    expect((await patch({ role: 'admin' })).body).toMatchObject({ role: 'admin' });
    const disabled = await patch({ disabled: true });
    expect(disabled.body).toMatchObject({ status: 'disabled' });
    expect((await client.call('get', '/api/console/me', user)).body.code).toBe('SESSION_ENDED');
    const signIn = await client.signIn(user.phone, { password: CONSOLE_PASSWORD });
    expect(signIn.body.code).toBe('INVALID_CREDENTIALS');
    expect((await patch({ disabled: false })).body).toMatchObject({ status: 'active' });
    const active = await client.signInAgain(user);

    const reset = await client
      .call('post', `/api/console/platform-users/${user.id}/reset`, session)
      .expect(201);
    expect(reset.body.user).toMatchObject({ status: 'pending_setup' });
    expect((await client.call('get', '/api/console/me', active)).body.code).toBe('SESSION_ENDED');
    expect(await userRow(user.id)).toMatchObject({
      passwordHash: null,
      totpSecret: null,
      totpLastStep: null,
    });
    const setUpAgain = await client.signIn(user.phone, { setupCode: reset.body.setupCode });
    expect(setUpAgain.body.step).toBe('setup');
    const actions = (await platformAuditOf(admin.id))
      .filter((entry) => entry.entityId === user.id && entry.action !== 'console.request')
      .map((entry) => entry.action);
    expect(actions).toEqual([
      'platform_user.role_changed',
      'platform_user.disabled',
      'platform_user.enabled',
      'platform_user.reset',
    ]);
  });

  it('never let an admin demote, disable or reset themselves', async () => {
    const session = await client.signInAgain(admin);
    const self = `/api/console/platform-users/${admin.id}`;
    expect((await client.call('patch', self, session).send({ role: 'support' })).body.code).toBe(
      'FORBIDDEN',
    );
    expect((await client.call('patch', self, session).send({ disabled: true })).body.code).toBe(
      'FORBIDDEN',
    );
    expect((await client.call('post', `${self}/reset`, session)).body.code).toBe('FORBIDDEN');
    const unknown = await client
      .call('patch', `/api/console/platform-users/${uuidv7()}`, session)
      .send({ disabled: true });
    expect(unknown.body.code).toBe('NOT_FOUND');
  });

  it('keep the last active admin (LAST_ADMIN), also under concurrent changes', async () => {
    const first = await client.setUp('admin');
    const second = await client.setUp('admin');
    // Leave these two as the only active admins.
    await staff.db
      .update(platformUsers)
      .set({ status: 'disabled' })
      .where(
        and(
          eq(platformUsers.role, 'admin'),
          eq(platformUsers.status, 'active'),
          ne(platformUsers.id, first.id),
          ne(platformUsers.id, second.id),
        ),
      );
    const actor = (user: ConsoleUser): PlatformActor => ({
      kind: 'platform',
      userId: user.id,
      sessionId: uuidv7(),
      role: 'admin',
    });
    const outcomes = await Promise.allSettled([
      client.users.update(actor(first), second.id, { disabled: true }),
      client.users.update(actor(second), first.id, { role: 'support' }),
    ]);
    const refused = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'LAST_ADMIN' });
    const remaining = outcomes[0].status === 'fulfilled' ? first : second;
    // From the CLI too: the last admin is never disabled, but may be reset (recovery).
    expect(
      await refusal(client.users.update({ kind: 'system' }, remaining.id, { disabled: true })),
    ).toBe('LAST_ADMIN');
    const reset = await client.users.reset({ kind: 'system' }, remaining.id);
    expect(reset.user.status).toBe('pending_setup');
  });
});

describe('owner recovery (rule 17)', () => {
  it('looks an account up by phone, authorizes its password reset and changes its phone', async () => {
    const clinic = await staff.clinic();
    const session = await client.signInAgain(support);
    const lookUp = (phone: string) =>
      client.call('post', '/api/console/accounts/lookup', session).send({ phone });
    const found = await lookUp(clinic.phone).expect(201);
    expect(found.body).toMatchObject({
      phone: clinic.phone,
      hasPassword: true,
      passwordResetAuthorizedUntil: null,
      memberships: [
        {
          tenantId: clinic.tenantId,
          roles: ['owner'],
          status: 'active',
          tenantStatus: 'onboarding',
        },
      ],
    });
    expect((await lookUp(newPhone())).body.code).toBe('NOT_FOUND');
    const accountId = found.body.id as string;
    // Whom support looked up, and which clinic it showed (rule 41).
    const lookedUp = (await platformAuditOf(support.id)).filter(
      (entry) => entry.action === 'account.looked_up',
    );
    expect(lookedUp).toEqual([
      {
        action: 'account.looked_up',
        entityType: 'account',
        entityId: accountId,
        subjectTenantId: clinic.tenantId,
        requestRoute: null,
      },
    ]);

    await staff.db
      .update(platformSessions)
      .set({ reauthenticatedAt: null })
      .where(eq(platformSessions.platformUserId, support.id));
    const reset = () =>
      client
        .call('post', `/api/console/accounts/${accountId}/password-reset`, session)
        .send({ reason: 'identity checked by phone call' });
    expect((await reset()).body.code).toBe('REAUTH_REQUIRED');
    await client.reauthenticate(session);
    const authorized = await reset().expect(201);
    expect(authorized.body).toMatchObject({ accountId });

    const newNumber = newPhone();
    const changed = await client
      .call('put', `/api/console/accounts/${accountId}/phone`, session)
      .send({ phone: newNumber, reason: 'lost the old number' })
      .expect(200);
    expect(changed.body).toMatchObject({ id: accountId, phone: newNumber });
    const other = await staff.clinic();
    const taken = await client
      .call('put', `/api/console/accounts/${accountId}/phone`, session)
      .send({ phone: other.phone, reason: 'test' });
    expect(taken.body.code).toBe('ALREADY_MEMBER');
    const unknown = await client
      .call('post', `/api/console/accounts/${uuidv7()}/password-reset`, session)
      .send({ reason: 'test' });
    expect(unknown.body.code).toBe('NOT_FOUND');

    // Written to the platform audit and to the clinic's audit, by the platform user.
    const [account] = await staff.db.select().from(accounts).where(eq(accounts.id, accountId));
    expect(account?.phone).toBe(newNumber);
    const tenantAudit = await withTenant(staff.db, clinic.tenantId, (tx) =>
      tx
        .select({ action: auditEntries.action, actorId: auditEntries.actorId })
        .from(auditEntries)
        .where(eq(auditEntries.entityId, accountId))
        .orderBy(asc(auditEntries.createdAt)),
    );
    expect(tenantAudit).toEqual([
      { action: 'account.password_reset_authorized', actorId: support.id },
      { action: 'account.phone_changed', actorId: support.id },
    ]);
  });

  it('recovers owners only, writing to the audit of every clinic of the account', async () => {
    const clinic = await staff.clinic();
    const session = await client.signInAgain(support);
    await client.reauthenticate(session);
    const memberPhone = await staff.invite(clinic.tenantId, { roles: ['reception'] });
    const [member] = await staff.db.select().from(accounts).where(eq(accounts.phone, memberPhone));
    const memberId = member?.id ?? '';
    const lookUp = await client
      .call('post', '/api/console/accounts/lookup', session)
      .send({ phone: memberPhone });
    expect(lookUp.body.code).toBe('NOT_FOUND');
    const reset = await client
      .call('post', `/api/console/accounts/${memberId}/password-reset`, session)
      .send({ reason: 'test' });
    expect(reset.body.code).toBe('FORBIDDEN');
    const phone = await client
      .call('put', `/api/console/accounts/${memberId}/phone`, session)
      .send({ phone: newPhone(), reason: 'test' });
    expect(phone.body.code).toBe('FORBIDDEN');
    const [unchanged] = await staff.db.select().from(accounts).where(eq(accounts.id, memberId));
    expect(unchanged).toMatchObject({ phone: memberPhone, passwordResetAuthorizedUntil: null });

    // An owner who is also reception elsewhere: both clinics' audits record the recovery.
    const other = await staff.clinic();
    const [owner] = await staff.db.select().from(accounts).where(eq(accounts.phone, clinic.phone));
    const ownerId = owner?.id ?? '';
    await withTenant(staff.db, other.tenantId, (tx) =>
      tx.insert(staffMemberships).values({
        tenantId: other.tenantId,
        accountId: ownerId,
        status: 'active',
        roles: ['reception'],
        allFacilities: true,
        invitedName: 'مالك تجريبي',
      }),
    );
    await staff.db
      .insert(accountTenantLinks)
      .values({ accountId: ownerId, linkedTenantId: other.tenantId });
    await client
      .call('post', `/api/console/accounts/${ownerId}/password-reset`, session)
      .send({ reason: 'identity checked' })
      .expect(201);
    for (const tenantId of [clinic.tenantId, other.tenantId]) {
      const rows = await withTenant(staff.db, tenantId, (tx) =>
        tx
          .select({ action: auditEntries.action })
          .from(auditEntries)
          .where(eq(auditEntries.entityId, ownerId)),
      );
      expect(rows, tenantId).toEqual([{ action: 'account.password_reset_authorized' }]);
    }
  });

  it('is refused to staff sessions and without the permission', async () => {
    const clinic = await staff.clinic();
    const lookUp = await client
      .call('post', '/api/console/accounts/lookup')
      .set('authorization', `Bearer ${clinic.owner.accessToken}`)
      .send({ phone: clinic.phone });
    expect(lookUp.body.code).toBe('UNAUTHENTICATED');
    const forSupport = await client.signInAgain(support);
    await client.reauthenticate(forSupport);
    const admins = await client.call('get', '/api/console/platform-users', forSupport);
    expect(admins.body.code).toBe('FORBIDDEN');
  });
});

describe('platform user CLI', () => {
  async function run(...argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runPlatformUserCommand(argv, client.users, {
      out: (text) => out.push(text),
      err: (text) => err.push(text),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('creates a user and resets them, printing a setup code each time', async () => {
    const phone = newPhone();
    const created = await run(
      'platform-user:create',
      '--phone',
      phone,
      '--name',
      'مدير تجريبي',
      '--role',
      'admin',
    );
    expect(created.code).toBe(0);
    const { user, setupCode } = JSON.parse(created.out);
    expect(user).toMatchObject({ phone, role: 'admin', status: 'pending_setup' });
    const reset = await run('platform-user:reset', user.id);
    expect(reset.code).toBe(0);
    const newCode = JSON.parse(reset.out).setupCode;
    expect(newCode).not.toBe(setupCode);
    expect((await client.signIn(phone, { setupCode })).body.code).toBe('INVALID_CREDENTIALS');
    expect((await client.signIn(phone, { setupCode: newCode })).body.step).toBe('setup');
    const actions = await staff.db
      .select({ action: platformAuditEntries.action, actorKind: platformAuditEntries.actorKind })
      .from(platformAuditEntries)
      .where(
        and(
          eq(platformAuditEntries.entityId, user.id),
          eq(platformAuditEntries.actorKind, 'system'),
        ),
      )
      // Without an order PostgreSQL returns the rows as it finds them, not as they were written.
      .orderBy(asc(platformAuditEntries.createdAt));
    expect(actions).toEqual([
      { action: 'platform_user.created', actorKind: 'system' },
      { action: 'platform_user.reset', actorKind: 'system' },
    ]);
  });

  it('refuses bad input with its usage', async () => {
    expect(
      await run('platform-user:create', '--phone', 'x', '--name', 'م', '--role', 'root'),
    ).toEqual({ code: 1, out: '', err: 'VALIDATION_FAILED: invalid phone, name, role' });
    expect((await run('platform-user:reset', 'not-an-id')).err).toBe(
      'VALIDATION_FAILED: invalid id',
    );
    expect((await run('platform-user:reset', uuidv7())).err).toMatch(/^NOT_FOUND/);
    expect((await run('platform-user:nothing')).code).toBe(2);
    expect((await run('platform-user:create', '--unknown')).code).toBe(2);
  });
});
