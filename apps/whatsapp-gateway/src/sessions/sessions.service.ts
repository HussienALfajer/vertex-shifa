import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  type CredentialStore,
  type SessionEvents,
  type TransportConnection,
  WHATSAPP_TRANSPORT,
  type WhatsAppTransport,
} from '../transport/whatsapp-transport.js';
import { disconnectAction, reconnectDelay, type SessionState } from './session-state.js';

/** Sending through a session that has no open, linked connection. */
export class SessionNotConnectedError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} is not connected`);
    this.name = 'SessionNotConnectedError';
  }
}

interface Session {
  credentials: CredentialStore;
  state: SessionState;
  connection?: TransportConnection | undefined;
  /** Counts connects, so events of a replaced connection are ignored. */
  generation: number;
  /** Failed connections in a row, for the backoff; reset when the session opens. */
  failures: number;
  /**
   * A restart was asked for since the session last opened: another one before it opens waits like a
   * lost connection, so a server that keeps asking never gets a tight reconnect loop.
   */
  restarted: boolean;
  retry?: NodeJS.Timeout;
}

/**
 * The sessions this process runs, through the transport (ADR 0012, ADR 0022). Each session keeps one
 * connection and reacts to its closing by the disconnect table: reconnect at once after a restart
 * (once until it opens), reconnect with backoff after a network loss, stop in `needs_relink` or
 * `banned`, and let go of a session another process took over. Every connection closes on shutdown.
 *
 * State lives in memory: S03 adds the database lease (one live connection per session), the stored
 * state with its alerts, and the handling of incoming messages and receipts, which this skeleton
 * drops. Logs hold session ids and reasons, never a phone number or a message.
 */
@Injectable()
export class SessionsService implements OnApplicationShutdown {
  private readonly logger = new Logger('Sessions');
  private readonly sessions = new Map<string, Session>();

  constructor(@Inject(WHATSAPP_TRANSPORT) private readonly transport: WhatsAppTransport) {}

  /** Starts running a session; it links by QR code if its credentials hold no account. */
  async open(sessionId: string, credentials: CredentialStore): Promise<void> {
    if (this.sessions.has(sessionId)) throw new Error(`Session ${sessionId} is already open`);
    const session: Session = {
      credentials,
      state: 'linking',
      generation: 0,
      failures: 0,
      restarted: false,
    };
    this.sessions.set(sessionId, session);
    await this.connect(sessionId, session);
  }

  /** The session's state, or `undefined` when this process does not run it. */
  state(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)?.state;
  }

  /** The session's connection, if it is linked and connected. */
  connection(sessionId: string): TransportConnection {
    const session = this.sessions.get(sessionId);
    if (session?.state !== 'connected' || !session.connection) {
      throw new SessionNotConnectedError(sessionId);
    }
    return session.connection;
  }

  async onApplicationShutdown(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    for (const session of sessions) clearTimeout(session.retry);
    await Promise.all(sessions.map((session) => session.connection?.close()));
  }

  private async connect(sessionId: string, session: Session): Promise<void> {
    const generation = ++session.generation;
    try {
      const connection = await this.transport.connect(
        sessionId,
        session.credentials,
        this.events(sessionId, session, generation),
      );
      if (this.sessions.get(sessionId) !== session || session.generation !== generation) {
        await connection.close();
        return;
      }
      session.connection = connection;
    } catch (error) {
      if (this.sessions.get(sessionId) !== session || session.generation !== generation) return;
      this.logger.warn(
        `Session ${sessionId} could not connect: ${error instanceof Error ? error.name : typeof error}`,
      );
      this.reconnectLater(sessionId, session);
    }
  }

  private events(sessionId: string, session: Session, generation: number): SessionEvents {
    const current = () =>
      this.sessions.get(sessionId) === session && session.generation === generation;
    return {
      qr: () => {
        if (current()) session.state = 'linking';
      },
      open: () => {
        if (!current()) return;
        session.state = 'connected';
        session.failures = 0;
        session.restarted = false;
      },
      close: (reason) => {
        if (!current()) return;
        session.connection = undefined;
        // A new generation, so a late event of the closed connection is ignored.
        session.generation++;
        const action = disconnectAction(reason);
        this.logger.log(`Session ${sessionId} closed: ${reason}`);
        switch (action.kind) {
          case 'reconnect_now':
            if (session.restarted) {
              this.reconnectLater(sessionId, session);
              return;
            }
            session.restarted = true;
            // Not connected until the new connection opens: nothing sends in between.
            if (session.state === 'connected') session.state = 'disconnected';
            void this.connect(sessionId, session);
            return;
          case 'reconnect_later':
            this.reconnectLater(sessionId, session);
            return;
          case 'stop':
            session.state = action.state;
            return;
          case 'release':
            this.sessions.delete(sessionId);
            return;
        }
      },
      message: () => {},
      receipt: () => {},
    };
  }

  private reconnectLater(sessionId: string, session: Session): void {
    session.state = 'disconnected';
    session.retry = setTimeout(
      () => void this.connect(sessionId, session),
      reconnectDelay(++session.failures),
    );
  }
}
