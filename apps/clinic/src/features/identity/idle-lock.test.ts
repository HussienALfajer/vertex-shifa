import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleLock } from './idle-lock';

describe('idle lock timer', () => {
  beforeEach(() =>
    vi.useFakeTimers({
      now: Date.parse('2026-10-18T09:00:00.000Z'),
      toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'],
    }),
  );
  afterEach(() => vi.useRealTimers());

  // The app's clock: monotonic. `vi.setSystemTime` moves the wall clock only.
  const timers = {
    now: () => performance.now(),
    setTimeout: (run: () => void, ms: number) => setTimeout(run, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };

  it('locks after the idle minutes without input (rule 25)', () => {
    const onIdle = vi.fn();
    createIdleLock(15, onIdle, timers);
    vi.advanceTimersByTime(15 * 60_000 - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60 * 60_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('counts from the last input', () => {
    const onIdle = vi.fn();
    const lock = createIdleLock(5, onIdle, timers);
    vi.advanceTimersByTime(4 * 60_000);
    lock.activity();
    vi.advanceTimersByTime(4 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('is not postponed when the computer’s clock is set back', () => {
    const onIdle = vi.fn();
    const lock = createIdleLock(5, onIdle, timers);
    vi.advanceTimersByTime(3 * 60_000);
    vi.setSystemTime(Date.now() - 24 * 60 * 60_000);
    lock.activity();
    vi.advanceTimersByTime(5 * 60_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('locks at once on waking after the deadline, when the monotonic clock stopped asleep', () => {
    const onIdle = vi.fn();
    const lock = createIdleLock(5, onIdle, timers);
    vi.advanceTimersByTime(2 * 60_000);
    lock.suspended();
    // Asleep for 30 minutes: neither the timer nor the monotonic clock moved.
    lock.resumed(30 * 60_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('counts a sleep the monotonic clock already counted once', () => {
    const onIdle = vi.fn();
    const lock = createIdleLock(15, onIdle, timers);
    lock.suspended();
    // Asleep for 4 minutes, which this clock counted too: 11 minutes are left.
    vi.advanceTimersByTime(4 * 60_000);
    lock.resumed(4 * 60_000);
    vi.advanceTimersByTime(11 * 60_000 - 1);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('keeps counting after a short sleep', () => {
    const onIdle = vi.fn();
    const lock = createIdleLock(15, onIdle, timers);
    vi.advanceTimersByTime(5 * 60_000);
    lock.suspended();
    lock.resumed(6 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4 * 60_000);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('never fires once stopped', () => {
    const onIdle = vi.fn();
    const lock = createIdleLock(5, onIdle, timers);
    lock.stop();
    vi.advanceTimersByTime(10 * 60_000);
    expect(onIdle).not.toHaveBeenCalled();
  });
});
