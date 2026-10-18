import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Ip,
  Post,
  Put,
  SerializeOptions,
} from '@nestjs/common';
import {
  changePasswordSchema,
  currentDeviceSchema,
  deviceTokenChallengeSchema,
  deviceTokenRequestSchema,
  deviceTokenSchema,
  deviceWipedSchema,
  endSessionSchema,
  enrolledSchema,
  enrollSchema,
  jwksSchema,
  meSchema,
  nonceSchema,
  openSessionSchema,
  otpChallengeSchema,
  otpRequestSchema,
  otpVerifiedSchema,
  otpVerifySchema,
  passwordChangedSchema,
  proofOfWorkChallengeSchema,
  refreshSessionSchema,
  registerDeviceSchema,
  registeredDeviceSchema,
  registrationOptionsSchema,
  sessionEndedSchema,
  sessionTokensSchema,
  setPasswordSchema,
  signInResultSchema,
  signInSchema,
  signInTicketSchema,
} from '@vertex-shifa/contracts';
import type { z } from 'zod';
import {
  DeviceRoute,
  NoFeature,
  Public,
  StaffRoute,
  TicketRoute,
} from '../../../core/access/access.decorators.js';
import {
  CurrentDevice,
  CurrentStaff,
  CurrentTicket,
  type DeviceActor,
  type StaffActor,
  type Ticket,
} from '../../../core/access/actor.js';
import { DEVICE_TOKEN_HEADER } from '../../../core/access/session-verifier.js';
import { AuthService } from './auth.service.js';
import { DevicesService } from './devices.service.js';
import { SessionsService } from './sessions.service.js';
import { TokenSigner } from './tokens.js';

// Spec S02 "API and commands". Every route here belongs to every package (`@NoFeature()`).

/** Signing in: proof of work, password, OTPs, the first password and the registration options. */
@Controller('auth')
@NoFeature()
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('pow')
  @Public()
  @SerializeOptions({ schema: proofOfWorkChallengeSchema })
  proofOfWork(@Ip() address: string) {
    return this.auth.proofOfWork(address);
  }

  @Post('sign-in')
  @Public()
  @SerializeOptions({ schema: signInResultSchema })
  signIn(
    @Ip() address: string,
    @Headers(DEVICE_TOKEN_HEADER) deviceToken: string | undefined,
    @Body({ schema: signInSchema }) input: z.output<typeof signInSchema>,
  ) {
    return this.auth.signIn(input, address, deviceToken);
  }

  @Post('otp/request')
  @Public()
  @SerializeOptions({ schema: otpChallengeSchema })
  requestOtp(
    @Ip() address: string,
    @Body({ schema: otpRequestSchema }) input: z.output<typeof otpRequestSchema>,
  ) {
    return this.auth.requestOtp(input, address);
  }

  @Post('otp/resend')
  @Public()
  @SerializeOptions({ schema: otpChallengeSchema })
  resendOtp(
    @Ip() address: string,
    @Body({ schema: otpChallengeSchema }) input: z.output<typeof otpChallengeSchema>,
  ) {
    return this.auth.resendOtp(input.challengeId, address);
  }

  @Post('otp/verify')
  @Public()
  @SerializeOptions({ schema: otpVerifiedSchema })
  verifyOtp(
    @Ip() address: string,
    @Body({ schema: otpVerifySchema }) input: z.output<typeof otpVerifySchema>,
  ) {
    return this.auth.verifyOtp(input, address);
  }

  @Post('password')
  @TicketRoute('set_password')
  @SerializeOptions({ schema: signInTicketSchema })
  setPassword(
    @CurrentTicket() ticket: Ticket,
    @Body({ schema: setPasswordSchema }) input: z.output<typeof setPasswordSchema>,
  ) {
    return this.auth.setPassword(ticket, input);
  }

  @Get('registration-options')
  @TicketRoute('signed_in')
  @SerializeOptions({ schema: registrationOptionsSchema })
  registrationOptions(@CurrentTicket() ticket: Ticket) {
    return this.auth.registrationOptions(ticket);
  }
}

