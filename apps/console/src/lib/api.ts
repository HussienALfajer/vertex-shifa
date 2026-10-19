import { type ErrorCode, errorResponseSchema } from '@vertex-shifa/contracts';
import createClient from 'openapi-fetch';
import type { paths } from './api-schema.gen';

/**
 * The console's API client, typed from `apps/api/openapi.json`. Requests go to the console's own
 * origin (Vite proxies `/api` in development): the session is an `HttpOnly` cookie scoped to
 * `/api/console/`, and every write is checked against the console's `Origin` (spec S02 rule 39).
 */
export const api = createClient<paths>({ baseUrl: '', credentials: 'same-origin' });

/** The code of a refusal; `NETWORK_ERROR` when the API could not be reached at all. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

/**
 * A request the API refused, by its stable code only: the server's message is English and for
 * logs, and the screens show the code's Arabic text (`errors` namespace).
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(readonly code: ApiErrorCode) {
    super(code);
  }
}

type ApiResult<T> = { data?: T; error?: unknown; response: Response };

/** The data of a successful answer; otherwise an `ApiError` with the answer's code. */
export async function unwrap<T>(request: Promise<ApiResult<T>>): Promise<T> {
  let result: ApiResult<T>;
  try {
    result = await request;
  } catch {
    throw new ApiError('NETWORK_ERROR');
  }
  if (result.response.ok && result.data !== undefined) return result.data;
  const refusal = errorResponseSchema.safeParse(result.error);
  throw new ApiError(refusal.success ? refusal.data.code : 'INTERNAL_ERROR');
}

/** The code of an error from a query or mutation, or undefined for anything else. */
export function apiErrorCode(error: unknown): ApiErrorCode | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

/** The sign-in steps answer before any session exists: their refusals end nothing. */
const signInSteps = new Set([
  '/api/console/auth/sign-in',
  '/api/console/auth/setup',
  '/api/console/auth/totp',
]);

/**
 * Hears the end of the session (no cookie, idle or absolute expiry, or ended elsewhere): any
 * console request answered `UNAUTHENTICATED` or `SESSION_ENDED`, outside the sign-in steps.
 */
export function watchSession(ended: (code: ErrorCode) => void): void {
  api.use({
    async onResponse({ request, response }) {
      if (response.status !== 401) return;
      if (signInSteps.has(new URL(request.url).pathname)) return;
      const body = errorResponseSchema.safeParse(
        await response
          .clone()
          .json()
          .catch(() => null),
      );
      if (
        body.success &&
        (body.data.code === 'UNAUTHENTICATED' || body.data.code === 'SESSION_ENDED')
      )
        ended(body.data.code);
    },
  });
}
