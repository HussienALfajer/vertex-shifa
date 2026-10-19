import { queryOptions, useQueryClient } from '@tanstack/react-query';
import type { ManagedDevice, RevokeDevice, RevokedEnrollment } from '@vertex-shifa/contracts';
import { api, unwrap } from '../../lib/api';
import { logErrorLabel } from '../../lib/error-logging';
import { identityScope, withinScope } from '../../lib/identity-scope';
import { currentRegistration, installationQuery } from '../identity/installation';
import { refreshDevice } from '../identity/session';

// Server state of the clinic's computers (S02 rule 29), online only.

export function devicesQuery(status: ManagedDevice['status']) {
  return queryOptions({
    queryKey: ['devices', { status }],
    queryFn: (): Promise<ManagedDevice[]> =>
      unwrap(api.GET('/api/devices', { params: { query: { status } } })),
  });
}

const one = (id: string) => ({ params: { path: { id } } });

export function renameDevice(id: string, name: string): Promise<ManagedDevice> {
  return unwrap(api.PATCH('/api/devices/{id}', { ...one(id), body: { name } }));
}

export function revokeDevice(id: string, input: RevokeDevice): Promise<ManagedDevice> {
  return unwrap(api.POST('/api/devices/{id}/revoke', { ...one(id), body: input }));
}

export function removeMember(id: string, enrollmentId: string): Promise<RevokedEnrollment> {
  return unwrap(
    api.POST('/api/devices/{id}/enrollments/{enrollmentId}/revoke', {
      params: { path: { id, enrollmentId } },
    }),
  );
}

/**
 * After a change: the lists reload, and a change to this computer reaches its lock screen now
 * (its members, its name), or its revocation wipes it (rule 29) instead of waiting for the next
 * connection.
 */
export function useDevicesCache() {
  const queryClient = useQueryClient();
  return async (deviceId: string) => {
    // The refresh is the identity layer's, never cut: what the screen does after it stops with
    // the member it was done for (`identity-scope.ts`).
    const scope = identityScope();
    await queryClient.invalidateQueries({ queryKey: ['devices'] });
    const view = queryClient.getQueryData(installationQuery.queryKey);
    const registration = view && currentRegistration(view);
    if (registration?.deviceId === deviceId) {
      await withinScope(scope, refreshDevice(registration).catch(logErrorLabel));
    }
  };
}
