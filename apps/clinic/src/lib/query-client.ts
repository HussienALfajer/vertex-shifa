import {
  type Mutation,
  MutationCache,
  type MutationOptions,
  type MutationState,
  QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { apiErrorCode } from './api';
import {
  type IdentityScope,
  identityScope,
  isCurrent,
  onIdentityChange,
  withinScope,
} from './identity-scope';

/** Codes worth asking again for: the server or the connection may be back a moment later. */
const transient = new Set(['NETWORK_ERROR', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE']);

/** The query `meta` of the installation's own state, the same for every member: never forgotten. */
export const installationMeta = { installation: true } as const;

/** The identity scope each mutation was started in (`identity-scope.ts`). */
const mutationScopes = new WeakMap<object, IdentityScope>();

/**
 * A mutation belongs to the member it was started for. Its function's result reaches its
 * callbacks only while that member's scope is current, and its callbacks start only then: once
 * the scope ended it stays pending, is dropped from the cache, and writes, navigates and shows
 * nothing for the next identity. The options are bound again whenever its screen re-renders.
 */
class IdentityMutationCache extends MutationCache {
  override build<TData, TError, TVariables, TOnMutateResult>(
    client: QueryClient,
    options: MutationOptions<TData, TError, TVariables, TOnMutateResult>,
    state?: MutationState<TData, TError, TVariables, TOnMutateResult>,
  ): Mutation<TData, TError, TVariables, TOnMutateResult> {
    const scope = identityScope();
    const mutation = super.build(client, options, state);
    if (scope.member === null) return mutation;
    mutationScopes.set(mutation, scope);
    const setOptions = mutation.setOptions.bind(mutation);
    mutation.setOptions = (next) => setOptions(boundTo(scope, next));
    mutation.setOptions(mutation.options);
    return mutation;
  }
}

function boundTo<TData, TError, TVariables, TOnMutateResult>(
  scope: IdentityScope,
  options: MutationOptions<TData, TError, TVariables, TOnMutateResult>,
): MutationOptions<TData, TError, TVariables, TOnMutateResult> {
  const { mutationFn, onSuccess, onError, onSettled } = options;
  return {
    ...options,
    ...(mutationFn && {
      mutationFn: (variables, context) => withinScope(scope, mutationFn(variables, context)),
    }),
    ...(onSuccess && {
      onSuccess: (...args) => (isCurrent(scope) ? onSuccess(...args) : undefined),
    }),
    ...(onError && {
      onError: (...args) => (isCurrent(scope) ? onError(...args) : undefined),
    }),
    ...(onSettled && {
      onSettled: (...args) => (isCurrent(scope) ? onSettled(...args) : undefined),
    }),
  };
}

type Async = (...args: never[]) => Promise<unknown>;

/** A query client method whose promise settles only in the identity scope it was called in. */
function scoped<F extends Async>(method: F): F {
  return ((...args) => withinScope(identityScope(), method(...args))) as F;
}

/**
 * Server state of the online-only screens (ADR 0020). While the device is offline, queries pause
 * and nothing is queued: setup changes only online (S01). A save never pauses either (TanStack's
 * default would send it by itself when the connection returns): offline, it fails at once.
 *
 * Server state belongs to the unlocked member (`identity-scope.ts`): when the identity changes,
 * every query but the installation's is cancelled and removed, the previous member's mutations
 * are dropped, and the client's promises a callback may await (`invalidateQueries`…) never
 * settle for the next identity.
 */
export function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    mutationCache: new IdentityMutationCache(),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failures, error) => failures < 2 && transient.has(apiErrorCode(error) ?? ''),
      },
      mutations: { retry: false, networkMode: 'always' },
    },
  });
  Object.assign(queryClient, {
    invalidateQueries: scoped(queryClient.invalidateQueries.bind(queryClient)),
    refetchQueries: scoped(queryClient.refetchQueries.bind(queryClient)),
    resetQueries: scoped(queryClient.resetQueries.bind(queryClient)),
    fetchQuery: scoped(queryClient.fetchQuery.bind(queryClient)),
    fetchInfiniteQuery: scoped(queryClient.fetchInfiniteQuery.bind(queryClient)),
  });
  onIdentityChange(() => forgetMemberState(queryClient));
  return queryClient;
}

/** Everything of the previous member: their queries, running or not, and their mutations. */
function forgetMemberState(queryClient: QueryClient): void {
  queryClient.removeQueries({ predicate: (query) => query.meta?.installation !== true });
  const mutations = queryClient.getMutationCache();
  for (const mutation of mutations.getAll()) {
    const scope = mutationScopes.get(mutation);
    if (scope && !isCurrent(scope)) mutations.remove(mutation);
  }
}

/**
 * Reads a record from the server now, inside a save, and puts it in the cache. The request goes
 * around TanStack Query: a refetch of the same key already running (and maybe paused offline, with
 * its own retries) is never joined, so offline the save fails at once instead of finishing on
 * reconnect.
 */
export async function fetchNow<T>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  read: () => Promise<T>,
): Promise<T> {
  const data = await read();
  queryClient.setQueryData(queryKey, data);
  return data;
}
