import { type ErrorCode, errorResponseSchema } from '@vertex-shifa/contracts';
import type { z } from 'zod';

// The main process's own requests to the API (ADR 0021): the ones whose answers change what the
// installation lets a member do (sessions and their refresh tokens, registrations, enrollments,
// the password sign-in that re-enables a PIN, the members and their confirmations). The renderer is
// untrusted, so it never relays these answers: the main process asks and reads them itself.

export type ServerRequest = {
  method: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
};

export type ServerAnswer = { status: number; body: unknown };

/** Sends one request to the API; throws when the API cannot be reached. */
export type Transport = (request: ServerRequest) => Promise<ServerAnswer>;

/** A refusal's code; `NETWORK_ERROR` when the API could not be reached at all. */
export type RefusalCode = ErrorCode | 'NETWORK_ERROR';

/** The API refused a request of the main process, by its code only. */
export class ServerRefusal extends Error {
  override readonly name = 'ServerRefusal';

  constructor(readonly code: RefusalCode) {
    super(code);
  }
}

/** The answer's data, checked by `schema`; otherwise a `ServerRefusal` with the answer's code. */
export async function ask<T>(
  transport: Transport,
  request: ServerRequest,
  schema: z.ZodType<T>,
): Promise<T> {
  let answer: ServerAnswer;
  try {
    answer = await transport(request);
  } catch {
    throw new ServerRefusal('NETWORK_ERROR');
  }
  if (answer.status >= 200 && answer.status < 300) {
    const parsed = schema.safeParse(answer.body);
    if (parsed.success) return parsed.data;
    throw new ServerRefusal('INTERNAL_ERROR');
  }
  const refusal = errorResponseSchema.safeParse(answer.body);
  throw new ServerRefusal(refusal.success ? refusal.data.code : 'INTERNAL_ERROR');
}

const REQUEST_TIMEOUT_MS = 15_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Requests to the API at `origin` (from `connectOrigins`: https, or http on loopback), never
 * following a redirect elsewhere. Without an origin every request fails as unreachable.
 */
export function httpTransport(origin: string | undefined, fetcher: Fetch): Transport {
  return async ({ method, path, headers = {}, body }) => {
    if (!origin) throw new Error('No API origin');
    const url = new URL(path, origin);
    if (url.origin !== origin) throw new Error('Outside the API origin');
    const init: RequestInit = {
      method,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    };
    if (body !== undefined) {
      init.headers = { ...headers, 'content-type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const response = await fetcher(url.toString(), init);
    return { status: response.status, body: await response.json().catch(() => null) };
  };
}

/** Without a transport (unit tests that never reach the API): every request is unreachable. */
export const offline: Transport = async () => {
  throw new Error('Offline');
};
