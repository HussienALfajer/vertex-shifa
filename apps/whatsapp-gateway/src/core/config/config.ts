import { z } from 'zod';

/**
 * The gateway's environment, checked once at start-up: a missing or malformed value stops the
 * process before it opens anything. `WHATSAPP_TRANSPORT` picks the transport; only `fake` exists
 * until S03 adds Baileys (ADR 0022). Error messages name the variable, never its value.
 */
const configSchema = z
  .object({
    WHATSAPP_TRANSPORT: z.enum(['fake']),
  })
  .transform((env) => ({
    transport: env.WHATSAPP_TRANSPORT,
  }));

export type Config = z.output<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid gateway environment: ${names}`);
  }
  return result.data;
}
