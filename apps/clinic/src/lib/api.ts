import { type ErrorCode, errorResponseSchema, errorStatus } from '@vertex-shifa/contracts';
import createClient from 'openapi-fetch';
import type { paths } from './api-schema.gen';

/**
 * The API client of the online-only screens (ADR 0020), typed from `apps/api/openapi.json`. The
 * staff session's access token is added to every request but the sign-in and device ones, which
 * carry their own headers (`authorizeRequests`).
 */
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '' });

/** The headers of the device token and the sign-in ticket (spec S02). */
export const DEVICE_TOKEN_HEADER = 'x-device-token';
export const TICKET_HEADER = 'x-sign-in-ticket';

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

/** Refusals that end what the device may do: the session, the member, the registration. */
const sessionRefusals = new Set<ErrorCode>([
  'UNAUTHENTICATED',
  'SESSION_ENDED',
  'DEVICE_REVOKED',
  'ENROLLMENT_REVOKED',
  'MEMBERSHIP_INACTIVE',
  'BRANCH_NOT_IN_SCOPE',
]);

/** Whether a request goes without the staff session: signing in, and the device's own routes. */
function withoutSession(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return (
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/api/devices/token') ||
    request.headers.has(DEVICE_TOKEN_HEADER) ||
    request.headers.has(TICKET_HEADER)
  );
}

/** Marks an answer made here, from a refusal the session already handled. */
const LOCAL_REFUSAL_HEADER = 'x-vertex-local-refusal';

const refusal = (code: ErrorCode) =>
  new Response(JSON.stringify({ code, message: code }), {
    status: errorStatus[code],
    headers: { 'content-type': 'application/json', [LOCAL_REFUSAL_HEADER]: '1' },
  });

/**
 * Adds the staff session to the API client: `accessToken` gives a valid access token (opening or
 * refreshing the session) and whose session it is, or throws; `refused` hears every refusal that
 * ends a session, with the owner the request was sent for, not whoever is signed in by then.
 */
export function authorizeRequests<Owner>(session: {
  accessToken: () => Promise<{ token: string; owner: Owner }>;
  refused: (code: ErrorCode, owner: Owner) => void;
}): void {
  const owners = new WeakMap<Request, Owner>();
  api.use({
    async onRequest({ request }) {
      if (withoutSession(request)) return request;
      try {
        const { token, owner } = await session.accessToken();
        request.headers.set('authorization', `Bearer ${token}`);
        owners.set(request, owner);
        return request;
      } catch (error) {
        // A refusal while opening or refreshing the session answers the request with its code.
        if (error instanceof ApiError && error.code !== 'NETWORK_ERROR') {
          return refusal(error.code);
        }
        if (error instanceof ApiError) throw error;
        return refusal('UNAUTHENTICATED');
      }
    },
    async onResponse({ request, response }) {
      if (withoutSession(request) || response.headers.has(LOCAL_REFUSAL_HEADER)) return;
      if (response.status !== 401 && response.status !== 403) return;
      const owner = owners.get(request);
      const body = errorResponseSchema.safeParse(
        await response
          .clone()
          .json()
          .catch(() => null),
      );
      if (owner !== undefined && body.success && sessionRefusals.has(body.data.code)) {
        session.refused(body.data.code, owner);
      }
    },
  });
}
