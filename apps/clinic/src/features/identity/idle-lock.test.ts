import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createIdleLock } from './idle-lock';

describe('idle lock timer', () => {
  beforeEach(() => vi.useFakeTimers({ now: Date.parse('2026-10-18T09:00:00.000Z') }));
  afterEach(() => vi.useRealTimers());

  const timers = {
    now: () => Date.now(),
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

  it('locks at once when the computer wakes after the deadline', () => {
    const onIdle = vi.fn();
    createIdleLock(5, onIdle, timers);
    // Asleep: the clock moved on, the timer did not fire yet.
    vi.setSystemTime(Date.now() + 30 * 60_000);
    vi.advanceTimersByTime(5 * 60_000);
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
