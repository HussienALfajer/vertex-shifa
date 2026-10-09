import { readdirSync, readFileSync } from 'node:fs';
import { sep } from 'node:path';
import {
  type CanActivate,
  Controller,
  Get,
  type INestApplication,
  Inject,
  Injectable,
  type MiddlewareConsumer,
  Module,
  type NestMiddleware,
  type NestModule,
  Next,
  Res,
  UseGuards,
} from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ConsoleRoute,
  NoFeature,
  Public,
  StaffRoute,
} from '../../src/core/access/access.decorators.js';
import { listRoutes } from '../../src/core/routes.js';
import { createTestApp } from '../app.js';
import { boundaryViolations, injectionViolations, routeViolations } from './rules.js';

const src = new URL('../../src/', import.meta.url);

function sourceFiles(): Map<string, string> {
  const files = new Map<string, string>();
  for (const entry of readdirSync(src, { recursive: true, encoding: 'utf8' })) {
    if (!entry.endsWith('.ts')) continue;
    files.set(entry.split(sep).join('/'), readFileSync(new URL(entry, src), 'utf8'));
  }
  return files;
}

describe('the API', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('declares access, entitlement and a response schema on every route', () => {
    const routes = listRoutes(app);
    expect(routes.map((route) => `${route.method} ${route.path}`)).toContain('GET /api/health');
    expect(routeViolations(routes)).toEqual([]);
  });

  it('injects every constructor parameter explicitly', () => {
    expect(injectionViolations(app)).toEqual([]);
  });

  it('keeps module boundaries and layer direction', () => {
    const files = sourceFiles();
    expect(files.has('core/routes.ts')).toBe(true);
    expect(boundaryViolations(files)).toEqual([]);
  });
});

describe('the rules catch', () => {
  @Injectable()
  class Implicit {
    constructor(readonly app: unknown) {}
  }

  @Injectable()
  class ImplicitGuard implements CanActivate {
    constructor(readonly app: unknown) {}
    canActivate() {
      return true;
    }
  }

  @Injectable()
  class ImplicitMiddleware implements NestMiddleware {
    constructor(readonly app: unknown) {}
    use(_request: unknown, _response: unknown, next: () => void) {
      next();
    }
  }

  abstract class BaseController {
    @Get('inherited')
    @StaffRoute('probe.read')
    @NoFeature()
    inherited() {}
  }

  @Controller('probe')
  @UseGuards(ImplicitGuard)
  class BrokenController extends BaseController {
    constructor(@Inject(Implicit) readonly implicit: Implicit) {
      super();
    }

    @Get('bare')
    bare() {}

    @Get('console-outside')
    @ConsoleRoute('probe.read')
    @NoFeature()
    consoleOutside() {}

    @Get('raw')
    @Public()
    @NoFeature()
    raw(@Res() _response: unknown) {}

    @Get('next')
    @Public()
    @NoFeature()
    next(@Next() _next: unknown) {}
  }

  @Controller('console/probe')
  class ConsoleBrokenController {
    @Get()
    @StaffRoute('probe.read')
    @NoFeature()
    staffInConsole() {}
  }

  @Module({ controllers: [BrokenController, ConsoleBrokenController], providers: [Implicit] })
  class BrokenModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(ImplicitMiddleware).forRoutes(BrokenController);
    }
  }

  @Controller('routed')
  class RoutedController {
    @Get()
    @StaffRoute('probe.read')
    @NoFeature()
    staffRouted() {}
  }

  @Module({ controllers: [RoutedController] })
  class RoutedModule {}

  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({
      imports: [
        BrokenModule,
        RoutedModule,
        RouterModule.register([{ path: 'console', module: RoutedModule }]),
      ],
    });
  });
  afterAll(() => app.close());

  it('a route without declarations, a misplaced console route, a missing schema, a raw response', () => {
    const routes = listRoutes(app);
    expect(routes.map((route) => `${route.method} ${route.path}`)).toEqual(
      expect.arrayContaining(['GET /api/probe/inherited', 'GET /api/console/routed']),
    );
    const violations = routeViolations(routes);
    expect(violations).toEqual(
      expect.arrayContaining([
        'BrokenController.bare declares no access (@Public, @PatientRoute, @StaffRoute or @ConsoleRoute)',
        'BrokenController.bare declares no entitlement (@RequiresFeature or @NoFeature)',
        'BrokenController.bare declares no response schema with an id (@SerializeOptions({ schema }))',
        'BrokenController.consoleOutside: console routes, and only they, live under /api/console/',
        'ConsoleBrokenController.staffInConsole: console routes, and only they, live under /api/console/',
        'BrokenController.inherited declares no response schema with an id (@SerializeOptions({ schema }))',
        'RoutedController.staffRouted: console routes, and only they, live under /api/console/',
        'BrokenController.raw takes @Res() or @Next(), which skip the response serializer',
        'BrokenController.next takes @Res() or @Next(), which skip the response serializer',
      ]),
    );
  });

  it('a constructor parameter without @Inject, in a provider, a guard or a middleware', () => {
    expect(injectionViolations(app).sort()).toEqual([
      'Implicit has constructor parameters without @Inject(token)',
      'ImplicitGuard has constructor parameters without @Inject(token)',
      'ImplicitMiddleware has constructor parameters without @Inject(token)',
    ]);
  });

  it('a declaration made twice', () => {
    expect(() => {
      class Twice {
        @Public()
        @Public()
        handler() {}
      }
      return Twice;
    }).toThrow('handler declares its access twice');
  });

  it('a module reached past its index, a layer upward, the core importing a module, a stray file', () => {
    const files = new Map([
      [
        'modules/clinic/billing/billing.service.ts',
        "import { x } from '../../platform/tenancy/tenancy.service.js';\n" +
          "import { y } from '../../health/scheduling/index.js';\n" +
          "import { z } from './billing.helpers.js';",
      ],
      [
        'modules/platform/tenancy/tenancy.service.ts',
        "import { a } from '../../health/scheduling/index.js';",
      ],
      [
        'core/access/access.guard.ts',
        "import { b } from '../../modules/platform/access/index.js';",
      ],
      ['modules/billing.ts', ''],
      ['modules/products/lab/lab.service.ts', ''],
    ]);
    expect(boundaryViolations(files)).toEqual([
      'modules/clinic/billing/billing.service.ts imports modules/platform/tenancy/tenancy.service.ts: another module only through its index.ts',
      'modules/platform/tenancy/tenancy.service.ts imports modules/health/scheduling/index.ts: the health layer is above platform',
      'core/access/access.guard.ts imports modules/platform/access/index.ts: the core imports no module',
      'modules/billing.ts is not in modules/<platform|health|clinic>/<module>/',
      'modules/products/lab/lab.service.ts is not in modules/<platform|health|clinic>/<module>/',
    ]);
  });
});
