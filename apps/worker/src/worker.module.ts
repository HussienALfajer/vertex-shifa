import { type DynamicModule, Module, type Type } from '@nestjs/common';
import type { Config } from './core/config/config.js';
import { ConfigModule } from './core/config/config.module.js';
import { OutboxModule } from './core/outbox/outbox.module.js';
import { QueueModule } from './core/queue/queue.module.js';
import type { QueueJob } from './core/queue/queue-job.js';

/**
 * The worker: the core (configuration, pg-boss, the outbox dispatcher) and its queues, listed in
 * `jobs/index.ts`.
 */
@Module({})
export class WorkerModule {
  static forRoot(config: Config, jobs: Type<QueueJob>[]): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.forRoot(config), QueueModule.forRoot(jobs), OutboxModule],
    };
  }
}
