import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './core/config/config.js';
import { GatewayModule } from './gateway.module.js';

const config = loadConfig(process.env);
const gateway = await NestFactory.createApplicationContext(GatewayModule.forRoot(config));
gateway.enableShutdownHooks();
// Nothing opens a session yet: S03 adds the loop that takes session leases, and with it a
// process that keeps running.
new Logger('Gateway').log(`Started with the ${config.transport} transport`);
