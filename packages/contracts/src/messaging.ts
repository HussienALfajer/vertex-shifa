import { z } from 'zod';
import { normalizeArabicName } from './arabic-names.js';
import { DomainError } from './errors.js';

/** A moment as an ISO 8601 UTC string, as the API sends it. */
const instantSchema = z.iso.datetime();

// WhatsApp messaging (spec S03, ADR 0012, ADR 0022, ADR 0026): Vertex's platform numbers, the send
// queue and the rules the API and the gateway share. Recipients are never in clear here: callers
// pass counts and flags, never a phone.

// Sessions: a linked WhatsApp number run by the gateway.

export const whatsappSessionStateSchema = z
  .enum(['linking', 'connected', 'disconnected', 'needs_relink', 'banned', 'unlinked'])
  .meta({ id: 'WhatsAppSessionState' });

export type WhatsAppSessionState = z.infer<typeof whatsappSessionStateSchema>;

/** Who moves a session: a Vertex admin from the console, or the gateway from the transport. */
export type WhatsAppSessionChanger = 'admin' | 'gateway';

/** Every allowed change of a session's state and who makes it (spec S03, "Session states"). */
export const whatsappSessionTransitions = {
  linking: { connected: 'gateway', needs_relink: 'gateway', unlinked: 'admin' },
  connected: {
    disconnected: 'gateway',
    needs_relink: 'gateway',
    banned: 'gateway',
    unlinked: 'admin',
  },
  disconnected: {
    connected: 'gateway',
    needs_relink: 'gateway',
    banned: 'gateway',
    linking: 'admin',
    unlinked: 'admin',
  },
  needs_relink: { linking: 'admin', unlinked: 'admin' },
  banned: { linking: 'admin', unlinked: 'admin' },
  unlinked: {},
} as const satisfies Record<
  WhatsAppSessionState,
  Partial<Record<WhatsAppSessionState, WhatsAppSessionChanger>>
>;

export function canChangeWhatsAppSessionState(
  from: WhatsAppSessionState,
  to: WhatsAppSessionState,
  by: WhatsAppSessionChanger,
): boolean {
  const allowed: Partial<Record<WhatsAppSessionState, WhatsAppSessionChanger>> =
    whatsappSessionTransitions[from];
  return allowed[to] === by;
}

export function assertWhatsAppSessionStateChange(
  from: WhatsAppSessionState,
  to: WhatsAppSessionState,
  by: WhatsAppSessionChanger,
): void {
  if (!canChangeWhatsAppSessionState(from, to, by)) {
    throw new DomainError(
      'INVALID_STATUS_TRANSITION',
      `WhatsApp session state ${from} cannot become ${to}`,
    );
  }
}

/** Pause is a flag on any session not unlinked, not a state; sending stops while it is set. */
export const whatsappPauseReasonSchema = z
  .enum(['manual', 'send_failures'])
  .meta({ id: 'WhatsAppPauseReason' });

export type WhatsAppPauseReason = z.infer<typeof whatsappPauseReasonSchema>;

export function assertWhatsAppSessionPause(
  session: { state: WhatsAppSessionState; pausedAt: unknown },
  pause: boolean,
): void {
  if (session.state === 'unlinked' || (session.pausedAt !== null) === pause) {
    throw new DomainError(
      'INVALID_STATUS_TRANSITION',
      `WhatsApp session cannot be ${pause ? 'paused' : 'resumed'} now`,
    );
  }
}

/**
 * Healthy (rule 2): connected, not paused, its lease unexpired. Only healthy numbers send.
 */
export function isWhatsAppSessionHealthy(
  session: { state: WhatsAppSessionState; pausedAt: unknown; leaseExpiresAt: Date | null },
  now: Date,
): boolean {
  return (
    session.state === 'connected' &&
    session.pausedAt === null &&
    session.leaseExpiresAt !== null &&
    session.leaseExpiresAt > now
  );
}

export const whatsappSessionEventTypeSchema = z
  .enum([
    'created',
    'linked',
    'connected',
    'disconnected',
    'needs_relink',
    'banned',
    'link_timeout',
    'duplicate_number',
    'paused',
    'resumed',
    'relink_started',
    'unlinked',
    'alert_sent',
  ])
  .meta({ id: 'WhatsAppSessionEventType' });

export type WhatsAppSessionEventType = z.infer<typeof whatsappSessionEventTypeSchema>;

// Messages: the send queue (`whatsapp_messages`).

/** Message kinds, in claim priority order (rule 14). */
export const whatsappMessageKinds = [
  'otp',
  'alert',
  'invitation',
  'opt_reply',
  'auto_reply',
] as const;

export const whatsappMessageKindSchema = z.enum(whatsappMessageKinds);

export type WhatsAppMessageKind = z.infer<typeof whatsappMessageKindSchema>;

