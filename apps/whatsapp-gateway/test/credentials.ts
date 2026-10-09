import type { CredentialStore } from '../src/transport/whatsapp-transport.js';

/** A session's credentials in memory, as a test's stand-in for the encrypted database store. */
export function memoryCredentials(): CredentialStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    get: async (key) => entries.get(key) ?? null,
    set: async (changes) => {
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) entries.delete(key);
        else entries.set(key, value);
      }
    },
  };
}

/** Synthetic numbers in the unassigned country code 999: never a real person's. */
export const CLINIC_PHONE = '+999000000001';
export const PATIENT_PHONE = '+999000000002';
