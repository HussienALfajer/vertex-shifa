import { eq, isNull, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { archivedAt, createdAt, id, idIsUuidV7, timestamptz, updatedAt } from './columns.js';
import { otpChallenges, platformUsers } from './identity.js';

// WhatsApp messaging (spec S03, ADR 0012, ADR 0022, ADR 0026). Platform scope: Vertex's own numbers
// and keyed hashes of recipients, never tenant data. Recipients' phones are stored only sealed
// (AES-256-GCM, `MESSAGING_ENCRYPTION_KEY`) or as keyed hashes (`MESSAGING_HASH_KEY`), message
// bodies and QR codes only sealed. Rate limits are counted from `whatsapp_messages.sent_at`.

/** The gateway's library-neutral `DisconnectReason` codes (ADR 0022). */
const DISCONNECT_REASONS =
  "'restart_required', 'logged_out', 'forbidden', 'connection_replaced', 'connection_lost'";

/**
 * A WhatsApp number the gateway runs (`platform` in S03; S18 adds clinic sessions). The gateway
 * instance holding the lease is the only one connected to it. Unlinked sessions are archived.
 */
export const whatsappSessions = pgTable(
  'whatsapp_sessions',
  {
    id: id(),
    kind: text().notNull(),
    label: text().notNull(),
    /** E.164, Vertex's own number, set at the first link. */
    phone: text(),
    state: text().notNull(),
    pausedAt: timestamptz(),
    pauseReason: text(),
    /** The first `open` after a QR scan; the warm-up age counts from it. */
    linkedAt: timestamptz(),
    qrSealed: text(),
    qrExpiresAt: timestamptz(),
    linkDeadlineAt: timestamptz(),
    lastConnectedAt: timestamptz(),
    /** The library-neutral disconnect reason code. */
    lastDisconnectReason: text(),
    consecutiveFailures: smallint().notNull().default(0),
    leaseHolder: uuid(),
    leaseExpiresAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('whatsapp_sessions', t.id),
    check('whatsapp_sessions_kind', sql`${t.kind} in ('platform')`),
    check('whatsapp_sessions_label', sql`char_length(${t.label}) between 2 and 40`),
    check(
      'whatsapp_sessions_state',
      sql`${t.state} in ('linking', 'connected', 'disconnected', 'needs_relink', 'banned', 'unlinked')`,
    ),
    check(
      'whatsapp_sessions_pause',
      sql`(${t.pausedAt} is null) = (${t.pauseReason} is null) and (${t.pauseReason} is null or ${t.pauseReason} in ('manual', 'send_failures'))`,
    ),
    check(
      'whatsapp_sessions_lease',
      sql`(${t.leaseHolder} is null) = (${t.leaseExpiresAt} is null)`,
    ),
    check('whatsapp_sessions_consecutive_failures', sql`${t.consecutiveFailures} >= 0`),
    // Reason codes only, never a library's message (which can carry a WhatsApp address).
    check(
      'whatsapp_sessions_last_disconnect_reason',
      sql`${t.lastDisconnectReason} is null or ${t.lastDisconnectReason} in (${sql.raw(DISCONNECT_REASONS)})`,
    ),
    check(
      'whatsapp_sessions_unlinked_archived',
      sql`(${t.state} = 'unlinked') = (${t.archivedAt} is not null)`,
    ),
    uniqueIndex('whatsapp_sessions_label_idx').on(t.label).where(isNull(t.archivedAt)),
    uniqueIndex('whatsapp_sessions_phone_idx').on(t.phone).where(isNull(t.archivedAt)),
    index('whatsapp_sessions_state_idx').on(t.state).where(isNull(t.archivedAt)),
  ],
);

/**
 * Baileys' credentials and key store of a session as opaque sealed values (context
 * `whatsapp-credentials:<session id>`), deleted on re-link and unlink. Never exported or read by
 * people. The store's keys name WhatsApp addresses (`session-<phone>.<device>`, LID mappings), so
 * only their keyed hash is stored, bound to the session: never a key in clear.
 */
export const whatsappSessionCredentials = pgTable(
  'whatsapp_session_credentials',
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => whatsappSessions.id),
    keyHash: text().notNull(),
    valueSealed: text().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    idIsUuidV7('whatsapp_session_credentials', t.id),
    unique('whatsapp_session_credentials_session_key_hash_unique').on(t.sessionId, t.keyHash),
  ],
);

/** What happened to a session, by the gateway or an admin (`platform_user_id`). Append-only. */
export const whatsappSessionEvents = pgTable(
  'whatsapp_session_events',
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => whatsappSessions.id),
    type: text().notNull(),
    /** A reason code, never a library's message. */
    reason: text(),
    /** The admin who acted; null for the gateway. */
    platformUserId: uuid().references(() => platformUsers.id),
    createdAt: createdAt(),
  },
  (t) => [
    idIsUuidV7('whatsapp_session_events', t.id),
    check(
      'whatsapp_session_events_type',
      sql`${t.type} in ('created', 'linked', 'connected', 'disconnected', 'needs_relink', 'banned', 'link_timeout', 'duplicate_number', 'paused', 'resumed', 'relink_started', 'unlinked', 'alert_sent')`,
    ),
    // Disconnect and pause reason codes only, never a library's message.
    check(
      'whatsapp_session_events_reason',
      sql`${t.reason} is null or ${t.reason} in (${sql.raw(DISCONNECT_REASONS)}, 'manual', 'send_failures')`,
    ),
    index('whatsapp_session_events_session_created_idx').on(t.sessionId, t.createdAt),
    index('whatsapp_session_events_platform_user_idx').on(t.platformUserId),
  ],
);

