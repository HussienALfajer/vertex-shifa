import {
  type DynamicModule,
  Module,
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { DomainError } from '@vertex-shifa/contracts';
import { AccessGuard } from './core/access/access.guard.js';
import type { Config } from './core/config/config.js';
import { ConfigModule } from './core/config/config.module.js';
import { DatabaseModule } from './core/database/database.module.js';
import { ErrorFilter } from './core/errors/error.filter.js';
import { HealthCheckModule } from './core/health/health-check.module.js';
import { TenancyModule } from './modules/platform/tenancy/index.js';

/**
 * The API: the core (configuration, database, access guard, error filter, request validation and
 * response serialization through each route's contract schemas) and the modules. New modules are
 * imported here.
 */
@Module({})
export class AppModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule, HealthCheckModule, TenancyModule],
      providers: [
        { provide: APP_GUARD, useClass: AccessGuard },
        { provide: APP_FILTER, useClass: ErrorFilter },
        // A parameter declared with `{ schema }` is parsed by it; a refusal names the fields only,
        // never their values (they can be personal data).
        {
          provide: APP_PIPE,
          useValue: new StandardSchemaValidationPipe({
            exceptionFactory: (issues) => {
              const fields = issues.map((issue) =>
                (issue.path ?? [])
                  .map((key) => String(typeof key === 'object' ? key.key : key))
                  .join('.'),
              );
              return new DomainError('VALIDATION_FAILED', `Invalid fields: ${fields.join(', ')}`);
            },
          }),
        },
        { provide: APP_INTERCEPTOR, useClass: StandardSchemaSerializerInterceptor },
      ],
    };
  }
}
