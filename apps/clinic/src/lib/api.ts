import { type ErrorCode, errorResponseSchema } from '@vertex-shifa/contracts';
import createClient from 'openapi-fetch';
import type { paths } from './api-schema.gen';

/**
 * The API client of the online-only screens (ADR 0020), typed from `apps/api/openapi.json`. S02
 * adds the session to its requests.
 */
export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_URL ?? '' });

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
