/**
 * How long the computer slept (rule 25): the later of the wall clock's and the monotonic clock's
 * time between suspend and resume. A monotonic clock may stop during sleep, and the wall clock
 * may be set back meanwhile; neither alone shortens the sleep the idle lock counts.
 */
export function sleepTracker(clocks: { wall: () => number; monotonic: () => number }) {
  let suspended: { wall: number; monotonic: number } | undefined;
  return {
    suspended(): void {
      suspended = { wall: clocks.wall(), monotonic: clocks.monotonic() };
    },
    /** The time asleep, or 0 when no suspend was seen. */
    resumed(): number {
      if (!suspended) return 0;
      const slept = Math.max(
        clocks.wall() - suspended.wall,
        clocks.monotonic() - suspended.monotonic,
        0,
      );
      suspended = undefined;
      return slept;
    },
  };
}
