import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  SerializeOptions,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  areaListSchema,
  areaSchema,
  coordinatesSchema,
  createFacilitySchema,
  DomainError,
  facilityPageSchema,
  facilitySchema,
  listAreasQuerySchema,
  listFacilitiesQuerySchema,
  logoUpload,
  resolveMapLinkSchema,
  tenantLogoSchema,
  tenantSchema,
  updateFacilitySchema,
  updateTenantProfileSchema,
  updateTenantSecuritySchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import { NoFeature, StaffRoute } from '../../../core/access/access.decorators.js';
import { CurrentStaff, type StaffActor } from '../../../core/access/actor.js';
import { RejectedUpload } from '../../../core/uploads/rejected-upload.js';
import { TenancyService } from './tenancy.service.js';

// Permissions (catalog and presets in `packages/contracts/src/access.ts`): `tenant.read` every role,
// `tenant.manage` the owner only, `facility.manage` per branch, granted by the owner.

const idParam = { schema: z.uuid() };

/** The clinic's own tenant: profile, logo, onboarding. */
@Controller('tenant')
@NoFeature()
export class TenantController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Get()
  @StaffRoute('tenant.read')
  @SerializeOptions({ schema: tenantSchema })
  get(@CurrentStaff() staff: StaffActor) {
    return this.tenancy.getTenant(staff);
  }

  @Patch('profile')
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: tenantSchema })
  updateProfile(
    @CurrentStaff() staff: StaffActor,
    @Body({ schema: updateTenantProfileSchema }) input: z.output<typeof updateTenantProfileSchema>,
  ) {
    return this.tenancy.updateProfile(staff, input);
  }

  @Patch('security')
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: tenantSchema })
  updateSecurity(
    @CurrentStaff() staff: StaffActor,
    @Body({ schema: updateTenantSecuritySchema })
    input: z.output<typeof updateTenantSecuritySchema>,
  ) {
    return this.tenancy.updateSecurity(staff, input);
  }

  @Put('logo')
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: tenantLogoSchema })
  @UseInterceptors(
    RejectedUpload,
    FileInterceptor('file', {
      limits: { fileSize: logoUpload.maxBytes, files: 1, fields: 0, parts: 1 },
    }),
  )
  replaceLogo(
    @CurrentStaff() staff: StaffActor,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file) throw new DomainError('FILE_REJECTED', 'No file in the upload');
    return this.tenancy.replaceLogo(staff, file.buffer);
  }

  @Get('logo')
  @StaffRoute('tenant.read')
  @SerializeOptions({ schema: tenantLogoSchema })
  getLogo(@CurrentStaff() staff: StaffActor) {
    return this.tenancy.getLogo(staff);
  }

  @Delete('logo')
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: tenantSchema })
  archiveLogo(@CurrentStaff() staff: StaffActor) {
    return this.tenancy.archiveLogo(staff);
  }

  @Post('onboarding/complete')
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: tenantSchema })
  completeOnboarding(@CurrentStaff() staff: StaffActor) {
    return this.tenancy.completeOnboarding(staff);
  }
}

/** Branches of the session's tenant. */
@Controller('facilities')
@NoFeature()
export class FacilitiesController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Get()
  @StaffRoute('tenant.read')
  @SerializeOptions({ schema: facilityPageSchema })
  list(
    @CurrentStaff() staff: StaffActor,
    @Query({ schema: listFacilitiesQuerySchema }) query: z.output<typeof listFacilitiesQuerySchema>,
  ) {
    return this.tenancy.listFacilities(staff, query);
  }

  @Get(':id')
  @StaffRoute('tenant.read')
  @SerializeOptions({ schema: facilitySchema })
  get(@CurrentStaff() staff: StaffActor, @Param('id', idParam) id: string) {
    return this.tenancy.getFacility(staff, id);
  }

  @Post()
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: facilitySchema })
  create(
    @CurrentStaff() staff: StaffActor,
    @Body({ schema: createFacilitySchema }) input: z.output<typeof createFacilitySchema>,
  ) {
    return this.tenancy.createFacility(staff, input);
  }

  /**
   * The owner (`tenant.manage`), or staff granted `facility.manage` for this branch: the session
   * guard (S02) checks that grant's branch scope against `:id`.
   */
  @Patch(':id')
  @StaffRoute('tenant.manage', 'facility.manage')
  @SerializeOptions({ schema: facilitySchema })
  update(
    @CurrentStaff() staff: StaffActor,
    @Param('id', idParam) id: string,
    @Body({ schema: updateFacilitySchema }) input: z.output<typeof updateFacilitySchema>,
  ) {
    return this.tenancy.updateFacility(staff, id, input);
  }

  @Post(':id/archive')
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: facilitySchema })
  archive(@CurrentStaff() staff: StaffActor, @Param('id', idParam) id: string) {
    return this.tenancy.archiveFacility(staff, id);
  }

  @Post(':id/restore')
  @StaffRoute('tenant.manage')
  @SerializeOptions({ schema: facilitySchema })
  restore(@CurrentStaff() staff: StaffActor, @Param('id', idParam) id: string) {
    return this.tenancy.restoreFacility(staff, id);
  }
}

/** Reference data and helpers for the setup screens. */
@Controller()
@NoFeature()
export class TenancyLookupController {
  constructor(@Inject(TenancyService) private readonly tenancy: TenancyService) {}

  @Get('areas')
  @StaffRoute('tenant.read')
  @SerializeOptions({ schema: areaListSchema })
  areas(@Query({ schema: listAreasQuerySchema }) query: z.output<typeof listAreasQuerySchema>) {
    return this.tenancy.listAreas(query.parentId);
  }

  @Get('areas/:id')
  @StaffRoute('tenant.read')
  @SerializeOptions({ schema: areaSchema })
  area(@Param('id', idParam) id: string) {
    return this.tenancy.getArea(id);
  }

  @Post('maps/resolve-link')
  @StaffRoute('tenant.manage', 'facility.manage')
  @SerializeOptions({ schema: coordinatesSchema })
  resolveMapLink(
    @CurrentStaff() staff: StaffActor,
    @Body({ schema: resolveMapLinkSchema }) input: z.output<typeof resolveMapLinkSchema>,
  ) {
    return this.tenancy.resolveMapLink(staff, input.url);
  }
}
