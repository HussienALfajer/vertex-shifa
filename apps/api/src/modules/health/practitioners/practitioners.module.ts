import { Global, Module } from '@nestjs/common';
import { PRACTITIONER_PROFILES } from '../../platform/access/index.js';
import { PractitionersController, SpecialtiesController } from './practitioners.controller.js';
import { PractitionersService } from './practitioners.service.js';

/**
 * Doctor profiles, their specialties and photos (spec S02). Global, because it provides the
 * `PRACTITIONER_PROFILES` port that staff management (access) and `/api/me` (identity) declare in
 * the platform layer below.
 */
@Global()
@Module({
  controllers: [PractitionersController, SpecialtiesController],
  providers: [
    PractitionersService,
    { provide: PRACTITIONER_PROFILES, useExisting: PractitionersService },
  ],
  exports: [PRACTITIONER_PROFILES],
})
export class PractitionersModule {}
