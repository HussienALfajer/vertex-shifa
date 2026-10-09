import { type DynamicModule, Module } from '@nestjs/common';
import type { Config } from './core/config/config.js';
import { ConfigModule } from './core/config/config.module.js';
import { SendingModule } from './sending/sending.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { TransportModule } from './transport/transport.module.js';

/** The WhatsApp gateway: the transport the config names, its sessions and sending (ADR 0012). */
@Module({})
export class GatewayModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: GatewayModule,
      imports: [ConfigModule.forRoot(config), TransportModule, SessionsModule, SendingModule],
    };
  }
}
