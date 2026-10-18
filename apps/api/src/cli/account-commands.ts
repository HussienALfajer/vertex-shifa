import { parseArgs } from 'node:util';
import { DomainError, mobilePhoneNumberSchema } from '@vertex-shifa/contracts';
import { z } from 'zod';
import type { SystemActor } from '../core/access/actor.js';
import type { AuthService } from '../modules/platform/identity/index.js';
import type { Output } from './tenant-commands.js';

export const ACCOUNT_USAGE = `Usage (Vertex staff, after checking the person's identity outside the system):
  account:authorize-password-reset --phone <phone> --reason <text>
  account:change-phone --phone <phone> --new-phone <phone> --reason <text>`;

const SYSTEM: SystemActor = { kind: 'system' };

const options = {
  phone: { type: 'string' },
  'new-phone': { type: 'string' },
  reason: { type: 'string' },
} as const;

const reasonSchema = z.string().trim().min(3).max(500);

/**
 * Owner recovery through Vertex support (spec S02 rule 17) until the console screens (S22): the
 * same service as the console routes, as the `system` actor, written to the platform audit and to
 * the audit of each clinic where the account is an owner. Exit codes as the tenant commands.
 */
export async function runAccountCommand(
  argv: string[],
  auth: AuthService,
  output: Output,
): Promise<number> {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (error) {
    output.err(`${error instanceof Error ? error.message : String(error)}\n\n${ACCOUNT_USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const print = (value: unknown) => output.out(JSON.stringify(value, null, 2));
  const input = z.object({
    phone: mobilePhoneNumberSchema,
    'new-phone': mobilePhoneNumberSchema.optional(),
    reason: reasonSchema,
  });
  try {
    switch (positionals.length === 1 ? positionals[0] : undefined) {
      case 'account:authorize-password-reset': {
        const { phone, reason } = input.parse(values);
        print(await auth.authorizePasswordReset(SYSTEM, phone, reason));
        return 0;
      }
      case 'account:change-phone': {
        const {
          phone,
          reason,
          'new-phone': newPhone,
        } = input.required({ 'new-phone': true }).parse(values);
        print(await auth.changePhone(SYSTEM, phone, newPhone, reason));
        return 0;
      }
    }
  } catch (error) {
    if (error instanceof DomainError) {
      output.err(`${error.code}: ${error.message}`);
      return 1;
    }
    if (error instanceof z.ZodError) {
      const fields = error.issues.map((issue) => issue.path.join('.') || 'value').join(', ');
      output.err(`VALIDATION_FAILED: invalid ${fields}`);
      return 1;
    }
    throw error;
  }
  output.err(ACCOUNT_USAGE);
  return 2;
}
