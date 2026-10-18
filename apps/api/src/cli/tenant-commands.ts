import { parseArgs } from 'node:util';
import {
  changeTenantStatusSchema,
  createTenantSchema,
  DomainError,
  invitedNameSchema,
  listTenantsQuerySchema,
  mobilePhoneNumberSchema,
  setTenantDirectoryListingSchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import type { SystemActor } from '../core/access/actor.js';
import type { AuthService } from '../modules/platform/identity/index.js';
import type { TenancyService } from '../modules/platform/tenancy/index.js';

export const USAGE = `Usage (Vertex staff, with the API's .env):
  tenant:create --name-ar <name> [--name-latin <name>] [--owner-phone <phone> --owner-name <name>] --reason <text>
  tenant:list [--status <onboarding|active|suspended|closed>] [--page <n>]
  tenant:set-status <tenant-id> --status <active|suspended|closed> [--reason-category <non_payment|other>] --reason <text>
  tenant:set-directory <tenant-id> --listed <true|false> --reason <text>`;

const SYSTEM: SystemActor = { kind: 'system' };

const options = {
  'name-ar': { type: 'string' },
  'name-latin': { type: 'string' },
  reason: { type: 'string' },
  'reason-category': { type: 'string' },
  status: { type: 'string' },
  listed: { type: 'string' },
  page: { type: 'string' },
  'owner-phone': { type: 'string' },
  'owner-name': { type: 'string' },
} as const;

const tenantId = z.uuid();
const listed = z.enum(['true', 'false']).transform((value) => value === 'true');

export type Output = { out: (text: string) => void; err: (text: string) => void };

/** The first owner of a new tenant: both options, or neither. */
const ownerSchema = z
  .object({
    'owner-phone': mobilePhoneNumberSchema.optional(),
    'owner-name': invitedNameSchema.optional(),
  })
  .refine((owner) => (owner['owner-phone'] === undefined) === (owner['owner-name'] === undefined), {
    message: 'Give --owner-phone and --owner-name together',
    path: ['owner-name'],
  })
  .transform((owner) =>
    owner['owner-phone'] && owner['owner-name']
      ? { phone: owner['owner-phone'], name: owner['owner-name'] }
      : undefined,
  );

/**
 * The tenant commands for Vertex staff until the console screens (S22). They call the same
 * service as the console routes, as the `system` actor, so every change is audited. Answers the
 * process exit code: 0 done, 1 refused, 2 misused.
 */
export async function runTenantCommand(
  argv: string[],
  services: { tenancy: TenancyService; auth: AuthService },
  output: Output,
): Promise<number> {
  const { tenancy, auth } = services;
  let parsed: ReturnType<typeof parseArgs<{ options: typeof options; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: argv, options, allowPositionals: true, strict: true });
  } catch (error) {
    output.err(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, id, ...extra] = positionals;
  const print = (value: unknown) => output.out(JSON.stringify(value, null, 2));
  try {
    switch (extra.length === 0 ? command : undefined) {
      case 'tenant:create': {
        if (id !== undefined) break;
        const input = createTenantSchema.parse({
          nameAr: values['name-ar'],
          nameLatin: values['name-latin'],
          reason: values.reason,
        });
        const owner = ownerSchema.parse({
          'owner-phone': values['owner-phone'],
          'owner-name': values['owner-name'],
        });
        // S02 rule 3: the first owner's invitation commits with the tenant, or neither does.
        print(
          await tenancy.createTenant(SYSTEM, input, (tx, tenantId) =>
            owner ? auth.inviteFirstOwner(tx, tenantId, owner, SYSTEM) : Promise.resolve(),
          ),
        );
        return 0;
      }
      case 'tenant:list':
        if (id !== undefined) break;
        print(
          await tenancy.listTenants(
            listTenantsQuerySchema.parse({ status: values.status, page: values.page }),
          ),
        );
        return 0;
      case 'tenant:set-status':
        print(
          await tenancy.changeTenantStatus(
            SYSTEM,
            tenantId.parse(id),
            changeTenantStatusSchema.parse({
              status: values.status,
              reasonCategory: values['reason-category'],
              reason: values.reason,
            }),
          ),
        );
        return 0;
      case 'tenant:set-directory':
        print(
          await tenancy.setDirectoryListing(
            SYSTEM,
            tenantId.parse(id),
            setTenantDirectoryListingSchema.parse({
              listed: listed.parse(values.listed),
              reason: values.reason,
            }),
          ),
        );
        return 0;
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
  output.err(USAGE);
  return 2;
}
