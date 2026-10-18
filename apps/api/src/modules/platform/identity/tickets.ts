import { DomainError, type TicketPurpose, ticketTtlSeconds } from '@vertex-shifa/contracts';
import type { Ticket } from '../../../core/access/actor.js';
import { randomToken } from './secrets.js';
import { SingleUse } from './single-use.js';
import type { TokenSigner } from './tokens.js';

const invalid = () => new DomainError('TICKET_INVALID', 'Invalid or used ticket');

/**
 * Sign-in tickets (spec S02): signed, 10 minutes, single use. A ticket proves the account passed a
 * step (an OTP, a password) and lets it take the next one; `consume` uses it up when the next
 * step acts.
 */
export class Tickets {
  private readonly used = new SingleUse();

  constructor(private readonly tokens: TokenSigner) {}

  issue(
    purpose: TicketPurpose,
    accountId: string,
    device: { tenantId: string; deviceId: string } | null = null,
  ): string {
    return this.tokens.sign(
      'ticket',
      {
        jti: randomToken(16),
        purpose,
        acc: accountId,
        tid: device?.tenantId ?? null,
        did: device?.deviceId ?? null,
      },
      ticketTtlSeconds,
    ).token;
  }

  /** A valid, unused ticket for `purpose`, or `TICKET_INVALID`. */
  verify(token: string, purpose: TicketPurpose): Ticket {
    const claims = this.tokens.verify(token, 'ticket');
    if (!claims || claims.purpose !== purpose || this.used.isUsed(claims.jti)) throw invalid();
    return {
      id: claims.jti,
      purpose,
      accountId: claims.acc,
      tenantId: claims.tid,
      deviceId: claims.did,
    };
  }

  /** Uses up the ticket; a second use (a double submit, a replay) is `TICKET_INVALID`. */
  consume(ticket: Ticket): void {
    if (!this.used.use(ticket.id, Date.now() + ticketTtlSeconds * 1000)) throw invalid();
  }
}
