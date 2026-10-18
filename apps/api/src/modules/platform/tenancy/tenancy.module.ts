import { Module } from '@nestjs/common';
import { MapLinkResolver } from './map-link-resolver.js';
import { TenancyConsoleController } from './tenancy.console.controller.js';
import {
  FacilitiesController,
  TenancyLookupController,
  TenantController,
} from './tenancy.controller.js';
import { MAP_LINK_RESOLVER, TenancyService } from './tenancy.service.js';

/** Tenants, their logo, branches and areas (S01). */
@Module({
  controllers: [
    TenantController,
    FacilitiesController,
    TenancyLookupController,
    TenancyConsoleController,
  ],
  providers: [
    TenancyService,
    {
      provide: MAP_LINK_RESOLVER,
      useValue: new MapLinkResolver({ fetch: globalThis.fetch, timeoutMs: 5000, maxRedirects: 3 }),
    },
  ],
  exports: [TenancyService],
})
export class TenancyModule {}
