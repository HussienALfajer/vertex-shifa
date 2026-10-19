import { describe, expect, it } from 'vitest';
import { sleepTracker } from './power.js';

describe('sleep tracker', () => {
  it('counts the sleep by the later of the two clocks', () => {
    let wall = 1_000_000;
    let monotonic = 500;
    const tracker = sleepTracker({ wall: () => wall, monotonic: () => monotonic });
    expect(tracker.resumed()).toBe(0);

    // The monotonic clock stopped while asleep: the wall clock counts.
    tracker.suspended();
    wall += 30 * 60_000;
    expect(tracker.resumed()).toBe(30 * 60_000);

    // The wall clock was set back while asleep: the monotonic clock counts.
    tracker.suspended();
    wall -= 24 * 60 * 60_000;
    monotonic += 20 * 60_000;
    expect(tracker.resumed()).toBe(20 * 60_000);
  });
});
