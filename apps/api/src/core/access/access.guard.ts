import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, type TicketPurpose } from '@vertex-shifa/contracts';
import { ACCESS, type Access, ENTITLEMENT, type Entitlement } from './access.decorators.js';
import type { AuthenticatedRequest } from './actor.js';
import {
  DEVICE_TOKEN_HEADER,
  SESSION_VERIFIER,
  type SessionVerifier,
  TICKET_HEADER,
} from './session-verifier.js';

type Request = AuthenticatedRequest & {
  headers: Record<string, string | string[] | undefined>;
};

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bearer(request: Request): string | undefined {
  const match = /^Bearer (\S+)$/.exec(header(request, 'authorization') ?? '');
  return match?.[1];
}

const unauthenticated = () => new DomainError('UNAUTHENTICATED', 'No session');

/**
 * Runs before every route and refuses unless the route's declarations allow the request (ADR 0005,
 * ADR 0013). It fails closed: a route without declarations is refused, patient and console routes
 * are refused until their sessions exist (S19, S02 console), and every route that needs a feature
 * is refused until the entitlement resolver (S05). The actor, device and ticket it sets come from
 * verified tokens only (ADR 0004).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SESSION_VERIFIER) private readonly sessions: SessionVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const access = this.reflector.getAllAndOverride<Access | undefined>(ACCESS, targets);
    const entitlement = this.reflector.getAllAndOverride<Entitlement | undefined>(
      ENTITLEMENT,
      targets,
    );
    if (!access || !entitlement) {
      throw new DomainError('FORBIDDEN', 'The route declares no access or no entitlement');
    }
    await this.authenticate(access, context.switchToHttp().getRequest<Request>());
    if (entitlement.kind === 'feature') {
      throw new DomainError('NOT_ENTITLED', `Feature ${entitlement.feature} is not enabled`);
    }
    return true;
  }

  private async authenticate(access: Access, request: Request): Promise<void> {
    switch (access.kind) {
      case 'public':
        return;
      case 'staff': {
        const token = bearer(request);
        if (!token) throw unauthenticated();
        const actor = await this.sessions.staff(token);
        request.actor = actor;
        const { permissions } = access;
        if (permissions.length > 0 && !permissions.some((p) => actor.permissions.includes(p))) {
          throw new DomainError('FORBIDDEN', 'The member lacks the permission');
        }
        return;
      }
      case 'device': {
        const token = header(request, DEVICE_TOKEN_HEADER);
        if (!token) throw unauthenticated();
        const device = await this.sessions.device(token, { allowRevoked: access.allowRevoked });
        request.device = device;
        if (access.ticket) {
          const ticket = this.ticketOf(request, access.ticket);
          if (ticket.deviceId !== null && ticket.deviceId !== device.deviceId) {
            throw new DomainError('TICKET_INVALID', 'The ticket belongs to another device');
          }
          request.ticket = ticket;
        }
        return;
      }
      case 'ticket': {
        const ticket = this.ticketOf(request, access.purpose);
        // A ticket from a sign-in on a registered computer acts on that computer only: registering
        // a computer to a clinic always takes an OTP (rule 18).
        if (ticket.deviceId !== null) {
          throw new DomainError('TICKET_INVALID', 'The ticket belongs to a device');
        }
        request.ticket = ticket;
        return;
      }
      case 'patient':
      case 'console':
        throw unauthenticated();
    }
  }

  private ticketOf(request: Request, purpose: TicketPurpose) {
    const ticket = header(request, TICKET_HEADER);
    if (!ticket) throw new DomainError('TICKET_INVALID', 'No ticket');
    return this.sessions.ticket(ticket, purpose);
  }
}
