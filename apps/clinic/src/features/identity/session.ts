import type { QueryClient } from '@tanstack/react-query';
import {
  deviceTokenTtlSeconds,
  type ErrorCode,
  type SessionTokens,
  staffSessionPolicy,
} from '@vertex-shifa/contracts';
import type { SessionOwner } from '../../../electron/identity/bridge';
import {
  ApiError,
  type ApiErrorCode,
  authorizeRequests,
  DEVICE_TOKEN_HEADER,
  identityApi,
  unwrap,
} from '../../lib/api';
import { device, type InstallationView, type RegistrationView } from '../../lib/device';
import { logErrorLabel } from '../../lib/error-logging';
import { enterIdentity, memberKey } from '../../lib/identity-scope';
import { installationQuery, unlockedIdentity } from './installation';

// The staff session of the unlocked member (spec S02 rules 23, 25 and 29): device tokens signed by
// the registration's device key, the session opened with the member's user key, refreshed before
// its access token expires, ended by the lock; and what the device does when the API refuses it.
// The tokens live in the main process, so a reload of the window keeps the session. Every session
// and every refusal belongs to the member it was made for (`SessionOwner`): an answer that comes
// back after another member unlocked never lands on them.

type Registration = Pick<RegistrationView, 'deviceId' | 'tenantId'>;

let queryClient: QueryClient | undefined;
/** Why the app last locked itself, for the lock screen (a refusal's code). */
let lockReason: ErrorCode | undefined;
const lockReasonListeners = new Set<() => void>();

const ACCESS_TOKEN_MARGIN_MS = 60_000;
const DEVICE_TOKEN_MARGIN_MS = 30_000;

/**
 * Device tokens per registration, in memory. Their expiry is counted from when they arrived, with
 * their known lifetime: the device clock may be wrong (edge case 7), the server's times then too.
 */
const deviceTokens = new Map<string, { token: string; expiresAt: number }>();
/** When each session's access token expires by this window's clock; unknown after a reload. */
const accessTokenExpiry = new Map<string, number>();

/**
 * The installation's view for the screens. When another member is unlocked, or none, the identity
 * scope ends before the view is shown: the previous member's work stops and their server state is
 * forgotten (`identity-scope.ts`, `query-client.ts`), so one member's data never shows to the next.
 */
export function remember(view: InstallationView): InstallationView {
  enterIdentity(unlockedIdentity(view));
  queryClient?.setQueryData(installationQuery.queryKey, view);
  return view;
}

let appInfo: Promise<{ os: string; appVersion: string }> | undefined;

export function deviceInfo(): Promise<{ os: string; appVersion: string }> {
  appInfo ??= device('appInfo', null);
  return appInfo;
}

/** A device token for `registration`: the device key signs a server nonce (rule 23). */
export async function deviceToken(registration: Registration): Promise<string> {
  const cached = deviceTokens.get(registration.deviceId);
  if (cached && cached.expiresAt - Date.now() > DEVICE_TOKEN_MARGIN_MS) return cached.token;
  const ids = { tenantId: registration.tenantId, deviceId: registration.deviceId };
  const { nonce } = await unwrap(identityApi.POST('/api/devices/token/challenge', { body: ids }));
  const signature = await device('signDeviceToken', { deviceId: registration.deviceId, nonce });
  const { appVersion } = await deviceInfo();
  const received = Date.now();
  const issued = await unwrap(
    identityApi.POST('/api/devices/token', { body: { ...ids, nonce, signature, appVersion } }),
  );
  deviceTokens.set(registration.deviceId, {
    token: issued.deviceToken,
    expiresAt: received + deviceTokenTtlSeconds * 1000,
  });
  return issued.deviceToken;
}

type Answer<T> = Promise<{ data?: T; error?: unknown; response: Response }>;

/**
 * A request of the registration's device (`@DeviceRoute`): with its device token, asked again once
 * with a new token when the server finds it expired, and the revocation handled (rule 29) when the
 * API answers `DEVICE_REVOKED`.
 */
export async function asDevice<T>(
  registration: Registration,
  request: (headers: Record<string, string>) => Answer<T>,
): Promise<T> {
  const send = async () => {
    let token: string;
    try {
      token = await deviceToken(registration);
    } catch (error) {
      // Once its wipe is confirmed, a revoked device gets no token at all.
      if (error instanceof ApiError && error.code === 'DEVICE_REVOKED') {
        await wipeRegistration(registration, { confirmed: true });
      }
      throw error;
    }
    return unwrap(request({ [DEVICE_TOKEN_HEADER]: token }));
  };
  try {
    try {
      return await send();
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'UNAUTHENTICATED')) throw error;
      deviceTokens.delete(registration.deviceId);
      return await send();
    }
  } catch (error) {
    if (error instanceof ApiError && error.code === 'DEVICE_REVOKED') {
      await wipeRegistration(registration);
    }
    throw error;
  }
}

