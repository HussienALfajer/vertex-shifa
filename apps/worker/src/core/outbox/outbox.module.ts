import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Database } from '@vertex-shifa/db';
import type { Config } from '../config/config.js';
import { CONFIG } from '../config/config.module.js';
import { JOBS_DATABASE } from './jobs-database.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';

/** The outbox dispatcher and its jobs-role database, whose pool closes on shutdown. */
@Module({
  providers: [
    {
      provide: JOBS_DATABASE,
      inject: [CONFIG],
      useFactory: (config: Config) => createDatabase(config.jobsDatabaseUrl),
    },
    OutboxDispatcher,
  ],
})
export class OutboxModule implements OnApplicationShutdown {
  constructor(@Inject(JOBS_DATABASE) private readonly db: Database) {}

  async onApplicationShutdown() {
    await this.db.$client.end();
  }
}
