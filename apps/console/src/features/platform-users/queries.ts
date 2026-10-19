import { queryOptions, useQueryClient } from '@tanstack/react-query';
import type { CreatePlatformUser, PlatformRole, PlatformUser } from '@vertex-shifa/contracts';
import { api, unwrap } from '../../lib/api';

// Platform users (spec S02 rules 36 and 40), admins only; every change needs a recent TOTP.

export const platformUsersQuery = queryOptions({
  queryKey: ['console', 'platform-users'],
  queryFn: () => unwrap(api.GET('/api/console/platform-users')),
});

export function createPlatformUser(input: CreatePlatformUser) {
  return unwrap(api.POST('/api/console/platform-users', { body: input }));
}

/** A role change, or disabling (`true`) or enabling (`false`) the user. */
export function updatePlatformUser(
  id: string,
  input: { role: PlatformRole } | { disabled: boolean },
) {
  return unwrap(
    api.PATCH('/api/console/platform-users/{id}', { params: { path: { id } }, body: input }),
  );
}

export function resetPlatformUser(id: string) {
  return unwrap(api.POST('/api/console/platform-users/{id}/reset', { params: { path: { id } } }));
}

/** Puts a saved user in the list at once, then reads the list again. */
export function usePlatformUsersCache(): (user: PlatformUser) => Promise<void> {
  const queryClient = useQueryClient();
  return async (user) => {
    queryClient.setQueryData(platformUsersQuery.queryKey, (users) =>
      users?.some((item) => item.id === user.id)
        ? users.map((item) => (item.id === user.id ? user : item))
        : [...(users ?? []), user],
    );
    await queryClient.invalidateQueries({ queryKey: platformUsersQuery.queryKey });
  };
}
