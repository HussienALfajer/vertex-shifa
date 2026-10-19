import { DomainError, type TicketPurpose, ticketTtlSeconds } from '@vertex-shifa/contracts';
import type { Database, Transaction } from '@vertex-shifa/db';
import type { Ticket } from '../../../core/access/actor.js';
import { randomToken } from './secrets.js';
import { isTokenUsed, useToken } from './single-use.js';
import type { TokenSigner } from './tokens.js';

const invalid = () => new DomainError('TICKET_INVALID', 'Invalid or used ticket');

/**
 * Sign-in tickets (spec S02): signed, 10 minutes, single use. A ticket proves the account passed a
 * step (an OTP, a password) and lets it take the next one; `consume` uses it up in the transaction
 * of the next step, in PostgreSQL (`used_tokens`), so a restart forgets no use.
 */
export class Tickets {
  constructor(
    private readonly db: Database,
    private readonly tokens: TokenSigner,
  ) {}

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
  async verify(token: string, purpose: TicketPurpose): Promise<Ticket> {
    const claims = this.tokens.verify(token, 'ticket');
    if (!claims || claims.purpose !== purpose) throw invalid();
    if (await isTokenUsed(this.db, 'ticket', claims.jti)) throw invalid();
    return {
      id: claims.jti,
      purpose,
      accountId: claims.acc,
      tenantId: claims.tid,
      deviceId: claims.did,
    };
  }

  /**
   * Uses up the ticket in `tx`, the transaction of the step it authorizes: if the step fails, the
   * ticket stays usable. A second use (a double submit, a replay, a concurrent request) is
   * `TICKET_INVALID`.
   */
  async consume(tx: Transaction, ticket: Ticket): Promise<void> {
    const expiresAt = new Date(Date.now() + ticketTtlSeconds * 1000);
    if (!(await useToken(tx, 'ticket', ticket.id, expiresAt))) throw invalid();
  }
}
