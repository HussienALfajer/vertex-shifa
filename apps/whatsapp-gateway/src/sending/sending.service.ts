import { Inject, Injectable } from '@nestjs/common';
import { SessionsService } from '../sessions/sessions.service.js';

/**
 * Sends messages through the sessions this process runs. Only a linked, connected session sends:
 * otherwise `SessionNotConnectedError`. S03 adds the per-number rate limits and daily caps, the
 * `messages` table with its forward-only receipts, and retries (ADR 0012, ADR 0022).
 */
@Injectable()
export class SendingService {
  constructor(@Inject(SessionsService) private readonly sessions: SessionsService) {}

  /** Sends `text` to `to` (E.164) from the session; resolves with the transport's message id. */
  async sendText(sessionId: string, to: string, text: string): Promise<{ messageId: string }> {
    return this.sessions.connection(sessionId).sendText(to, text);
  }
}
