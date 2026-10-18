import { DomainError } from '@vertex-shifa/contracts';

// Optimistic concurrency of online edits (S01 rule 16, S02 rule 10): an edit carries the
// `updatedAt` the client read, and every change moves `updatedAt` forward.

/** Refuses an edit whose `expectedUpdatedAt` is not the row's `updatedAt`: `CONFLICT`. */
export function assertCurrent(row: { updatedAt: Date }, expectedUpdatedAt: string): void {
  if (row.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)) {
    throw new DomainError('CONFLICT', 'The record changed since it was read');
  }
}

/**
 * The `updatedAt` of a change to a locked row: now, but always at least a millisecond past the
 * previous value, so two changes within one millisecond never look like one.
 */
export function nextUpdatedAt(row: { updatedAt: Date }, now = new Date()): Date {
  return new Date(Math.max(now.getTime(), row.updatedAt.getTime() + 1));
}
