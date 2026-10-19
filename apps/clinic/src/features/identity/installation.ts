import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  device,
  type InstallationView,
  type MemberView,
  type RegistrationView,
} from '../../lib/device';
import { enterIdentity, memberKey } from '../../lib/identity-scope';
import { installationMeta } from '../../lib/query-client';

/**
 * The installation's registrations and members, from the main process. Local, so it never waits
 * for the connection (`networkMode: 'always'`); every call that changes it puts its answer here
 * (`remember`). The same for every member, so a change of identity keeps it; read at start (or
 * after a reload of the window), it sets the identity scope to the member unlocked.
 */
export const installationQuery = queryOptions({
  queryKey: ['installation'],
  queryFn: async () => {
    const view = await device('view', null);
    enterIdentity(unlockedIdentity(view));
    return view;
  },
  meta: installationMeta,
  networkMode: 'always',
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
});

export function useInstallation() {
  return useQuery(installationQuery);
}

/** The registration the lock screen shows: the selected one, else the first. */
export function currentRegistration(view: InstallationView): RegistrationView | undefined {
  return (
    view.registrations.find((item) => item.deviceId === view.currentDeviceId) ??
    view.registrations[0]
  );
}

/** The identity scope's key of the member unlocked in the main process, or null. */
export function unlockedIdentity(view: InstallationView): string | null {
  return view.unlocked ? memberKey(view.unlocked) : null;
}

/** The member whose PIN unlocked the current registration, with the registration. */
export function unlockedMember(
  view: InstallationView,
): { registration: RegistrationView; member: MemberView } | undefined {
  const unlocked = view.unlocked;
  if (!unlocked || unlocked.deviceId !== view.currentDeviceId) return undefined;
  const registration = view.registrations.find((item) => item.deviceId === unlocked.deviceId);
  const member = registration?.members.find((item) => item.enrollmentId === unlocked.enrollmentId);
  return registration && member ? { registration, member } : undefined;
}

/** A data URL of the clinic's logo for an `<img>` (the CSP allows `data:` images). */
export function logoSource(registration: RegistrationView): string | null {
  const { logo } = registration;
  return logo ? `data:${logo.contentType};base64,${logo.data}` : null;
}
