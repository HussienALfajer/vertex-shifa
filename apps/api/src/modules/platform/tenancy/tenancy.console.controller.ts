import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import {
  changeTenantStatusSchema,
  createTenantSchema,
  listTenantsQuerySchema,
  setTenantDirectoryListingSchema,
  tenantPageSchema,
  tenantSchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import { ConsoleRoute, NoFeature } from '../../../core/access/access.decorators.js';
import { CurrentPlatformUser, type PlatformActor } from '../../../core/access/actor.js';
import { TenancyService } from './tenancy.service.js';

const idParam = { schema: z.uuid() };

/**
 * The tenant registry for Vertex staff (screens in S22; the CLI calls the same service). Status and
 * directory changes need a recent TOTP (spec S02 rule 38).
 */
@Controller('console/tenants')
@NoFeature()
export class TenancyConsoleController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Get()
  @ConsoleRoute('tenants.read')
  @SerializeOptions({ schema: tenantPageSchema })
  list(@Query({ schema: listTenantsQuerySchema }) query: z.output<typeof listTenantsQuerySchema>) {
    return this.tenancy.listTenants(query);
  }

  @Post()
  @ConsoleRoute('tenants.create')
  @SerializeOptions({ schema: tenantSchema })
  create(
    @CurrentPlatformUser() user: PlatformActor,
    @Body({ schema: createTenantSchema }) input: z.output<typeof createTenantSchema>,
  ) {
    return this.tenancy.createTenant(user, input);
  }

  @Post(':id/status')
  @ConsoleRoute('tenants.change-status', { reauth: true })
  @SerializeOptions({ schema: tenantSchema })
  changeStatus(
    @CurrentPlatformUser() user: PlatformActor,
    @Param('id', idParam) id: string,
    @Body({ schema: changeTenantStatusSchema }) input: z.output<typeof changeTenantStatusSchema>,
  ) {
    return this.tenancy.changeTenantStatus(user, id, input);
  }

  @Post(':id/directory')
  @ConsoleRoute('tenants.manage-directory', { reauth: true })
  @SerializeOptions({ schema: tenantSchema })
  setDirectory(
    @CurrentPlatformUser() user: PlatformActor,
    @Param('id', idParam) id: string,
    @Body({ schema: setTenantDirectoryListingSchema })
    input: z.output<typeof setTenantDirectoryListingSchema>,
  ) {
    return this.tenancy.setDirectoryListing(user, id, input);
  }
}
