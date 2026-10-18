import { parseArgs } from 'node:util';
import { createPlatformUserSchema, DomainError } from '@vertex-shifa/contracts';
import { z } from 'zod';
import type { SystemActor } from '../core/access/actor.js';
import type { PlatformUsersService } from '../modules/platform/identity/index.js';
import type { Output } from './tenant-commands.js';

export const PLATFORM_USER_USAGE = `Usage (Vertex staff, with the API's .env):
  platform-user:create --phone <phone> --name <name> --role <admin|support>
  platform-user:reset <platform-user-id>
Each prints a one-time setup code (24 hours): hand it over in person.`;

const SYSTEM: SystemActor = { kind: 'system' };

const options = {
  phone: { type: 'string' },
  name: { type: 'string' },
  role: { type: 'string' },
} as const;

/**
 * Platform users from the server (spec S02 rules 36 and 40): the first admin, and the reset of a
 * user who lost their password or TOTP, the last admin included. The same service as the console,
 * as the `system` actor, written to the platform audit. Exit codes as the tenant commands.
 */
export async function runPlatformUserCommand(
  argv: string[],
  users: PlatformUsersService,
  output: Output,
): Promise<number> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (error) {
    output.err(
      `${error instanceof Error ? error.message : String(error)}\n\n${PLATFORM_USER_USAGE}`,
    );
    return 2;
  }
  const { values, positionals } = parsed;
  const print = (value: unknown) => output.out(JSON.stringify(value, null, 2));
  try {
    if (positionals.length === 1 && positionals[0] === 'platform-user:create') {
      print(await users.create(SYSTEM, createPlatformUserSchema.parse(values)));
      return 0;
    }
    if (positionals.length === 2 && positionals[0] === 'platform-user:reset') {
      print(await users.reset(SYSTEM, z.uuid().parse(positionals[1])));
      return 0;
    }
  } catch (error) {
    if (error instanceof DomainError) {
      output.err(`${error.code}: ${error.message}`);
      return 1;
    }
    if (error instanceof z.ZodError) {
      const fields = [...new Set(error.issues.map((issue) => issue.path.join('.') || 'id'))];
      output.err(`VALIDATION_FAILED: invalid ${fields.join(', ')}`);
      return 1;
    }
    throw error;
  }
  output.err(PLATFORM_USER_USAGE);
  return 2;
}