/** The lock screen's data from the server: clinic, branch, members, last confirmations. */
export async function refreshDevice(registration: Registration): Promise<InstallationView> {
  const current = await asDevice(registration, (headers) =>
    identityApi.GET('/api/devices/current', { headers }),
  );
  return remember(await device('updateDevice', { current }));
}

async function storeSession(owner: SessionOwner, session: SessionTokens): Promise<void> {
  accessTokenExpiry.set(
    session.sessionId,
    Date.now() + staffSessionPolicy.accessTokenMinutes * 60_000,
  );
  await device('setSession', { ...owner, session });
}

/**
 * Rule 23: opens a staff session for `owner` with their key, unlocked in the main process. The
 * server rechecks the device, the enrollment, the membership, the branch and the clinic, and
 * confirms the enrollment again (the offline window starts over); the lock screen's data and the
 * clinic's logo are refreshed.
 */
export async function openSession(owner: SessionOwner): Promise<SessionTokens> {
  try {
    const { nonce } = await asDevice(owner, (headers) =>
      identityApi.POST('/api/sessions/challenge', { headers }),
    );
    const proof = await device('signSession', { nonce });
    if (memberKey(proof) !== memberKey(owner)) throw new ApiError('UNAUTHENTICATED');
    const session = await asDevice(owner, (headers) =>
      identityApi.POST('/api/sessions', {
        headers,
        body: { enrollmentId: proof.enrollmentId, nonce, signature: proof.signature },
      }),
    );
    await storeSession(owner, session);
    void sessionStarted(owner, session.accessToken);
    return session;
  } catch (error) {
    if (error instanceof ApiError) await sessionRefused(error.code, owner);
    throw error;
  }
}

/**
 * After a session opens: the lock screen's data and the clinic's logo, kept for the lock screen.
 * The logo is read with that session's own access token, never with whoever is unlocked by the
 * time it is sent: it is stored on `registration`, so it must be that clinic's.
 */
export async function sessionStarted(
  registration: Registration,
  accessToken: string,
): Promise<void> {
  try {
    await refreshDevice(registration);
    const logo = await unwrap(
      identityApi.GET('/api/tenant/logo', { headers: { authorization: `Bearer ${accessToken}` } }),
    ).catch((error: unknown) => {
      if (error instanceof ApiError && error.code === 'NOT_FOUND') return null;
      throw error;
    });
    await device('setLogo', {
      deviceId: registration.deviceId,
      logo: logo && { contentType: logo.contentType, data: logo.data },
    });
    remember(await device('view', null));
  } catch (error) {
    logErrorLabel(error);
  }
}

async function refreshSession(owner: SessionOwner, session: SessionTokens): Promise<SessionTokens> {
  try {
    const next = await asDevice(owner, (headers) =>
      identityApi.POST('/api/sessions/refresh', {
        headers,
        body: { refreshToken: session.refreshToken },
      }),
    );
    await storeSession(owner, next);
    return next;
  } catch (error) {
    if (error instanceof ApiError) await sessionRefused(error.code, owner);
    throw error;
  }
}

type Authorization = { token: string; owner: SessionOwner };

let obtaining: { key: string; promise: Promise<Authorization> } | undefined;

/**
 * A valid access token of the unlocked member, and whose it is: the session's, refreshed a minute
 * before it expires, or a new session. Requests at the same time share one, for the same member.
 */
export async function accessToken(): Promise<Authorization> {
  const current = await device('session', null).catch(() => null);
  if (!current) throw new ApiError('UNAUTHENTICATED');
  const { session, ...owner } = current;
  const key = memberKey(owner);
  if (obtaining?.key === key) return obtaining.promise;
  const promise = (async (): Promise<Authorization> => {
    if (!session) return { token: (await openSession(owner)).accessToken, owner };
    const expiry = accessTokenExpiry.get(session.sessionId) ?? 0;
    if (expiry - Date.now() > ACCESS_TOKEN_MARGIN_MS) return { token: session.accessToken, owner };
    return { token: (await refreshSession(owner, session)).accessToken, owner };
  })().finally(() => {
    if (obtaining?.key === key) obtaining = undefined;
  });
  obtaining = { key, promise };
  return promise;
}

