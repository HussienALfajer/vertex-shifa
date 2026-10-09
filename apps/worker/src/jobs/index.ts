import type { Type } from '@nestjs/common';
import type { QueueJob } from '../core/queue/queue-job.js';

/**
 * Every queue of the worker: one `QueueJob` class per `jobs/<area>/<name>.job.ts` (ADR 0020). The
 * first arrives with its spec (OTP delivery in S03, notifications in S18).
 */
export const jobs: Type<QueueJob>[] = [];
