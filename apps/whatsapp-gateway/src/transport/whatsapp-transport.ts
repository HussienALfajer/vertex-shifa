/**
 * The WhatsApp transport (ADR 0012): the only part of the gateway that knows the library behind
 * WhatsApp. Sessions and sending use this interface and the `WHATSAPP_TRANSPORT` token, never a
 * concrete transport, so Baileys (ADR 0022) can be replaced by an official transport if Meta ever
 * allows Syria. Phone numbers are E.164 (`+9639…`); message text is transactional and never medical,
 * and no transport logs a message body or a phone number (ADR 0012, ADR 0016).
 *
 * S03 extends it where Baileys needs more: a caller-supplied lookup of a sent message's content,
 * kept encrypted for one hour, to answer a recipient device's retry request (ADR 0022), and, if
 * Baileys' key store needs them, atomic multi-key credential writes.
 */
export interface WhatsAppTransport {
  /**
   * Opens one session's connection. A session with stored credentials connects and emits `open`; a
   * new one emits `qr` until the code is scanned. Exactly one live connection per session: the
   * caller holds the session's lease (ADR 0022) before connecting.
   */
  connect(
    sessionId: string,
    credentials: CredentialStore,
    events: SessionEvents,
  ): Promise<TransportConnection>;
}

/** One open connection of a session. */
export interface TransportConnection {
  /** Sends a text message; resolves once the transport has accepted it, with its message id. */
  sendText(to: string, text: string): Promise<{ messageId: string }>;
  /** Closes the connection without unlinking the session; emits no `close` event. */
  close(): Promise<void>;
}

/**
 * Where a transport keeps a session's credentials and protocol state, as opaque values by key. The
 * caller supplies it: in memory for the fake transport, encrypted in the database from S03
 * (ADR 0012), and deleted when the session is unlinked.
 */
export interface CredentialStore {
  get(key: string): Promise<string | null>;
  /** Writes each entry; `null` removes the key. */
  set(entries: Record<string, string | null>): Promise<void>;
}

/** What a connection reports. Handlers return nothing and must not throw. */
export interface SessionEvents {
  /** A code to show for linking; renewed until it is scanned. */
  qr(code: string): void;
  /** The session is linked and connected as `account` (connection open with the account set). */
  open(account: { phone: string }): void;
  /** The connection closed; the session decides what to do from the reason (ADR 0022). */
  close(reason: DisconnectReason): void;
  /** An incoming 1:1 text message. */
  message(message: IncomingMessage): void;
  /** A receipt for a message this session sent; receipts may repeat or arrive out of order. */
  receipt(receipt: Receipt): void;
}

/**
 * Why a connection closed, independent of the library (ADR 0022 maps Baileys' codes):
 * `restart_required` (`515`, normal right after a QR link), `logged_out` (`401`), `forbidden`
 * (`403`), `connection_replaced` (`440`, another process holds the session), `connection_lost`
 * (network or server).
 */
export type DisconnectReason =
  | 'restart_required'
  | 'logged_out'
  | 'forbidden'
  | 'connection_replaced'
  | 'connection_lost';

/**
 * An incoming 1:1 text message. Groups, broadcasts and newsletters never reach the gateway. The
 * transport resolves the sender's phone number before reporting it (LID addressing, ADR 0022);
 * `from` is `null` when it cannot. Messages received while the gateway was down arrive on reconnect
 * like live ones, and the same message may be reported twice: the receiver deduplicates by `id`.
 */
export interface IncomingMessage {
  id: string;
  from: string | null;
  text: string;
  sentAt: Date;
}

/** A receipt for a sent message: `sent` is the server's acknowledgement. */
export interface Receipt {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  at: Date;
}

/** Injection token of the process's `WhatsAppTransport`. */
export const WHATSAPP_TRANSPORT = Symbol('WhatsAppTransport');
