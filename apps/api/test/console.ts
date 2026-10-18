import type { PlatformRole } from '@vertex-shifa/contracts';
import { platformUsers } from '@vertex-shifa/db';
import { eq } from 'drizzle-orm';
import type { Response } from 'supertest';
import { expect } from 'vitest';
import { CONSOLE_SESSION_COOKIE } from '../src/core/access/session-verifier.js';
import { PlatformUsersService } from '../src/modules/platform/identity/index.js';
import { totpCode, totpStep } from '../src/modules/platform/identity/totp.js';
import { newAddress, newPhone, type StaffClient } from './staff.js';

// Test helpers that sign Vertex staff in to the console over HTTP the way the console does (spec
// S02 rules 36–39). Synthetic phones and names only.

/** The console origin of the test configuration (`CONSOLE_ORIGIN`'s default). */
export const CONSOLE_ORIGIN = 'http://localhost:5174';
export const CONSOLE_PASSWORD = 'synthetic console passphrase';

export type ConsoleUser = {
  id: string;
  phone: string;
  role: PlatformRole;
  totpSecret: string;
  recoveryCodes: string[];
  /** The `Cookie` header of the user's console session. */
  cookie: string;
};

/** The session cookie a response sets, as a `Cookie` header, or undefined. */
export function sessionCookie(response: Response): string | undefined {
  const headers = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  const set = headers.find((header) => header.startsWith(`${CONSOLE_SESSION_COOKIE}=`));
  return set?.split(';')[0];
}

export class ConsoleClient {
  constructor(readonly staff: StaffClient) {}

  get users() {
    return this.staff.app.get(PlatformUsersService);
  }

  /** A request from the console, with its origin and, given a user, their session. */
  call(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, user?: ConsoleUser) {
    const request = this.staff.http[method](path).set('origin', CONSOLE_ORIGIN);
    return user ? request.set('cookie', user.cookie) : request;
  }

  /** A new platform user, pending setup, created through the CLI's path. */
  async create(role: PlatformRole = 'admin') {
    const phone = newPhone();
    const { user, setupCode } = await this.users.create(
      { kind: 'system' },
      { phone, name: 'موظف فيرتكس', role },
    );
    return { id: user.id, phone, role, setupCode };
  }

  /** Signs in with phone and a password or setup code; answers the response. */
  async signIn(phone: string, secret: { password: string } | { setupCode: string }) {
    const address = newAddress();
    return this.call('post', '/api/console/auth/sign-in')
      .set('x-forwarded-for', address)
      .send({ phone, ...secret, proofOfWork: await this.staff.proofOfWork(address) });
  }

  /** Rule 36: a new user signs in with the setup code, sets a password and enrolls TOTP. */
  async setUp(role: PlatformRole = 'admin'): Promise<ConsoleUser> {
    const created = await this.create(role);
    const signedIn = await this.signIn(created.phone, { setupCode: created.setupCode });
    expect(signedIn.status).toBe(201);
    const { ticket, totpSecret } = signedIn.body as { ticket: string; totpSecret: string };
    const setUp = await this.call('post', '/api/console/auth/setup')
      .send({
        ticket,
        password: CONSOLE_PASSWORD,
        code: totpCode(totpSecret, totpStep(Date.now())),
      })
      .expect(201);
    return {
      id: created.id,
      phone: created.phone,
      role,
      totpSecret,
      recoveryCodes: setUp.body.recoveryCodes,
      cookie: sessionCookie(setUp) ?? '',
    };
  }

  /**
   * A TOTP code the server accepts now: the user's last used step is forgotten first, since a test
   * uses several codes within one 30-second step (replay refusal has its own test).
   */
  async code(user: Pick<ConsoleUser, 'id' | 'totpSecret'>): Promise<string> {
    await this.staff.db
      .update(platformUsers)
      .set({ totpLastStep: null })
      .where(eq(platformUsers.id, user.id));
    return totpCode(user.totpSecret, totpStep(Date.now()));
  }

  /** Password and TOTP: a new session for the user (re-authenticated, rule 38). */
  async signInAgain(user: ConsoleUser): Promise<ConsoleUser> {
    const signedIn = await this.signIn(user.phone, { password: CONSOLE_PASSWORD });
    expect(signedIn.body.step).toBe('totp');
    const verified = await this.call('post', '/api/console/auth/totp')
      .send({ ticket: signedIn.body.ticket, code: await this.code(user) })
      .expect(201);
    return { ...user, cookie: sessionCookie(verified) ?? '' };
  }

  /** Rule 38: a TOTP code for the next 5 minutes of sensitive actions. */
  async reauthenticate(user: ConsoleUser): Promise<void> {
    await this.call('post', '/api/console/auth/reauth', user)
      .send({ code: await this.code(user) })
      .expect(201);
  }
}