/**
 * The send queue, claimed by the gateway in priority order. Sealed recipient and body are cleared
 * an hour after the message finishes (ADR 0022); rows are deleted after 30 days. Every transaction
 * that queues a message also runs `NOTIFY whatsapp_messages`.
 */
export const whatsappMessages = pgTable(
  'whatsapp_messages',
  {
    id: id(),
    kind: text().notNull(),
    pool: text().notNull(),
    /** The number that claimed it; for replies, the number that received the message. */
    sessionId: uuid().references(() => whatsappSessions.id),
    recipientHash: text().notNull(),
    recipientSealed: text(),
    bodySealed: text(),
    status: text().notNull(),
    failureReason: text(),
    attempts: smallint().notNull().default(0),
    /** Set when sent: the number had never messaged this recipient. */
    firstContact: boolean(),
    deadlineAt: timestamptz().notNull(),
    nextAttemptAt: timestamptz().notNull(),
    transportMessageId: text(),
    otpChallengeId: uuid().references(() => otpChallenges.id),
    /** The outbox event that made it: one message per event. */
    sourceEventId: uuid(),
    /** For `invitation`: the tenant and membership whose status follows this message. */
    subjectTenantId: uuid(),
    subjectId: uuid(),
    sentAt: timestamptz(),
    deliveredAt: timestamptz(),
    readAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    idIsUuidV7('whatsapp_messages', t.id),
    check(
      'whatsapp_messages_kind',
      sql`${t.kind} in ('otp', 'alert', 'invitation', 'opt_reply', 'auto_reply')`,
    ),
    check('whatsapp_messages_pool', sql`${t.pool} in ('platform')`),
    check(
      'whatsapp_messages_status',
      sql`${t.status} in ('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'expired')`,
    ),
    check(
      'whatsapp_messages_failure_reason',
      sql`(${t.status} in ('failed', 'expired')) = (${t.failureReason} is not null) and (${t.failureReason} is null or ${t.failureReason} in ('transport_error', 'no_number', 'opted_out', 'deadline'))`,
    ),
    check('whatsapp_messages_attempts', sql`${t.attempts} >= 0`),
    check(
      'whatsapp_messages_reply_session',
      sql`${t.kind} not in ('opt_reply', 'auto_reply') or ${t.sessionId} is not null`,
    ),
    check(
      'whatsapp_messages_otp_challenge',
      sql`${t.kind} <> 'otp' or ${t.otpChallengeId} is not null`,
    ),
    check(
      'whatsapp_messages_invitation_subject',
      sql`${t.kind} <> 'invitation' or (${t.subjectTenantId} is not null and ${t.subjectId} is not null)`,
    ),
    // The claim: queued messages by priority and due time.
    index('whatsapp_messages_claim_idx')
      .on(t.status, t.kind, t.nextAttemptAt)
      .where(eq(t.status, sql`'queued'`)),
    // A number's rolling rate windows (rules 7–11).
    index('whatsapp_messages_session_sent_idx').on(t.sessionId, t.sentAt),
    // A recipient's limits across numbers (rule 10).
    index('whatsapp_messages_recipient_sent_idx').on(t.recipientHash, t.sentAt),
    // The latest message of an invitation (rule 22).
    index('whatsapp_messages_subject_idx').on(t.subjectId, t.createdAt),
    unique('whatsapp_messages_session_transport_id_unique').on(t.sessionId, t.transportMessageId),
    unique('whatsapp_messages_otp_challenge_unique').on(t.otpChallengeId),
    unique('whatsapp_messages_source_event_unique').on(t.sourceEventId),
  ],
);

/**
 * Recipients a number has sent to: its known recipients (rule 12) and the only senders whose
 * incoming messages it processes (rule 24). Deleted with the session's credentials on re-link to
 * another phone and on unlink.
 */
export const whatsappKnownRecipients = pgTable(
  'whatsapp_known_recipients',
  {
    id: id(),
    sessionId: uuid()
      .notNull()
      .references(() => whatsappSessions.id),
    recipientHash: text().notNull(),
    firstSentAt: timestamptz().notNull(),
    lastSentAt: timestamptz().notNull(),
    lastAutoReplyAt: timestamptz(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    idIsUuidV7('whatsapp_known_recipients', t.id),
    unique('whatsapp_known_recipients_session_recipient_unique').on(t.sessionId, t.recipientHash),
  ],
);

/**
 * A person's choice to stop or restart Vertex's messages they did not request (rules 25–26), per
 * scope (`platform`; S18 adds clinic sessions). Ordered by the incoming message's time.
 */
export const whatsappOptOuts = pgTable(
  'whatsapp_opt_outs',
  {
    id: id(),
    scope: text().notNull(),
    recipientHash: text().notNull(),
    optedOutAt: timestamptz(),
    optedInAt: timestamptz(),
    lastKeywordAt: timestamptz().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: archivedAt(),
  },
  (t) => [
    idIsUuidV7('whatsapp_opt_outs', t.id),
    check('whatsapp_opt_outs_scope', sql`${t.scope} in ('platform')`),
    unique('whatsapp_opt_outs_scope_recipient_unique').on(t.scope, t.recipientHash),
  ],
);
