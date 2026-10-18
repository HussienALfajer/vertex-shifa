import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from './core/routes.js';

/** Settings applied to the application after it is created, in production and in tests alike. */
export function configureApp(app: INestApplication): INestApplication {
  (app as NestExpressApplication).disable('x-powered-by');
  // The API listens on the loopback address behind the server's reverse proxy (ADR 0017): the
  // client address of the rate limits is the one the proxy forwards.
  (app as NestExpressApplication).set('trust proxy', 'loopback');
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return app;
}
