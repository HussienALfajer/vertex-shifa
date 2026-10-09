import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module.js';
import { SendingService } from './sending.service.js';

@Module({
  imports: [SessionsModule],
  providers: [SendingService],
  exports: [SendingService],
})
export class SendingModule {}
