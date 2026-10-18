import { Controller, Get, SerializeOptions } from '@nestjs/common';
import { accessCatalog, accessCatalogSchema } from '@vertex-shifa/contracts';
import { NoFeature, StaffRoute } from '../../../core/access/access.decorators.js';

/** The permission catalog, presets and limits, for the permission editor. */
@Controller('access')
@NoFeature()
export class AccessController {
  @Get('catalog')
  @StaffRoute('tenant.read')
  @SerializeOptions({ schema: accessCatalogSchema })
  catalog() {
    return accessCatalog();
  }
}
