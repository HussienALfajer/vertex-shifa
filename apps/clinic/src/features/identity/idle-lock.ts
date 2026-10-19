import { useEffect, useRef } from 'react';

/** The input that counts as activity: a key, the pointer, the wheel, a touch. */
const ACTIVITY_EVENTS = ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart'] as const;

type Timers = {
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const browserTimers: Timers = {
  now: () => Date.now(),
  setTimeout: (run, ms) => window.setTimeout(run, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
};

/**
 * Rule 25: `onIdle` runs once `minutes` pass without activity. Activity only moves the deadline;
 * the one timer checks it when it fires, so a moving pointer never re-arms timers, and a computer
 * that slept past the deadline locks as soon as it wakes.
 */
export function createIdleLock(
  minutes: number,
  onIdle: () => void,
  timers: Timers = browserTimers,
) {
  const idleMs = minutes * 60_000;
  let last = timers.now();
  let handle: unknown;
  let stopped = false;

  const check = () => {
    if (stopped) return;
    const remaining = last + idleMs - timers.now();
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
      last = timers.now();
    },
    stop() {
      stopped = true;
      timers.clearTimeout(handle);
    },
  };
}

/** Locks after `minutes` without input in the window, while `enabled`. */
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
    return () => {
      lock.stop();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, activity, { capture: true });
      }
    };
  }, [minutes, enabled]);
}
