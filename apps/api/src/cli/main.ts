import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { describeForLog } from '@vertex-shifa/db';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../core/config/config.js';
import { TenancyService } from '../modules/platform/tenancy/index.js';
import { runTenantCommand } from './tenant-commands.js';

// The API CLI: `pnpm --filter @vertex-shifa/api cli <command> …` after `pnpm build`. It runs the
// API's modules without serving HTTP, connected as the app role like the API. An unexpected
// failure prints only what `describeForLog` allows: a database error's message quotes the values
// of its query (names, reasons), which must not reach the terminal or its logs.
try {
  const config = loadConfig(process.env);
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
    logger: false,
  });
  try {
    process.exitCode = await runTenantCommand(process.argv.slice(2), app.get(TenancyService), {
      out: (text) => process.stdout.write(`${text}\n`),
      err: (text) => process.stderr.write(`${text}\n`),
    });
  } finally {
    await app.close();
  }
} catch (error) {
  process.stderr.write(`INTERNAL_ERROR: ${describeForLog(error)}\n`);
  process.exitCode = 1;
}
