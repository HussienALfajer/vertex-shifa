import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainError, type TicketPurpose } from '@vertex-shifa/contracts';
import type { Config } from '../config/config.js';
import { CONFIG } from '../config/config.module.js';
import { ACCESS, type Access, ENTITLEMENT, type Entitlement } from './access.decorators.js';
import type { AuthenticatedRequest } from './actor.js';
import {
  CONSOLE_SESSION_COOKIE,
  DEVICE_TOKEN_HEADER,
  SESSION_VERIFIER,
  type SessionVerifier,
  TICKET_HEADER,
} from './session-verifier.js';

type Request = AuthenticatedRequest & {
  method: string;
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string | undefined>;
  /** Express's matched route: its path with parameters, `/api/console/tenants/:id/status`. */
  route?: { path?: unknown };
};

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bearer(request: Request): string | undefined {
  const match = /^Bearer (\S+)$/.exec(header(request, 'authorization') ?? '');
  return match?.[1];
}

/** The value of cookie `name` in the request's `Cookie` header. */
function cookie(request: Request, name: string): string | undefined {
  for (const part of (header(request, 'cookie') ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

const unauthenticated = () => new DomainError('UNAUTHENTICATED', 'No session');
const crossOrigin = () => new DomainError('FORBIDDEN', 'A console write from another origin');

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Runs before every route and refuses unless the route's declarations allow the request (ADR 0005,
 * ADR 0013). It fails closed: a route without declarations is refused, patient routes are refused
 * until their sessions exist (S19), and every route that needs a feature is refused until the
 * entitlement resolver (S05). The actor, device and ticket it sets come from verified tokens only
 * (ADR 0004).
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SESSION_VERIFIER) private readonly sessions: SessionVerifier,
    @Inject(CONFIG) private readonly config: Config,
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
          const ticket = await this.ticketOf(request, access.ticket);
          if (ticket.deviceId !== null && ticket.deviceId !== device.deviceId) {
            throw new DomainError('TICKET_INVALID', 'The ticket belongs to another device');
          }
          request.ticket = ticket;
        }
        return;
      }
      case 'ticket': {
        const ticket = await this.ticketOf(request, access.purpose);
        // A ticket from a sign-in on a registered computer acts on that computer only: registering
        // a computer to a clinic always takes an OTP (rule 18).
        if (ticket.deviceId !== null) {
          throw new DomainError('TICKET_INVALID', 'The ticket belongs to a device');
        }
        request.ticket = ticket;
        return;
      }
      case 'console': {
        const token = cookie(request, CONSOLE_SESSION_COOKIE);
        if (!token) throw unauthenticated();
        const route = typeof request.route?.path === 'string' ? request.route.path : '';
        // The origin is judged by the verifier, after the request is audited (rule 41).
        request.actor = await this.sessions.console(
          token,
          {
            permission: access.permission,
            reauth: access.reauth,
            fromConsole: this.fromConsole(request),
          },
          { route: `${request.method} ${route}`, params: request.params ?? {} },
        );
        return;
      }
      case 'console-sign-in':
        if (!this.fromConsole(request)) throw crossOrigin();
        return;
      case 'patient':
        throw unauthenticated();
    }
  }

  /**
   * Rule 39: a console write must come from the console's own origin. `SameSite=Strict` is decided
   * per site, so a sibling subdomain could still make the browser send the cookie; this cannot.
   */
  private fromConsole(request: Request): boolean {
    return READS.has(request.method) || header(request, 'origin') === this.config.consoleOrigin;
  }

  private ticketOf(request: Request, purpose: TicketPurpose) {
    const ticket = header(request, TICKET_HEADER);
    if (!ticket) throw new DomainError('TICKET_INVALID', 'No ticket');
    return this.sessions.ticket(ticket, purpose);
  }
}
