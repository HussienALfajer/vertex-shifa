import { useEffect, useRef } from 'react';
import { onDeviceEvent } from '../../lib/device';

/** The input that counts as activity: a key, the pointer, the wheel, a touch. */
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;

type Timers = {
  /** A monotonic clock: setting the computer's clock back never postpones the lock. */
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const browserTimers: Timers = {
  now: () => performance.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

/**
 * Rule 25: `onIdle` runs once `minutes` pass without activity, measured by a monotonic clock.
 * Activity only moves the deadline; the one timer checks it when it fires, so a moving pointer
 * never re-arms timers. Sleep is counted explicitly: a monotonic clock may stop while the computer
 * sleeps, so on `resumed` the sleep the main process measured (by the later of its wall and
 * monotonic clocks) counts as idle, less what this clock already counted since `suspended`; a
 * computer that slept past the deadline locks as soon as it wakes. When the suspend notice comes
 * late, the sleep may count twice: the lock comes early, never late.
 */
export function createIdleLock(
  minutes: number,
  onIdle: () => void,
  timers: Timers = browserTimers,
) {
  const idleMs = minutes * 60_000;
  /** Sleep this clock did not count, added to it. */
  let slept = 0;
  const now = () => timers.now() + slept;
  let last = now();
  let suspendedAt: number | undefined;
  let handle: unknown;
  let stopped = false;

  const check = () => {
    if (stopped) return;
    const remaining = last + idleMs - now();
    if (remaining <= 0) {
      stopped = true;
      onIdle();
      return;
    }
    handle = timers.setTimeout(check, remaining);
  };
  handle = timers.setTimeout(check, idleMs);

  return {
    activity() {
      last = now();
    },
    suspended() {
      suspendedAt = timers.now();
    },
    resumed(sleptMs: number) {
      const counted = suspendedAt === undefined ? 0 : timers.now() - suspendedAt;
      suspendedAt = undefined;
      slept += Math.max(0, sleptMs - counted);
      timers.clearTimeout(handle);
      check();
    },
    stop() {
      stopped = true;
      timers.clearTimeout(handle);
    },
  };
}

/** Locks after `minutes` without input in the window, while `enabled`; sleep counts as idle. */
export function useIdleLock(minutes: number, onIdle: () => void, enabled = true): void {
  const latest = useRef(onIdle);
  latest.current = onIdle;
  useEffect(() => {
    if (!enabled) return;
    const lock = createIdleLock(minutes, () => latest.current());
    const activity = () => lock.activity();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, activity, { passive: true, capture: true });
    }
    const stopListening = onDeviceEvent((event) => {
      if (event.type === 'suspended') lock.suspended();
      if (event.type === 'resumed') lock.resumed(event.sleptMs);
    });
    return () => {
      lock.stop();
      stopListening();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, activity, { capture: true });
      }
    };
  }, [minutes, enabled]);
}
