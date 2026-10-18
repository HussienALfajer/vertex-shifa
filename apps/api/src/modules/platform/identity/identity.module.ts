import { Global, Module } from '@nestjs/common';
import { nonceTtlSeconds } from '@vertex-shifa/contracts';
import type { Database } from '@vertex-shifa/db';
import { SESSION_VERIFIER } from '../../../core/access/session-verifier.js';
import type { Config } from '../../../core/config/config.js';
import { CONFIG } from '../../../core/config/config.module.js';
import { DATABASE } from '../../../core/database/database.module.js';
import { MEMBER_DEVICES, STAFF_ACCOUNTS } from '../access/index.js';
import { FACILITY_DEVICES } from '../tenancy/index.js';
import { AuthService } from './auth.service.js';
import { DeviceManagementService } from './device-management.service.js';
import { DEVICE_NONCES, DevicesService } from './devices.service.js';
import {
  AuthController,
  DeviceManagementController,
  DevicesController,
  JwksController,
  MeController,
  SessionsController,
} from './identity.controller.js';
import { OtpChallenges } from './otp-challenges.js';
import { FakeOtpSender, OTP_SENDER, type OtpSender } from './otp-sender.js';
import { ProofOfWork } from './proof-of-work.js';
import { KeyedHash } from './secrets.js';
import { SESSION_NONCES, SessionsService } from './sessions.service.js';
import { Nonces } from './single-use.js';
import { StaffAccountsStore } from './staff-accounts.js';
import { SessionIssuer } from './staff-sessions.js';
import { Tickets } from './tickets.js';
import { TokenSigner } from './tokens.js';

/**
 * Accounts, sign-in, OTPs, devices, enrollments and staff sessions (spec S02). Global, because it
 * provides the ports other modules and the core declare: the session verifier of the access guard
 * (`SESSION_VERIFIER`), the branch rules on devices of tenancy (`FACILITY_DEVICES`), and the
 * accounts and member computers of staff management in access (`STAFF_ACCOUNTS`,
 * `MEMBER_DEVICES`).
 */
@Global()
@Module({
  controllers: [
    AuthController,
    MeController,
    DevicesController,
    DeviceManagementController,
    SessionsController,
    JwksController,
  ],
  providers: [
    {
      provide: KeyedHash,
      inject: [CONFIG],
      useFactory: (config: Config) => new KeyedHash(config.identity.hashKey),
    },
    {
      provide: TokenSigner,
      inject: [CONFIG],
      useFactory: (config: Config) => new TokenSigner(config.identity.tokenKey),
    },
    {
      provide: ProofOfWork,
      inject: [KeyedHash, CONFIG],
      useFactory: (hashes: KeyedHash, config: Config) =>
        new ProofOfWork(hashes, config.identity.powDifficulty),
    },
    {
      provide: Tickets,
      inject: [TokenSigner],
      useFactory: (tokens: TokenSigner) => new Tickets(tokens),
    },
    {
      provide: SessionIssuer,
      inject: [TokenSigner, KeyedHash],
      useFactory: (tokens: TokenSigner, hashes: KeyedHash) => new SessionIssuer(tokens, hashes),
    },
    // Only the fake exists until S03; `loadConfig` refuses it in production.
    { provide: OTP_SENDER, useFactory: () => new FakeOtpSender() },
    {
      provide: OtpChallenges,
      inject: [DATABASE, KeyedHash, OTP_SENDER],
      useFactory: (db: Database, hashes: KeyedHash, sender: OtpSender) =>
        new OtpChallenges(db, hashes, sender),
    },
    { provide: DEVICE_NONCES, useFactory: () => new Nonces(nonceTtlSeconds * 1000) },
    { provide: SESSION_NONCES, useFactory: () => new Nonces(nonceTtlSeconds * 1000) },
    AuthService,
    DevicesService,
    SessionsService,
    DeviceManagementService,
    { provide: SESSION_VERIFIER, useExisting: SessionsService },
    { provide: FACILITY_DEVICES, useExisting: DevicesService },
    { provide: MEMBER_DEVICES, useExisting: DeviceManagementService },
    { provide: STAFF_ACCOUNTS, useFactory: () => new StaffAccountsStore() },
  ],
  exports: [
    SESSION_VERIFIER,
    FACILITY_DEVICES,
    MEMBER_DEVICES,
    STAFF_ACCOUNTS,
    AuthService,
    OTP_SENDER,
  ],
})
export class IdentityModule {}