/** The signed-in member's own account. */
@Controller('me')
@NoFeature()
export class MeController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  @StaffRoute()
  @SerializeOptions({ schema: meSchema })
  me(@CurrentStaff() staff: StaffActor) {
    return this.auth.me(staff);
  }

  @Put('password')
  @StaffRoute()
  @SerializeOptions({ schema: passwordChangedSchema })
  changePassword(
    @CurrentStaff() staff: StaffActor,
    @Body({ schema: changePasswordSchema }) input: z.output<typeof changePasswordSchema>,
  ) {
    return this.auth.changePassword(staff, input);
  }
}

/** Registered computers: registration, device tokens, their own view, wipe and enrollments. */
@Controller('devices')
@NoFeature()
export class DevicesController {
  constructor(@Inject(DevicesService) private readonly devices: DevicesService) {}

  @Post()
  @TicketRoute('signed_in')
  @SerializeOptions({ schema: registeredDeviceSchema })
  register(
    @CurrentTicket() ticket: Ticket,
    @Body({ schema: registerDeviceSchema }) input: z.output<typeof registerDeviceSchema>,
  ) {
    return this.devices.register(ticket, input);
  }

  @Post('token/challenge')
  @Public()
  @SerializeOptions({ schema: nonceSchema })
  challenge(
    @Ip() address: string,
    @Body({ schema: deviceTokenChallengeSchema })
    input: z.output<typeof deviceTokenChallengeSchema>,
  ) {
    return this.devices.challenge(input, address);
  }

  @Post('token')
  @Public()
  @SerializeOptions({ schema: deviceTokenSchema })
  token(
    @Body({ schema: deviceTokenRequestSchema }) input: z.output<typeof deviceTokenRequestSchema>,
  ) {
    return this.devices.token(input);
  }

  @Get('current')
  @DeviceRoute()
  @SerializeOptions({ schema: currentDeviceSchema })
  current(@CurrentDevice() device: DeviceActor) {
    return this.devices.current(device);
  }

  @Post('current/wiped')
  @DeviceRoute({ allowRevoked: true })
  @SerializeOptions({ schema: deviceWipedSchema })
  wiped(@CurrentDevice() device: DeviceActor) {
    return this.devices.wiped(device);
  }

  @Post('current/enrollments')
  @DeviceRoute({ ticket: 'signed_in' })
  @SerializeOptions({ schema: enrolledSchema })
  enroll(
    @CurrentDevice() device: DeviceActor,
    @CurrentTicket() ticket: Ticket,
    @Body({ schema: enrollSchema }) input: z.output<typeof enrollSchema>,
  ) {
    return this.devices.enroll(device, ticket, input);
  }
}

/** Staff sessions on a registered computer. */
@Controller('sessions')
@NoFeature()
export class SessionsController {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  @Post('challenge')
  @DeviceRoute()
  @SerializeOptions({ schema: nonceSchema })
  challenge(@CurrentDevice() device: DeviceActor) {
    return this.sessions.challenge(device);
  }

  @Post()
  @DeviceRoute()
  @SerializeOptions({ schema: sessionTokensSchema })
  open(
    @CurrentDevice() device: DeviceActor,
    @Body({ schema: openSessionSchema }) input: z.output<typeof openSessionSchema>,
  ) {
    return this.sessions.open(device, input);
  }

  @Post('refresh')
  @DeviceRoute()
  @SerializeOptions({ schema: sessionTokensSchema })
  refresh(
    @CurrentDevice() device: DeviceActor,
    @Body({ schema: refreshSessionSchema }) input: z.output<typeof refreshSessionSchema>,
  ) {
    return this.sessions.refresh(device, input.refreshToken);
  }

  @Post('current/end')
  @StaffRoute()
  @SerializeOptions({ schema: sessionEndedSchema })
  end(
    @CurrentStaff() staff: StaffActor,
    @Body({ schema: endSessionSchema }) input: z.output<typeof endSessionSchema>,
  ) {
    return this.sessions.end(staff, input.reason);
  }
}

/** The public keys of the API's tokens, for the sync service (S04). */
@Controller('.well-known')
@NoFeature()
export class JwksController {
  constructor(@Inject(TokenSigner) private readonly tokens: TokenSigner) {}

  @Get('jwks.json')
  @Public()
  @SerializeOptions({ schema: jwksSchema })
  jwks() {
    return this.tokens.jwks();
  }
}
