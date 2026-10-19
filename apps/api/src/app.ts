import type { INestApplication } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from './core/routes.js';

/** The clinic app's renderer: the built app (`app://clinic`) and, outside production, Vite's dev server. */
export function clinicOrigins(production: boolean): string[] {
  return production ? ['app://clinic'] : ['app://clinic', 'http://localhost:5173'];
}

/** The headers the clinic sends across origins (spec S02: session, device token, ticket). */
const CLINIC_HEADERS = ['authorization', 'content-type', 'x-device-token', 'x-sign-in-ticket'];

/** Settings applied to the application after it is created, in production and in tests alike. */
export function configureApp(
  app: INestApplication,
  options: { production?: boolean } = {},
): INestApplication {
  (app as NestExpressApplication).disable('x-powered-by');
  // The API listens on the loopback address behind the server's reverse proxy (ADR 0017): the
  // client address of the rate limits is the one the proxy forwards.
  (app as NestExpressApplication).set('trust proxy', 'loopback');
  // The clinic app calls the API from its own origin: a fixed list, never the request's origin
  // reflected, no credentials (its session is a bearer token). The console is same-origin, with
  // a cookie and an `Origin` check, so its routes answer no CORS at all.
  const allowed = new Set(
    clinicOrigins(options.production ?? process.env.NODE_ENV === 'production'),
  );
  app.enableCors(
    (
      request: { url?: string; headers: { origin?: string } },
      done: (error: Error | null, options: CorsOptions) => void,
    ) => {
      const console = (request.url ?? '').startsWith(`/${API_PREFIX}/console/`);
      const origin = request.headers.origin;
      done(null, {
        origin: !console && origin !== undefined && allowed.has(origin) ? origin : false,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: CLINIC_HEADERS,
        credentials: false,
        maxAge: 600,
      });
    },
  );
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  return app;
}
