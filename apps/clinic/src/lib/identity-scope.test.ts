import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  enterIdentity,
  identityScope,
  isCurrent,
  memberKey,
  onIdentityChange,
  withinScope,
} from './identity-scope';

const memberA = memberKey({ deviceId: 'device-a', enrollmentId: 'enrollment-a' });
const memberB = memberKey({ deviceId: 'device-b', enrollmentId: 'enrollment-b' });

/** Whether the promise settled within a few ticks, and how. */
async function outcome(promise: Promise<unknown>): Promise<'resolved' | 'rejected' | 'pending'> {
  const pending = new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 20));
  return Promise.race([
    promise.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    pending,
  ]);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('identity scope', () => {
  afterEach(() => enterIdentity(null));

  it('lets a member’s work settle while they are still unlocked', async () => {
    enterIdentity(memberA);
    const answer = deferred<string>();
    const work = withinScope(identityScope(), answer.promise);
    answer.resolve('saved');
    await expect(work).resolves.toBe('saved');
  });

  it('never settles a member’s work once another member is unlocked', async () => {
    enterIdentity(memberA);
    const answer = deferred<string>();
    const failure = deferred<string>();
    const work = withinScope(identityScope(), answer.promise);
    const failing = withinScope(identityScope(), failure.promise);
    enterIdentity(null);
    enterIdentity(memberB);
    answer.resolve('member A’s invitation');
    failure.reject(new Error('refused'));
    expect(await outcome(work)).toBe('pending');
    expect(await outcome(failing)).toBe('pending');
  });

  it('cuts the work of the same member before a lock and after the next unlock', async () => {
    enterIdentity(memberA);
    const before = identityScope();
    enterIdentity(null);
    enterIdentity(memberA);
    expect(isCurrent(before)).toBe(false);
    expect(await outcome(withinScope(before, Promise.resolve('late')))).toBe('pending');
  });

  it('never cuts the work of nobody: the lock and sign-in screens bring the next member in', async () => {
    const unlocking = withinScope(identityScope(), Promise.resolve('unlocked'));
    enterIdentity(memberB);
    await expect(unlocking).resolves.toBe('unlocked');
  });

  it('aborts the ended scope’s requests before telling the listeners', () => {
    enterIdentity(memberA);
    const previous = identityScope();
    const heard = vi.fn(() => expect(previous.signal.aborted).toBe(true));
    const stop = onIdentityChange(heard);
    expect(enterIdentity(memberA)).toBe(false);
    expect(heard).not.toHaveBeenCalled();
    expect(enterIdentity(memberB)).toBe(true);
    expect(heard).toHaveBeenCalledOnce();
    expect(identityScope().member).toBe(memberB);
    expect(identityScope().signal.aborted).toBe(false);
    stop();
  });
});
