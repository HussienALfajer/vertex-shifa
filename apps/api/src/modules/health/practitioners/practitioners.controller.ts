import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Put,
  SerializeOptions,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  DomainError,
  practitionerListSchema,
  practitionerPhotoSchema,
  practitionerPhotoUpload,
  practitionerSchema,
  specialtyListSchema,
  updatePractitionerSchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import { NoFeature, StaffRoute } from '../../../core/access/access.decorators.js';
import { CurrentStaff, type StaffActor } from '../../../core/access/actor.js';
import { RejectedUpload } from '../../../core/uploads/rejected-upload.js';
import { PractitionersService } from './practitioners.service.js';

// `practitioners.read` every role; edits by the owner (`staff.manage`) or by the doctor on their own
// profile (`practitioner.edit_own`, checked against the profile by the service).

const idParam = { schema: z.uuid() };

/** Doctor profiles of the clinic (spec S02). */
@Controller('practitioners')
@NoFeature()
export class PractitionersController {
  constructor(@Inject(PractitionersService) private readonly practitioners: PractitionersService) {}

  @Get()
  @StaffRoute('practitioners.read')
  @SerializeOptions({ schema: practitionerListSchema })
  list(@CurrentStaff() staff: StaffActor) {
    return this.practitioners.list(staff);
  }

  @Get(':id')
  @StaffRoute('practitioners.read')
  @SerializeOptions({ schema: practitionerSchema })
  get(@CurrentStaff() staff: StaffActor, @Param('id', idParam) id: string) {
    return this.practitioners.get(staff, id);
  }

  @Patch(':id')
  @StaffRoute('staff.manage', 'practitioner.edit_own')
  @SerializeOptions({ schema: practitionerSchema })
  update(
    @CurrentStaff() staff: StaffActor,
    @Param('id', idParam) id: string,
    @Body({ schema: updatePractitionerSchema }) input: z.output<typeof updatePractitionerSchema>,
  ) {
    return this.practitioners.update(staff, id, input);
  }

  @Put(':id/photo')
  @StaffRoute('staff.manage', 'practitioner.edit_own')
  @SerializeOptions({ schema: practitionerPhotoSchema })
  @UseInterceptors(
    RejectedUpload,
    FileInterceptor('file', {
      limits: { fileSize: practitionerPhotoUpload.maxBytes, files: 1, fields: 0, parts: 1 },
    }),
  )
  replacePhoto(
    @CurrentStaff() staff: StaffActor,
    @Param('id', idParam) id: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    if (!file) throw new DomainError('FILE_REJECTED', 'No file in the upload');
    return this.practitioners.replacePhoto(staff, id, file.buffer);
  }

  @Get(':id/photo')
  @StaffRoute('practitioners.read')
  @SerializeOptions({ schema: practitionerPhotoSchema })
  getPhoto(@CurrentStaff() staff: StaffActor, @Param('id', idParam) id: string) {
    return this.practitioners.getPhoto(staff, id);
  }

  @Delete(':id/photo')
  @StaffRoute('staff.manage', 'practitioner.edit_own')
  @SerializeOptions({ schema: practitionerSchema })
  archivePhoto(@CurrentStaff() staff: StaffActor, @Param('id', idParam) id: string) {
    return this.practitioners.archivePhoto(staff, id);
  }
}

/** The platform's specialty list, for the doctor profile. */
@Controller('specialties')
@NoFeature()
export class SpecialtiesController {
  constructor(@Inject(PractitionersService) private readonly practitioners: PractitionersService) {}

  @Get()
  @StaffRoute('practitioners.read')
  @SerializeOptions({ schema: specialtyListSchema })
  list() {
    return this.practitioners.specialties();
  }
}