/** Refusals after which the member must unlock again (edge case 9: a closed clinic too). */
const locking = new Set<ApiErrorCode>([
  'SESSION_ENDED',
  'ENROLLMENT_REVOKED',
  'MEMBERSHIP_INACTIVE',
  'BRANCH_NOT_IN_SCOPE',
  'TENANT_CLOSED',
]);

/**
 * What the device does when the API refuses `owner`'s session (rules 8, 22, 23 and 29), whoever
 * is unlocked now: the registration the request was made for is the one wiped, the member it was
 * made for the one removed, and the app locks only while that member is still the one unlocked.
 */
async function sessionRefused(code: ApiErrorCode, owner: SessionOwner): Promise<void> {
  try {
    if (code === 'DEVICE_REVOKED') {
      await wipeRegistration(owner);
      return;
    }
    const current = await device('session', null);
    const theirs = current !== null && memberKey(current) === memberKey(owner);
    if (code === 'ENROLLMENT_REVOKED') {
      remember(await device('removeMember', owner));
    }
    if (code === 'UNAUTHENTICATED' && theirs) {
      // The server no longer takes this access token: a new session is opened on the next request.
      await device('setSession', { ...owner, session: null });
    }
    if (locking.has(code) && code !== 'NETWORK_ERROR' && theirs) await lockApp(code);
  } catch (error) {
    logErrorLabel(error);
  }
}

/** Locks the app here, without asking the server: the session is already over or unreachable. */
export async function lockApp(reason?: ErrorCode): Promise<void> {
  lockReason = reason;
  for (const listener of lockReasonListeners) listener();
  remember(await device('lock', null));
}

/**
 * The member locks the app, or the idle lock does (rule 25): the session ends on the server
 * (`locked`) when it can be reached, and the key is forgotten here either way.
 */
export async function lockSession(): Promise<void> {
  const current = await device('session', null).catch(() => null);
  const session = current?.session;
  if (session && (accessTokenExpiry.get(session.sessionId) ?? 0) > Date.now()) {
    // Best effort, and never waiting long: the lock must not depend on the connection.
    const ended = identityApi
      .POST('/api/sessions/current/end', {
        headers: { authorization: `Bearer ${session.accessToken}` },
        body: { reason: 'locked' },
      })
      .catch(() => undefined);
    await Promise.race([ended, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
  await lockApp();
}

/**
 * Rule 29: the clinic revoked this computer. The device token comes first (a revoked device still
 * gets one until it confirms), then the registration's keys and data are deleted, then the wipe is
 * confirmed. Unconfirmed, the device key stays, and the lock screen confirms on the next start.
 */
export async function wipeRegistration(
  registration: Registration,
  options: { confirmed?: boolean } = {},
): Promise<void> {
  let token: string | undefined;
  let confirmed = options.confirmed ?? false;
  if (!confirmed) {
    try {
      token = await deviceToken(registration);
    } catch (error) {
      confirmed = error instanceof ApiError && error.code === 'DEVICE_REVOKED';
    }
  }
  remember(await device('wipe', { deviceId: registration.deviceId }));
  if (token) {
    try {
      const { wipedAt } = await unwrap(
        identityApi.POST('/api/devices/current/wiped', {
          headers: { [DEVICE_TOKEN_HEADER]: token },
        }),
      );
      // The server records a wipe of a revoked device only.
      confirmed = wipedAt !== null;
    } catch (error) {
      logErrorLabel(error);
    }
  }
  deviceTokens.delete(registration.deviceId);
  if (confirmed) remember(await device('wipeConfirmed', { deviceId: registration.deviceId }));
}

/** Confirms the wipes the server has not heard of yet (the device was offline when it wiped). */
export async function confirmPendingWipes(view: InstallationView): Promise<void> {
  for (const registration of view.registrations.filter((item) => item.wipePending)) {
    try {
      await wipeRegistration(registration);
    } catch (error) {
      logErrorLabel(error);
    }
  }
}

export function currentLockReason(): ErrorCode | undefined {
  return lockReason;
}

export function clearLockReason(): void {
  lockReason = undefined;
  for (const listener of lockReasonListeners) listener();
}

export function subscribeLockReason(listener: () => void): () => void {
  lockReasonListeners.add(listener);
  return () => lockReasonListeners.delete(listener);
}

/** Wires the session into the API client, once, when the app starts. */
export function startIdentity(client: QueryClient): void {
  queryClient = client;
  authorizeRequests<SessionOwner>({
    accessToken,
    refused: (code, owner) => void sessionRefused(code, owner),
  });
}
