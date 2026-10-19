import { MutationObserver, onlineManager, QueryObserver } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterIdentity, memberKey } from './identity-scope';
import { createQueryClient, fetchNow, installationMeta } from './query-client';

const ownerA = memberKey({ deviceId: 'device-a', enrollmentId: 'owner-a' });
const memberB = memberKey({ deviceId: 'device-b', enrollmentId: 'member-b' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

/** Whether the promise settled within a few ticks. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  const pending = new Promise<false>((resolve) => setTimeout(() => resolve(false), 20));
  const done = promise.then(
    () => true,
    () => true,
  );
  return Promise.race([done, pending]);
}

/** A member of one clinic locks and a member of another unlocks. */
function switchMember() {
  enterIdentity(null);
  enterIdentity(memberB);
}

describe('query client across identities', () => {
  afterEach(() => enterIdentity(null));

  it('never runs the callbacks of a save whose answer comes after another member unlocked', async () => {
    enterIdentity(ownerA);
    const queryClient = createQueryClient();
    const answer = deferred<{ id: string }>();
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();
    const invite = new MutationObserver(queryClient, {
      mutationFn: () => answer.promise,
      onSuccess,
      onError,
      onSettled,
    });
    const sending = invite.mutate(undefined);
    // The invitation screen renders again while the save runs: its callbacks stay bound.
    invite.setOptions({ mutationFn: () => answer.promise, onSuccess, onError, onSettled });
    expect(queryClient.getMutationCache().getAll()).toHaveLength(1);

    switchMember();
    answer.resolve({ id: 'member-of-clinic-a' });
    expect(await settled(sending)).toBe(false);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    // Dropped: nothing counts it as running for the next member.
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
  });

  it('stops a callback that awaits the cache once the member changed', async () => {
    enterIdentity(ownerA);
    const queryClient = createQueryClient();
    const list = deferred<string[]>();
    const lists = new QueryObserver(queryClient, {
      queryKey: ['staff', 'list'],
      queryFn: () => list.promise,
    });
    const unsubscribe = lists.subscribe(() => {});
    const refreshed = queryClient.invalidateQueries({ queryKey: ['staff', 'list'] });

    switchMember();
    list.resolve(['member of clinic A']);
    expect(await settled(refreshed)).toBe(false);
    expect(queryClient.getQueryData(['staff', 'list'])).toBeUndefined();
    unsubscribe();
  });

  it('forgets every query of the previous member but the installation’s', async () => {
    enterIdentity(ownerA);
    const queryClient = createQueryClient();
    queryClient.setQueryData(['staff', 'one', 'member-of-clinic-a'], { name: 'A' });
    await queryClient.fetchQuery({
      queryKey: ['installation'],
      queryFn: async () => ({ registrations: [] }),
      meta: installationMeta,
    });

    switchMember();
    expect(queryClient.getQueryData(['staff', 'one', 'member-of-clinic-a'])).toBeUndefined();
    expect(queryClient.getQueryData(['installation'])).toEqual({ registrations: [] });
  });

  it('lets the work of nobody finish across the change: the unlock brings the member in', async () => {
    const queryClient = createQueryClient();
    const onSuccess = vi.fn();
    const unlock = new MutationObserver(queryClient, {
      mutationFn: async () => {
        enterIdentity(memberB);
        return 'unlocked';
      },
      onSuccess,
    });
    await expect(unlock.mutate(undefined)).resolves.toBe('unlocked');
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it('runs a member’s save to the end while they stay unlocked', async () => {
    enterIdentity(ownerA);
    const queryClient = createQueryClient();
    const onSuccess = vi.fn();
    const save = new MutationObserver(queryClient, {
      mutationFn: async () => 'saved',
      onSuccess,
    });
    await expect(save.mutate(undefined)).resolves.toBe('saved');
    expect(onSuccess).toHaveBeenCalledOnce();
  });
});

/** Fails when the promise waits, as TanStack Query does for a paused request until reconnect. */
function settlesNow<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('paused')), 200)),
  ]);
}

describe('query client while offline', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('runs a save at once instead of pausing it until the connection returns', async () => {
    onlineManager.setOnline(false);
    const mutationFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const save = new MutationObserver(createQueryClient(), { mutationFn });
    await expect(settlesNow(save.mutate(undefined))).rejects.toThrow('Failed to fetch');
    expect(mutationFn).toHaveBeenCalledOnce();
  });

  it('reads a record inside a save at once, never joining a paused refetch', async () => {
    const queryClient = createQueryClient();
    // A screen's refetch of the same key, paused while offline.
    onlineManager.setOnline(false);
    const paused = queryClient.fetchQuery({ queryKey: ['facilities'], queryFn: async () => ({}) });
    void paused.catch(() => {});

    const read = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(settlesNow(fetchNow(queryClient, ['facilities'], read))).rejects.toThrow(
      'Failed to fetch',
    );
    expect(read).toHaveBeenCalledOnce();

    const answer = { items: [] };
    await expect(fetchNow(queryClient, ['facilities'], async () => answer)).resolves.toBe(answer);
    expect(queryClient.getQueryData(['facilities'])).toBe(answer);
  });
});