export const whatsappMessageStatusSchema = z.enum([
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed',
  'expired',
]);

export type WhatsAppMessageStatus = z.infer<typeof whatsappMessageStatusSchema>;

export const whatsappMessageFailureReasonSchema = z.enum([
  'transport_error',
  'no_number',
  'opted_out',
  'deadline',
]);

export type WhatsAppMessageFailureReason = z.infer<typeof whatsappMessageFailureReasonSchema>;

const finalMessageStatuses: readonly WhatsAppMessageStatus[] = ['failed', 'expired'];
const forwardOrder: readonly WhatsAppMessageStatus[] = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
];

/**
 * Whether a message may move from `current` to `next`: only forward along
 * `queued → sending → sent → delivered → read`, or to `failed` or `expired` before it is sent.
 * Late and repeated receipts are ignored (ADR 0022). `sending → queued` is the retry after a
 * transport error.
 */
export function canAdvanceWhatsAppMessage(
  current: WhatsAppMessageStatus,
  next: WhatsAppMessageStatus,
): boolean {
  if (finalMessageStatuses.includes(current)) return false;
  if (current === 'sending' && next === 'queued') return true;
  if (finalMessageStatuses.includes(next)) return current === 'queued' || current === 'sending';
  return forwardOrder.indexOf(next) > forwardOrder.indexOf(current);
}

/** Seconds a message may wait in the queue before it expires (spec S03, `deadline_at`). */
export const whatsappMessageDeadlineSeconds = {
  otp: 60,
  alert: 3_600,
  invitation: 86_400,
  opt_reply: 3_600,
  auto_reply: 3_600,
} as const satisfies Record<WhatsAppMessageKind, number>;

/**
 * The gateway's timings and starting limits (ADR 0022's values, rules 1–30). Ban thresholds are
 * measured on the platform numbers before any of these is raised.
 */
export const whatsappPolicy = {
  /** Rule 7: a random gap between two sends from one number. */
  gapSeconds: { min: 6, max: 12 },
  /** Rule 8: sends per number in the last 60 minutes. */
  maxPerHour: 60,
  /** Rule 8: sends per number in the last 24 hours, by warm-up day (from `linked_at`). */
  dailyCaps: [
    { fromDay: 1, cap: 30 },
    { fromDay: 4, cap: 75 },
    { fromDay: 8, cap: 150 },
    { fromDay: 22, cap: 300 },
  ],
  /** Rule 9: first contacts at most this share of the 24-hour cap. */
  firstContactShare: 0.5,
  /** Rule 10: per recipient across all platform numbers, every kind but `otp`. */
  perRecipient: { perMinute: 1, perHour: 5, perDay: 10 },
  /** Rule 15: waits between attempts after a transport error. */
  retrySeconds: [10, 60, 300],
  /** Rule 6: failed sends in a row that pause a number. */
  maxConsecutiveFailures: 3,
  /** Rule 1: the lease, renewed every 10 s for 30 s. */
  lease: { renewSeconds: 10, ttlSeconds: 30 },
  /** Rule 4: an unscanned link closes after 3 minutes. */
  linkTimeoutSeconds: 180,
  /** Rule 14: the sender's poll besides `NOTIFY`. */
  claimPollSeconds: 2,
  /** Rule 27: one auto-reply per person and number in this window. */
  autoReplyHours: 24,
  /** Rule 28: an alert per session and event type at most this often. */
  alertThrottleMinutes: 30,
  /** Rule 28: a disconnection becomes an alert after this long. */
  disconnectAlertMinutes: 5,
  /** Rule 30: bodies and recipients are kept sealed this long for retry requests. */
  contentRetentionHours: 1,
  /** Rule 30: queue rows are deleted after this many days. */
  messageRetentionDays: 30,
  /** Unarchived sessions at most (`WHATSAPP_SESSION_LIMIT`). */
  maxSessions: 10,
} as const;

const DAY_MS = 86_400_000;

/** The warm-up day of a number, 1 on the day it was linked; null before its first link. */
export function whatsappWarmUpDay(linkedAt: Date | null, now: Date): number | null {
  if (!linkedAt) return null;
  return Math.max(1, Math.floor((now.getTime() - linkedAt.getTime()) / DAY_MS) + 1);
}

/** The 24-hour cap of a number on its warm-up day (rule 8); 0 before it is linked. */
export function whatsappDailyCap(warmUpDay: number | null): number {
  if (warmUpDay === null) return 0;
  let cap = 0;
  for (const step of whatsappPolicy.dailyCaps) if (warmUpDay >= step.fromDay) cap = step.cap;
  return cap;
}

/** The first-contact cap of a number: half its 24-hour cap, rounded down (rule 9). */
export function whatsappFirstContactCap(dailyCap: number): number {
  return Math.floor(dailyCap * whatsappPolicy.firstContactShare);
}

