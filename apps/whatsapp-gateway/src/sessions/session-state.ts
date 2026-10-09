import type { DisconnectReason } from '../transport/whatsapp-transport.js';

/** A WhatsApp session's state (ADR 0012). */
export type SessionState = 'linking' | 'connected' | 'disconnected' | 'needs_relink' | 'banned';

/**
 * What a session does when its connection closes (ADR 0022): reconnect at once, reconnect after a
 * backoff, stop in a state that needs a person (re-link, or a banned number paused), or let go of
 * the session because another process holds it and the lease decides who runs it.
 */
export type DisconnectAction =
  | { kind: 'reconnect_now' }
  | { kind: 'reconnect_later'; state: 'disconnected' }
  | { kind: 'stop'; state: 'needs_relink' | 'banned' }
  | { kind: 'release' };

export function disconnectAction(reason: DisconnectReason): DisconnectAction {
  switch (reason) {
    case 'restart_required':
      return { kind: 'reconnect_now' };
    case 'logged_out':
      return { kind: 'stop', state: 'needs_relink' };
    case 'forbidden':
      return { kind: 'stop', state: 'banned' };
    case 'connection_replaced':
      return { kind: 'release' };
    case 'connection_lost':
      return { kind: 'reconnect_later', state: 'disconnected' };
  }
}

/** The wait before reconnect attempt `attempt` (from 1): 1 s, doubling, at most 60 s (ADR 0022). */
export function reconnectDelay(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 60_000);
}
