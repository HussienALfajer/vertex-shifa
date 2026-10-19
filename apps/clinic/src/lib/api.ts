import { type ErrorCode, errorResponseSchema, errorStatus } from '@vertex-shifa/contracts';
import createClient, { type Client } from 'openapi-fetch';
import type { paths } from './api-schema.gen';
import { identityScope, withinScope } from './identity-scope';

/**
 * The API client of the identity itself (`features/identity/session.ts`), typed from
 * `apps/api/openapi.json`: device tokens, sessions, refusals and wipes, which concern the
 * registration or member they were made for whoever is unlocked when they answer. The staff
 * session's access token is added to every request but the sign-in and device ones, which carry
 * their own headers (`authorizeRequests`).
 */
export const identityApi = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '' });

type Method = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'PATCH';
type Send = (url: string, init?: { signal?: AbortSignal }) => Promise<unknown>;

/** A method whose request belongs to the identity scope it was sent in (`identity-scope.ts`). */
function scoped<M extends Method>(method: M): Client<paths>[M] {
  const send = identityApi[method] as unknown as Send;
  const call: Send = (url, init) => {
    const scope = identityScope();
    if (scope.member === null) return send(url, init);
    return withinScope(scope, send(url, { ...init, signal: scope.signal }));
  };
  return call as unknown as Client<paths>[M];
}

/**
 * The API client of the screens' server state (ADR 0020): a request sent for one member is
 * cancelled when the identity changes, and its answer never settles for the next one, so the code
 * that awaited it stops there (`identity-scope.ts`).
 */
export const api: Pick<Client<paths>, Method> = {
  GET: scoped('GET'),
  PUT: scoped('PUT'),
  POST: scoped('POST'),
  DELETE: scoped('DELETE'),
  PATCH: scoped('PATCH'),
};

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

/**
 * Whether a request goes without the unlocked member's session: signing in, the device's own
 * routes, and a request of the identity layer that carries the session it was made for.
 */
function withoutSession(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return (
    request.headers.has('authorization') ||
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
  identityApi.use({
    async onRequest({ request }) {
      if (withoutSession(request)) return request;
      try {
        const { token, owner } = await session.accessToken();
        // The identity changed while the session was read: the token may be the next member's.
        if (request.signal.aborted) return refusal('UNAUTHENTICATED');
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
      // Only the requests this middleware authorized: they carry the session it added by now.
      const owner = owners.get(request);
      if (owner === undefined || response.headers.has(LOCAL_REFUSAL_HEADER)) return;
      if (response.status !== 401 && response.status !== 403) return;
      const body = errorResponseSchema.safeParse(
        await response
          .clone()
          .json()
          .catch(() => null),
      );
      if (body.success && sessionRefusals.has(body.data.code)) {
        session.refused(body.data.code, owner);
      }
    },
  });
}
