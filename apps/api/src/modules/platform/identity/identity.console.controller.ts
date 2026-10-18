import {
  Body,
  Controller,
  Get,
  Inject,
  Ip,
  Param,
  Patch,
  Post,
  Put,
  SerializeOptions,
  UseInterceptors,
} from '@nestjs/common';
import {
  accountPasswordResetAuthorizedSchema,
  authorizeAccountPasswordResetSchema,
  changeAccountPhoneSchema,
  changePasswordSchema,
  consoleAccountLookupSchema,
  consoleAccountSchema,
  consoleMeSchema,
  consoleReauthenticatedSchema,
  consoleReauthSchema,
  consoleSetUpSchema,
  consoleSetupSchema,
  consoleSignInResultSchema,
  consoleSignInSchema,
  consoleTotpSchema,
  createPlatformUserSchema,
  passwordChangedSchema,
  platformUserListSchema,
  platformUserSchema,
  platformUserSetupSchema,
  sessionEndedSchema,
  updatePlatformUserSchema,
} from '@vertex-shifa/contracts';
import { z } from 'zod';
import {
  ConsoleRoute,
  ConsoleSignInRoute,
  NoFeature,
} from '../../../core/access/access.decorators.js';
import { CurrentPlatformUser, type PlatformActor } from '../../../core/access/actor.js';
import { AuthService } from './auth.service.js';
import { ConsoleAuthService } from './console-auth.service.js';
import { ConsoleSessionCookie } from './console-sessions.js';
import { PlatformUsersService } from './platform-users.service.js';

// Spec S02 "API and commands", console rows (rules 17 and 36–41). Every route belongs to every
// package (`@NoFeature()`).

const idParam = { schema: z.uuid() };

/**
 * Signing in to the console: password or setup code (with a proof of work from `POST
 * /api/auth/pow`), setup, TOTP; then re-authentication and signing out.
 */
@Controller('console/auth')
@NoFeature()
export class ConsoleAuthController {
  constructor(@Inject(ConsoleAuthService) private readonly console: ConsoleAuthService) {}

  @Post('sign-in')
  @ConsoleSignInRoute()
  @SerializeOptions({ schema: consoleSignInResultSchema })
  signIn(
    @Ip() address: string,
    @Body({ schema: consoleSignInSchema }) input: z.output<typeof consoleSignInSchema>,
  ) {
    return this.console.signIn(input, address);
  }

  @Post('setup')
  @ConsoleSignInRoute()
  @UseInterceptors(ConsoleSessionCookie)
  @SerializeOptions({ schema: consoleSetUpSchema })
  setUp(@Body({ schema: consoleSetupSchema }) input: z.output<typeof consoleSetupSchema>) {
    return this.console.setUp(input);
  }

  @Post('totp')
  @ConsoleSignInRoute()
  @UseInterceptors(ConsoleSessionCookie)
  @SerializeOptions({ schema: consoleMeSchema })
  totp(@Body({ schema: consoleTotpSchema }) input: z.output<typeof consoleTotpSchema>) {
    return this.console.verifyTotp(input);
  }

  @Post('reauth')
  @ConsoleRoute()
  @SerializeOptions({ schema: consoleReauthenticatedSchema })
  reauthenticate(
    @CurrentPlatformUser() user: PlatformActor,
    @Body({ schema: consoleReauthSchema }) input: z.output<typeof consoleReauthSchema>,
  ) {
    return this.console.reauthenticate(user, input);
  }

  @Post('sign-out')
  @ConsoleRoute()
  @UseInterceptors(ConsoleSessionCookie)
  @SerializeOptions({ schema: sessionEndedSchema })
  signOut(@CurrentPlatformUser() user: PlatformActor) {
    return this.console.signOut(user);
  }
}

/** The signed-in platform user. */
@Controller('console/me')
@NoFeature()
export class ConsoleMeController {
  constructor(@Inject(ConsoleAuthService) private readonly console: ConsoleAuthService) {}

