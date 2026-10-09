import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from './core/config/config.js';
import { jobs } from './jobs/index.js';
import { WorkerModule } from './worker.module.js';

const config = loadConfig(process.env);
const worker = await NestFactory.createApplicationContext(WorkerModule.forRoot(config, jobs));
worker.enableShutdownHooks();
