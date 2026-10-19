import type { RegistrationOptions, Role } from '@vertex-shifa/contracts';
import { useSyncExternalStore } from 'react';

/**
 * Why a person signs in on this computer (spec S02 rules 18–22): to register it to a clinic, to
 * enroll on its current clinic ("Another user"), or, as an enrolled member, after a forgotten PIN
 * or to re-enable a PIN disabled by five wrong ones.
 */
export type SignInPurpose = 'register' | 'enroll' | 'forgot' | 'reenable';

/** The registration being made, chosen on `/register`. */
export type RegistrationChoice = {
  tenantId: string;
  clinicName: string;
  clinicNameLatin: string | null;
  roles: Role[];
  facilityId: string | null;
  facilityName: string | null;
  deviceName: string;
};

/**
 * The sign-in in progress, between its screens. In memory only: the ticket never goes in a URL or
 * on disk, and a reload starts the sign-in over.
 */
export type SignInFlow = {
  purpose: SignInPurpose;
  /** The registration a member signs in on; null when registering. */
  deviceId: string | null;
  /** The phone signed in with (E.164), for the PIN rules. */
  phone: string;
  /** The account's name, for the lock screen until the server's arrives. */
  name: string;
  /** The `signed_in` ticket (10 minutes, single use). */
  ticket: string;
  clinics: RegistrationOptions['clinics'];
  registration: RegistrationChoice | null;
};

let flow: SignInFlow | null = null;
const listeners = new Set<() => void>();

export function setSignInFlow(next: SignInFlow | null): void {
  flow = next;
  for (const listener of listeners) listener();
}

export function updateSignInFlow(patch: Partial<SignInFlow>): void {
  if (flow) setSignInFlow({ ...flow, ...patch });
}

export function useSignInFlow(): SignInFlow | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => flow,
  );
}
