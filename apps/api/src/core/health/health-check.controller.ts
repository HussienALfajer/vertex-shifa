import { Controller, Get, Inject, Logger, SerializeOptions } from '@nestjs/common';
import { DomainError, type HealthCheck, healthCheckSchema } from '@vertex-shifa/contracts';
import { type Database, describeForLog } from '@vertex-shifa/db';
import { sql } from 'drizzle-orm';
import { NoFeature, Public } from '../access/access.decorators.js';
import { DATABASE } from '../database/database.module.js';

/** For the gateway and uptime monitors: the API is up and reaches its database. */
@Controller('health')
export class HealthCheckController {
  private readonly logger = new Logger('HealthCheck');

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get()
  @Public()
  @NoFeature()
  @SerializeOptions({ schema: healthCheckSchema })
  async check(): Promise<HealthCheck> {
    try {
      await this.db.execute(sql`select 1`);
    } catch (error) {
      this.logger.warn(describeForLog(error));
      throw new DomainError('SERVICE_UNAVAILABLE', 'The database is unreachable');
    }
    return { status: 'ok', database: 'ok' };
  }
}
