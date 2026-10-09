import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { GatewayModule } from '../src/gateway.module.js';
import { SendingService } from '../src/sending/sending.service.js';
import { SessionsService } from '../src/sessions/sessions.service.js';
import type { FakeWhatsAppTransport } from '../src/transport/fake-transport.js';
import { WHATSAPP_TRANSPORT } from '../src/transport/whatsapp-transport.js';

/** The gateway as `main.ts` builds it, with the fake transport. */
export async function startGateway() {
  const app = await NestFactory.createApplicationContext(
    GatewayModule.forRoot({ transport: 'fake' }),
    { logger: false },
  );
  return {
    app,
    transport: app.get<FakeWhatsAppTransport>(WHATSAPP_TRANSPORT),
    sessions: app.get(SessionsService),
    sending: app.get(SendingService),
  };
}
