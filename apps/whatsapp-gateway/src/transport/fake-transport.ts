import type {
  CredentialStore,
  DisconnectReason,
  IncomingMessage,
  Receipt,
  SessionEvents,
  TransportConnection,
  WhatsAppTransport,
} from './whatsapp-transport.js';

/** The credential key where the fake keeps a linked session's account. */
const ACCOUNT_KEY = 'fake.account';

/** A message the fake accepted; it went nowhere. */
export interface FakeSentMessage {
  sessionId: string;
  messageId: string;
  to: string;
  text: string;
}

interface Live {
  events: SessionEvents;
  credentials: CredentialStore;
  open: boolean;
}

/**
 * A `WhatsAppTransport` that talks to nobody: no network, no WhatsApp account, no log. It behaves
 * like the real one where the gateway depends on it (ADR 0022): events come after `connect`
 * resolves, a new session shows QR codes, a scan stores the account and closes with
 * `restart_required` before the session opens, a second connection to a session replaces the first
 * with `connection_replaced`, and a closed connection refuses to send. Tests and local runs drive
 * the rest (`scan`, `disconnect`, `receive`, `acknowledge`) and read what was sent from `sent`.
 */
export class FakeWhatsAppTransport implements WhatsAppTransport {
  readonly sent: FakeSentMessage[] = [];
  private readonly live = new Map<string, Live>();
  private codes = 0;
  private messages = 0;

  async connect(
    sessionId: string,
    credentials: CredentialStore,
    events: SessionEvents,
  ): Promise<TransportConnection> {
    const previous = this.live.get(sessionId);
    if (previous) this.drop(sessionId, previous, 'connection_replaced');
    const live: Live = { events, credentials, open: true };
    this.live.set(sessionId, live);
    setTimeout(async () => {
      if (!live.open) return;
      const phone = await credentials.get(ACCOUNT_KEY);
      if (!live.open) return;
      if (phone === null) events.qr(`fake-qr-${++this.codes}`);
      else events.open({ phone });
    }, 0);
    return {
      sendText: async (to, text) => {
        if (!live.open) throw new Error('The connection is closed');
        const messageId = `fake-message-${++this.messages}`;
        this.sent.push({ sessionId, messageId, to, text });
        return { messageId };
      },
      close: async () => {
        live.open = false;
        if (this.live.get(sessionId) === live) this.live.delete(sessionId);
      },
    };
  }

  /** Whether the session has an open connection. */
  isConnected(sessionId: string): boolean {
    return this.live.has(sessionId);
  }

  /** Scans the session's QR code with `phone`'s WhatsApp: links it, then restarts like WhatsApp. */
  async scan(sessionId: string, phone: string): Promise<void> {
    const live = this.connected(sessionId);
    await live.credentials.set({ [ACCOUNT_KEY]: phone });
    this.drop(sessionId, live, 'restart_required');
  }

  /** Closes the session's connection from WhatsApp's side, for `reason`. */
  disconnect(sessionId: string, reason: DisconnectReason): void {
    this.drop(sessionId, this.connected(sessionId), reason);
  }

  /** Delivers an incoming message to the session. */
  receive(sessionId: string, message: IncomingMessage): void {
    this.connected(sessionId).events.message(message);
  }

  /** Delivers a receipt for a message the session sent. */
  acknowledge(sessionId: string, receipt: Receipt): void {
    this.connected(sessionId).events.receipt(receipt);
  }

  private connected(sessionId: string): Live {
    const live = this.live.get(sessionId);
    if (!live) throw new Error(`Session ${sessionId} has no open connection`);
    return live;
  }

  private drop(sessionId: string, live: Live, reason: DisconnectReason): void {
    live.open = false;
    this.live.delete(sessionId);
    live.events.close(reason);
  }
}
