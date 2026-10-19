import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  SerializeOptions,
} from '@nestjs/common';
import {
  changeStaffAccessSchema,
  createInvitationSchema,
  deactivateStaffSchema,
  listStaffQuerySchema,
  passwordResetAuthorizedSchema,
  previousPractitionerSchema,
  staffMemberSchema,
  staffPageSchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import { NoFeature, StaffRoute } from '../../../core/access/access.decorators.js';
import { CurrentStaff, type StaffActor } from '../../../core/access/actor.js';
import { StaffService } from './staff.service.js';

// `staff.read` lists and reads members; every change is the owner's (`staff.manage`, which only
// owners may hold). S05 adds the staff-user and doctor limits to invite and reactivate.

const idParam = { schema: z.uuid() };

/** The clinic's staff (spec S02). */
@Controller('staff')
@NoFeature()
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get()
  @StaffRoute('staff.read')
  @SerializeOptions({ schema: staffPageSchema })
  list(
    @CurrentStaff() actor: StaffActor,
    @Query({ schema: listStaffQuerySchema }) query: z.output<typeof listStaffQuerySchema>,
  ) {
    return this.staff.list(actor, query);
  }

  @Get(':id')
  @StaffRoute('staff.read')
  @SerializeOptions({ schema: staffMemberSchema })
  get(@CurrentStaff() actor: StaffActor, @Param('id', idParam) id: string) {
    return this.staff.get(actor, id);
  }

  /** The archived doctor profile the doctor role restores, for the owner to review (rule 9). */
  @Get(':id/previous-practitioner')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: previousPractitionerSchema })
  previousPractitioner(@CurrentStaff() actor: StaffActor, @Param('id', idParam) id: string) {
    return this.staff.previousPractitioner(actor, id);
  }

  @Post('invitations')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: staffMemberSchema })
  invite(
    @CurrentStaff() actor: StaffActor,
    @Body({ schema: createInvitationSchema }) input: z.output<typeof createInvitationSchema>,
  ) {
    return this.staff.invite(actor, input);
  }

  @Post(':id/invitation/resend')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: staffMemberSchema })
  resend(@CurrentStaff() actor: StaffActor, @Param('id', idParam) id: string) {
    return this.staff.resend(actor, id);
  }

  @Post(':id/invitation/cancel')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: staffMemberSchema })
  cancel(@CurrentStaff() actor: StaffActor, @Param('id', idParam) id: string) {
    return this.staff.cancel(actor, id);
  }

  @Patch(':id/access')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: staffMemberSchema })
  changeAccess(
    @CurrentStaff() actor: StaffActor,
    @Param('id', idParam) id: string,
    @Body({ schema: changeStaffAccessSchema }) input: z.output<typeof changeStaffAccessSchema>,
  ) {
    return this.staff.changeAccess(actor, id, input);
  }

  @Post(':id/deactivate')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: staffMemberSchema })
  deactivate(
    @CurrentStaff() actor: StaffActor,
    @Param('id', idParam) id: string,
    @Body({ schema: deactivateStaffSchema }) input: z.output<typeof deactivateStaffSchema>,
  ) {
    return this.staff.deactivate(actor, id, input.reason);
  }

  @Post(':id/reactivate')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: staffMemberSchema })
  reactivate(@CurrentStaff() actor: StaffActor, @Param('id', idParam) id: string) {
    return this.staff.reactivate(actor, id);
  }

  @Post(':id/password-reset')
  @StaffRoute('staff.manage')
  @SerializeOptions({ schema: passwordResetAuthorizedSchema })
  authorizePasswordReset(@CurrentStaff() actor: StaffActor, @Param('id', idParam) id: string) {
    return this.staff.authorizePasswordReset(actor, id);
  }
}