/** A random gap before a number's next send (rule 7), in whole seconds. */
export function whatsappSendGapSeconds(random: () => number = Math.random): number {
  const { min, max } = whatsappPolicy.gapSeconds;
  return min + Math.floor(random() * (max - min + 1));
}

/** One number's sends over the rolling windows, computed from `whatsapp_messages.sent_at`. */
export interface WhatsAppNumberStats {
  linkedAt: Date | null;
  lastSentAt: Date | null;
  /** The gap drawn after the last send (rule 7); the longest when unknown, after a restart. */
  gapSeconds: number;
  sentLastHour: number;
  sentLast24h: number;
  firstContactsLast24h: number;
}

/** One recipient as seen from one number, with their sends across every platform number. */
export interface WhatsAppRecipientStats {
  /** This number has sent to them before (`whatsapp_known_recipients`). */
  knownToNumber: boolean;
  sentLastMinute: number;
  sentLastHour: number;
  sentLastDay: number;
}

export type WhatsAppSendRefusal = 'hourly_cap' | 'daily_cap' | 'first_contact_cap' | 'recipient';

export type WhatsAppSendBudget =
  | { allowed: true; firstContact: boolean; notBefore: Date; dailyLeft: number }
  | { allowed: false; reason: WhatsAppSendRefusal };

/**
 * Whether a number may send a message of `kind` to a recipient (rules 7–11), from durable counts,
 * never in-memory counters. The gap of rule 7 only delays a send (`notBefore`); the caps refuse it.
 * OTPs skip the per-recipient limits (S02 rule 13 applies instead) but count toward the number's.
 */
export function sendBudget(
  stats: WhatsAppNumberStats,
  recipient: WhatsAppRecipientStats,
  kind: WhatsAppMessageKind,
  now: Date,
): WhatsAppSendBudget {
  const dailyCap = whatsappDailyCap(whatsappWarmUpDay(stats.linkedAt, now));
  if (stats.sentLastHour >= whatsappPolicy.maxPerHour) {
    return { allowed: false, reason: 'hourly_cap' };
  }
  if (stats.sentLast24h >= dailyCap) return { allowed: false, reason: 'daily_cap' };
  const firstContact = !recipient.knownToNumber;
  if (firstContact && stats.firstContactsLast24h >= whatsappFirstContactCap(dailyCap)) {
    return { allowed: false, reason: 'first_contact_cap' };
  }
  if (kind !== 'otp') {
    const limit = whatsappPolicy.perRecipient;
    if (
      recipient.sentLastMinute >= limit.perMinute ||
      recipient.sentLastHour >= limit.perHour ||
      recipient.sentLastDay >= limit.perDay
    ) {
      return { allowed: false, reason: 'recipient' };
    }
  }
  const notBefore = stats.lastSentAt
    ? new Date(Math.max(now.getTime(), stats.lastSentAt.getTime() + stats.gapSeconds * 1000))
    : now;
  return { allowed: true, firstContact, notBefore, dailyLeft: dailyCap - stats.sentLast24h };
}

/** A healthy platform number that could take a message, with its stats for this recipient. */
export interface WhatsAppNumberCandidate {
  id: string;
  stats: WhatsAppNumberStats;
  recipient: WhatsAppRecipientStats;
}

/**
 * Which number sends a message (rule 12): the number that already knows the recipient while it is
 * within its limits, otherwise the one with the most 24-hour budget left (a first contact for it).
 * The caller passes healthy numbers only, and for `opt_reply` and `auto_reply` only the number
 * that received the message (rule 13). Undefined when none may send.
 */
export function chooseWhatsAppNumber(
  candidates: readonly WhatsAppNumberCandidate[],
  kind: WhatsAppMessageKind,
  now: Date,
): { id: string; budget: Extract<WhatsAppSendBudget, { allowed: true }> } | undefined {
  let best: { id: string; budget: Extract<WhatsAppSendBudget, { allowed: true }> } | undefined;
  for (const candidate of candidates) {
    const budget = sendBudget(candidate.stats, candidate.recipient, kind, now);
    if (!budget.allowed) continue;
    if (!budget.firstContact) return { id: candidate.id, budget };
    if (!best || budget.dailyLeft > best.budget.dailyLeft) best = { id: candidate.id, budget };
  }
  return best;
}

/**
 * The backoff before the next attempt after `attempts` failed sends (rule 15): 10 s, 1 min, then
 * every 5 min. Retries stop only at the message's deadline.
 */
export function whatsappRetryDelaySeconds(attempts: number): number {
  const steps = whatsappPolicy.retrySeconds;
  return steps[Math.min(Math.max(attempts, 1), steps.length) - 1] as number;
}

// Incoming keywords (rule 25): opt-out and opt-in on platform numbers.

