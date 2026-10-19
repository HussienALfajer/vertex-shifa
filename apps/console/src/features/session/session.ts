import { type QueryClient, queryOptions } from '@tanstack/react-query';
import type { ConsoleMe, ConsoleSetUp, PlatformPermissionKey } from '@vertex-shifa/contracts';
import { api, unwrap, watchSession } from '../../lib/api';

// The console session (spec S02 rules 37–39): an `HttpOnly` cookie the page never sees, 12 hours
// at most and 30 minutes idle. What the page knows of it is `GET /api/console/me`.

export const meQuery = queryOptions({
  queryKey: ['console', 'me'],
  queryFn: () => unwrap(api.GET('/api/console/me')),
  // A refusal here means no session: the gate sends the person to the sign-in, never retries.
  retry: false,
});

/** Who signed in, kept as the session's view; the recovery codes of a setup are never cached. */
export function signedIn(queryClient: QueryClient, me: ConsoleMe | ConsoleSetUp): void {
  const { recoveryCodes: _shownOnce, ...view } = me as ConsoleSetUp;
  queryClient.removeQueries();
  queryClient.setQueryData(meQuery.queryKey, view);
}

/** Everything the console holds of the platform goes with the session. */
export function forgetSession(queryClient: QueryClient): void {
  queryClient.removeQueries();
}

export async function signOut(queryClient: QueryClient): Promise<void> {
  await unwrap(api.POST('/api/console/auth/sign-out'));
  forgetSession(queryClient);
}

/**
 * Wires the end of the session into the app: a request refused for want of a session forgets the
 * console's data and opens the sign-in, saying so when a session had been running.
 */
export function startSession(queryClient: QueryClient, toSignIn: (ended: boolean) => void): void {
  watchSession((code) => {
    const hadSession = queryClient.getQueryData(meQuery.queryKey) !== undefined;
    forgetSession(queryClient);
    toSignIn(hadSession || code === 'SESSION_ENDED');
  });
}

/** Whether sensitive actions need a new TOTP now (rule 38), with a few seconds to spare. */
export function needsReauth(me: ConsoleMe | undefined, now = Date.now()): boolean {
  const until = me?.session.reauthenticatedUntil;
  return !until || Date.parse(until) - 5_000 <= now;
}

/** Cosmetic: the API decides (`@ConsoleRoute(permission)`). */
export function holds(me: ConsoleMe | undefined, permission: PlatformPermissionKey): boolean {
  return me?.permissions.includes(permission) ?? false;
}