  @Get()
  @ConsoleRoute()
  @SerializeOptions({ schema: consoleMeSchema })
  me(@CurrentPlatformUser() user: PlatformActor) {
    return this.console.me(user);
  }

  @Put('password')
  @ConsoleRoute()
  @SerializeOptions({ schema: passwordChangedSchema })
  changePassword(
    @CurrentPlatformUser() user: PlatformActor,
    @Body({ schema: changePasswordSchema }) input: z.output<typeof changePasswordSchema>,
  ) {
    return this.console.changePassword(user, input);
  }
}

/** Platform users, for admins; every change needs a recent TOTP (rule 38). */
@Controller('console/platform-users')
@NoFeature()
export class PlatformUsersController {
  constructor(@Inject(PlatformUsersService) private readonly users: PlatformUsersService) {}

  @Get()
  @ConsoleRoute('platform-users.manage')
  @SerializeOptions({ schema: platformUserListSchema })
  list() {
    return this.users.list();
  }

  @Post()
  @ConsoleRoute('platform-users.manage', { reauth: true })
  @SerializeOptions({ schema: platformUserSetupSchema })
  create(
    @CurrentPlatformUser() user: PlatformActor,
    @Body({ schema: createPlatformUserSchema }) input: z.output<typeof createPlatformUserSchema>,
  ) {
    return this.users.create(user, input);
  }

  @Patch(':id')
  @ConsoleRoute('platform-users.manage', { reauth: true })
  @SerializeOptions({ schema: platformUserSchema })
  update(
    @CurrentPlatformUser() user: PlatformActor,
    @Param('id', idParam) id: string,
    @Body({ schema: updatePlatformUserSchema }) input: z.output<typeof updatePlatformUserSchema>,
  ) {
    return this.users.update(user, id, input);
  }

  @Post(':id/reset')
  @ConsoleRoute('platform-users.manage', { reauth: true })
  @SerializeOptions({ schema: platformUserSetupSchema })
  reset(@CurrentPlatformUser() user: PlatformActor, @Param('id', idParam) id: string) {
    return this.users.reset(user, id);
  }
}

/** Owner recovery by Vertex support (rule 17); the changes need a recent TOTP (rule 38). */
@Controller('console/accounts')
@NoFeature()
export class ConsoleAccountsController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('lookup')
  @ConsoleRoute('accounts.recover')
  @SerializeOptions({ schema: consoleAccountSchema })
  lookUp(
    @CurrentPlatformUser() user: PlatformActor,
    @Body({ schema: consoleAccountLookupSchema })
    input: z.output<typeof consoleAccountLookupSchema>,
  ) {
    return this.auth.lookUpAccount({ phone: input.phone }, user);
  }

  @Post(':id/password-reset')
  @ConsoleRoute('accounts.recover', { reauth: true })
  @SerializeOptions({ schema: accountPasswordResetAuthorizedSchema })
  authorizePasswordReset(
    @CurrentPlatformUser() user: PlatformActor,
    @Param('id', idParam) id: string,
    @Body({ schema: authorizeAccountPasswordResetSchema })
    input: z.output<typeof authorizeAccountPasswordResetSchema>,
  ) {
    return this.auth.authorizePasswordReset(user, { id }, input.reason);
  }

  @Put(':id/phone')
  @ConsoleRoute('accounts.recover', { reauth: true })
  @SerializeOptions({ schema: consoleAccountSchema })
  async changePhone(
    @CurrentPlatformUser() user: PlatformActor,
    @Param('id', idParam) id: string,
    @Body({ schema: changeAccountPhoneSchema }) input: z.output<typeof changeAccountPhoneSchema>,
  ) {
    await this.auth.changePhone(user, { id }, input.phone, input.reason);
    return this.auth.lookUpAccount({ id });
  }
}