const keywords = {
  opt_out: ['إيقاف', 'STOP'],
  opt_in: ['تشغيل', 'START'],
} as const;

export type WhatsAppKeyword = keyof typeof keywords;

const keywordKeys = new Map<string, WhatsAppKeyword>(
  (Object.entries(keywords) as [WhatsAppKeyword, readonly string[]][]).flatMap(([keyword, words]) =>
    words.map((word) => [normalizeArabicName(word), keyword] as const),
  ),
);

/**
 * The keyword a message is, after trimming, Arabic normalization and case folding ("ايقاف",
 * "إيقاف ", "stop" all opt out); undefined for any other text.
 */
export function matchWhatsAppKeyword(text: string): WhatsAppKeyword | undefined {
  return keywordKeys.get(normalizeArabicName(text));
}

// API shapes.

/** The delivery of a device sign-in OTP; `unknown` for every other challenge id (rule 19). */
export const otpDeliveryStatusSchema = z
  .enum(['queued', 'sent', 'delivered', 'failed', 'unknown'])
  .meta({ id: 'OtpDeliveryStatus' });

export type OtpDeliveryStatus = z.infer<typeof otpDeliveryStatusSchema>;

export const otpDeliverySchema = z
  .object({ status: otpDeliveryStatusSchema })
  .meta({ id: 'OtpDelivery' });

export type OtpDelivery = z.infer<typeof otpDeliverySchema>;

export const whatsappSessionLabelSchema = z.string().trim().min(2).max(40);

export const createPlatformWhatsAppSessionSchema = z
  .object({ label: whatsappSessionLabelSchema })
  .meta({ id: 'CreatePlatformWhatsAppSession' });

export type CreatePlatformWhatsAppSession = z.infer<typeof createPlatformWhatsAppSessionSchema>;

export const platformWhatsAppSessionSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    /** Vertex's own number, set at the first link; shown to admins and support. */
    phone: z.string().nullable(),
    state: whatsappSessionStateSchema,
    pausedAt: instantSchema.nullable(),
    pauseReason: whatsappPauseReasonSchema.nullable(),
    linkedAt: instantSchema.nullable(),
    /** 1 on the day of the first link; null before it. */
    warmUpDay: z.int().min(1).nullable(),
    sentLast24h: z.int().min(0),
    dailyCap: z.int().min(0),
    firstContactsLast24h: z.int().min(0),
    firstContactCap: z.int().min(0),
    sentLastHour: z.int().min(0),
    hourlyCap: z.int().min(0),
    lastConnectedAt: instantSchema.nullable(),
    /** A gateway instance holds the session's lease now. */
    leaseHeld: z.boolean(),
    healthy: z.boolean(),
    createdAt: instantSchema,
  })
  .meta({ id: 'PlatformWhatsAppSession' });

export type PlatformWhatsAppSession = z.infer<typeof platformWhatsAppSessionSchema>;

export const platformWhatsAppSessionListSchema = z
  .array(platformWhatsAppSessionSchema)
  .meta({ id: 'PlatformWhatsAppSessionList' });

export const whatsappSessionEventSchema = z
  .object({
    id: z.uuid(),
    type: whatsappSessionEventTypeSchema,
    /** A disconnect or pause reason code; never a library's message. */
    reason: z.string().nullable(),
    /** The admin who acted; null for the gateway. */
    platformUserName: z.string().nullable(),
    createdAt: instantSchema,
  })
  .meta({ id: 'WhatsAppSessionEvent' });

export type WhatsAppSessionEvent = z.infer<typeof whatsappSessionEventSchema>;

export const platformWhatsAppSessionDetailSchema = z
  .object({
    session: platformWhatsAppSessionSchema,
    /** The last 50, newest first. */
    events: z.array(whatsappSessionEventSchema),
  })
  .meta({ id: 'PlatformWhatsAppSessionDetail' });

export type PlatformWhatsAppSessionDetail = z.infer<typeof platformWhatsAppSessionDetailSchema>;

export const whatsappSessionQrSchema = z
  .object({
    state: whatsappSessionStateSchema,
    /** The QR's text to render, while `linking` and unexpired. */
    qr: z.string().nullable(),
    expiresAt: instantSchema.nullable(),
    linkDeadlineAt: instantSchema.nullable(),
  })
  .meta({ id: 'WhatsAppSessionQr' });

export type WhatsAppSessionQr = z.infer<typeof whatsappSessionQrSchema>;

export const messagingHealthSchema = z
  .object({
    healthy: z.int().min(0),
    total: z.int().min(0),
    /** At least one healthy number has budget for an OTP. */
    otpAvailable: z.boolean(),
  })
  .meta({ id: 'MessagingHealth' });

export type MessagingHealth = z.infer<typeof messagingHealthSchema>;
