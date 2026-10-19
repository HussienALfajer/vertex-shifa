/**
 * The identity whose server state the screens work on: the unlocked member, by device and
 * enrollment, or nobody. One installation holds several clinics and several members (spec S02),
 * and work started for one member must never finish for the next one: a lock, another member,
 * another clinic or a wipe ends the scope. Every request (`api`), query client promise and
 * mutation (`query-client.ts`) started inside a member's scope settles only while that scope is
 * current; once it ends they never settle, so nothing after them runs: no cache write, no
 * navigation, no toast. Work started with nobody unlocked (the lock and sign-in screens, which
 * bring the next member in) belongs to nobody and is never cut.
 */
export type IdentityScope = {
  /** `deviceId:enrollmentId` of the unlocked member, or null. */
  readonly member: string | null;
  /** Aborted when the scope ends: the requests started in it are cancelled. */
  readonly signal: AbortSignal;
};

let controller = new AbortController();
let scope: IdentityScope = { member: null, signal: controller.signal };
const listeners = new Set<() => void>();

export function memberKey(owner: { deviceId: string; enrollmentId: string }): string {
  return `${owner.deviceId}:${owner.enrollmentId}`;
}

export function identityScope(): IdentityScope {
  return scope;
}

/**
 * The unlocked member is now `member` (or nobody). When that is a change, the scope ends first, so
 * the previous member's work stops before anything of the next one is shown, and then the
 * listeners forget the previous member's server state. Returns whether it changed.
 */
export function enterIdentity(member: string | null): boolean {
  if (member === scope.member) return false;
  controller.abort();
  controller = new AbortController();
  scope = { member, signal: controller.signal };
  for (const listener of listeners) listener();
  return true;
}

/** Hears every change of identity, after the previous scope ended. */
export function onIdentityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * `work` as seen by the scope it started in: it settles while that scope is current, and never
 * after it ended, so the code awaiting it does not go on for another identity. Nobody's work is
 * returned as it is.
 */
export function withinScope<T>(started: IdentityScope, work: Promise<T>): Promise<T> {
  if (started.member === null) return work;
  return new Promise<T>((resolve, reject) => {
    work.then(
      (value) => {
        if (!started.signal.aborted) resolve(value);
      },
      (error: unknown) => {
        if (!started.signal.aborted) reject(error);
      },
    );
  });
}

/** Whether `started` is still the current scope. */
export function isCurrent(started: IdentityScope): boolean {
  return !started.signal.aborted;
}
