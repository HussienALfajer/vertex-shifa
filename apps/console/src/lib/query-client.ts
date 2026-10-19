import { QueryClient } from '@tanstack/react-query';
import { apiErrorCode } from './api';

/** Codes worth asking again for: the server or the connection may be back a moment later. */
const transient = new Set(['NETWORK_ERROR', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE']);

/**
 * Server state of the console (ADR 0020). Offline, queries pause; a save never pauses (TanStack's
 * default would send it by itself when the connection returns): offline, it fails at once.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) => failures < 2 && transient.has(apiErrorCode(error) ?? ''),
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
}
