import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.js';
import {
  assertWhatsAppSessionPause,
  assertWhatsAppSessionStateChange,
  canAdvanceWhatsAppMessage,
  canChangeWhatsAppSessionState,
  chooseWhatsAppNumber,
  createPlatformWhatsAppSessionSchema,
  isWhatsAppSessionHealthy,
  matchWhatsAppKeyword,
  sendBudget,
  type WhatsAppNumberStats,
  type WhatsAppRecipientStats,
  whatsappDailyCap,
  whatsappFirstContactCap,
  whatsappMessageKinds,
  whatsappRetryDelaySeconds,
  whatsappSendGapSeconds,
  whatsappWarmUpDay,
} from './messaging.js';

const now = new Date('2026-10-20T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const number = (overrides: Partial<WhatsAppNumberStats> = {}): WhatsAppNumberStats => ({
  linkedAt: daysAgo(30),
  lastSentAt: null,
  gapSeconds: 12,
  sentLastHour: 0,
  sentLast24h: 0,
  firstContactsLast24h: 0,
  ...overrides,
});

const recipient = (overrides: Partial<WhatsAppRecipientStats> = {}): WhatsAppRecipientStats => ({
  knownToNumber: true,
  sentLastMinute: 0,
  sentLastHour: 0,
  sentLastDay: 0,
  ...overrides,
});

describe('session states', () => {
  it('lets the gateway connect, drop and ban, and admins re-link and unlink', () => {
    expect(canChangeWhatsAppSessionState('linking', 'connected', 'gateway')).toBe(true);
    expect(canChangeWhatsAppSessionState('connected', 'banned', 'gateway')).toBe(true);
    expect(canChangeWhatsAppSessionState('disconnected', 'connected', 'gateway')).toBe(true);
    expect(canChangeWhatsAppSessionState('banned', 'linking', 'admin')).toBe(true);
    expect(canChangeWhatsAppSessionState('needs_relink', 'linking', 'admin')).toBe(true);
    for (const state of [
      'linking',
      'connected',
      'disconnected',
      'needs_relink',
      'banned',
    ] as const) {
      expect(canChangeWhatsAppSessionState(state, 'unlinked', 'admin'), state).toBe(true);
    }
  });

  it('refuses the other changes and the wrong changer', () => {
    expect(canChangeWhatsAppSessionState('connected', 'linking', 'admin')).toBe(false);
    expect(canChangeWhatsAppSessionState('banned', 'connected', 'gateway')).toBe(false);
    expect(canChangeWhatsAppSessionState('linking', 'connected', 'admin')).toBe(false);
    expect(canChangeWhatsAppSessionState('connected', 'unlinked', 'gateway')).toBe(false);
    expect(canChangeWhatsAppSessionState('unlinked', 'linking', 'admin')).toBe(false);
    expect(() => assertWhatsAppSessionStateChange('unlinked', 'linking', 'admin')).toThrow(
      DomainError,
    );
  });

  it('pauses a session not paused and resumes a paused one, never an unlinked one', () => {
    expect(() =>
      assertWhatsAppSessionPause({ state: 'connected', pausedAt: null }, true),
    ).not.toThrow();
    expect(() =>
      assertWhatsAppSessionPause({ state: 'banned', pausedAt: now }, false),
    ).not.toThrow();
    expect(() => assertWhatsAppSessionPause({ state: 'connected', pausedAt: now }, true)).toThrow(
      'cannot be paused',
    );
    expect(() => assertWhatsAppSessionPause({ state: 'connected', pausedAt: null }, false)).toThrow(
      'cannot be resumed',
    );
    expect(() => assertWhatsAppSessionPause({ state: 'unlinked', pausedAt: null }, true)).toThrow(
      DomainError,
    );
  });

  it('calls healthy only a connected, unpaused session with a live lease', () => {
    const lease = new Date(now.getTime() + 10_000);
    const healthy = { state: 'connected' as const, pausedAt: null, leaseExpiresAt: lease };
    expect(isWhatsAppSessionHealthy(healthy, now)).toBe(true);
    expect(isWhatsAppSessionHealthy({ ...healthy, pausedAt: now }, now)).toBe(false);
    expect(isWhatsAppSessionHealthy({ ...healthy, state: 'disconnected' }, now)).toBe(false);
    expect(isWhatsAppSessionHealthy({ ...healthy, leaseExpiresAt: now }, now)).toBe(false);
    expect(isWhatsAppSessionHealthy({ ...healthy, leaseExpiresAt: null }, now)).toBe(false);
  });
});

describe('message states', () => {
  it('moves forward only and ignores late or repeated receipts', () => {
    expect(canAdvanceWhatsAppMessage('queued', 'sending')).toBe(true);
    expect(canAdvanceWhatsAppMessage('sending', 'sent')).toBe(true);
    expect(canAdvanceWhatsAppMessage('sent', 'read')).toBe(true);
    expect(canAdvanceWhatsAppMessage('read', 'delivered')).toBe(false);
    expect(canAdvanceWhatsAppMessage('delivered', 'delivered')).toBe(false);
    expect(canAdvanceWhatsAppMessage('delivered', 'sent')).toBe(false);
  });

  it('fails or expires only before it is sent, and never leaves a final status', () => {
    expect(canAdvanceWhatsAppMessage('queued', 'expired')).toBe(true);
    expect(canAdvanceWhatsAppMessage('sending', 'failed')).toBe(true);
    expect(canAdvanceWhatsAppMessage('sending', 'queued')).toBe(true);
    expect(canAdvanceWhatsAppMessage('sent', 'failed')).toBe(false);
    expect(canAdvanceWhatsAppMessage('failed', 'sent')).toBe(false);
    expect(canAdvanceWhatsAppMessage('expired', 'queued')).toBe(false);
  });

  it('claims kinds in priority order', () => {
    expect(whatsappMessageKinds).toEqual(['otp', 'alert', 'invitation', 'opt_reply', 'auto_reply']);
  });

  it('retries after 10 s, 1 min, then every 5 min until the deadline', () => {
    expect([1, 2, 3, 4, 20].map(whatsappRetryDelaySeconds)).toEqual([10, 60, 300, 300, 300]);
  });
});

describe('warm-up and caps', () => {
  it('counts the warm-up day from the first link', () => {
    expect(whatsappWarmUpDay(null, now)).toBeNull();
    expect(whatsappWarmUpDay(now, now)).toBe(1);
    expect(whatsappWarmUpDay(new Date(now.getTime() - 1000), now)).toBe(1);
    expect(whatsappWarmUpDay(daysAgo(1), now)).toBe(2);
    expect(whatsappWarmUpDay(daysAgo(21), now)).toBe(22);
  });

  it('raises the 24-hour cap by age: 30, 75, 150, then 300', () => {
    expect([null, 1, 3, 4, 7, 8, 21, 22, 400].map(whatsappDailyCap)).toEqual([
      0, 30, 30, 75, 75, 150, 150, 300, 300,
    ]);
  });

  it('keeps first contacts to half the cap', () => {
    expect(whatsappFirstContactCap(30)).toBe(15);
    expect(whatsappFirstContactCap(75)).toBe(37);
    expect(whatsappFirstContactCap(0)).toBe(0);
  });

  it('draws a gap of 6 to 12 whole seconds', () => {
    expect(whatsappSendGapSeconds(() => 0)).toBe(6);
    expect(whatsappSendGapSeconds(() => 0.9999)).toBe(12);
    for (let i = 0; i < 50; i += 1) {
      const gap = whatsappSendGapSeconds();
      expect(gap).toBeGreaterThanOrEqual(6);
      expect(gap).toBeLessThanOrEqual(12);
    }
  });
});

describe('sendBudget', () => {
  it('allows a send within the limits and delays it to the end of the gap', () => {
    const lastSentAt = new Date(now.getTime() - 5_000);
    const budget = sendBudget(
      number({ lastSentAt, gapSeconds: 8 }),
      recipient(),
      'invitation',
      now,
    );
    expect(budget).toEqual({
      allowed: true,
      firstContact: false,
      notBefore: new Date(lastSentAt.getTime() + 8_000),
      dailyLeft: 300,
    });
    const later = sendBudget(number({ lastSentAt: daysAgo(1) }), recipient(), 'otp', now);
    expect(later.allowed && later.notBefore).toEqual(now);
  });

  it('refuses at the hourly cap and the 24-hour cap of the number’s age', () => {
    expect(sendBudget(number({ sentLastHour: 60 }), recipient(), 'otp', now)).toEqual({
      allowed: false,
      reason: 'hourly_cap',
    });
    const young = number({ linkedAt: daysAgo(2), sentLast24h: 30 });
    expect(sendBudget(young, recipient(), 'otp', now)).toEqual({
      allowed: false,
      reason: 'daily_cap',
    });
    expect(sendBudget(number({ linkedAt: null }), recipient(), 'otp', now)).toEqual({
      allowed: false,
      reason: 'daily_cap',
    });
  });

  it('refuses a first contact past half the cap, but not a known recipient', () => {
    const stats = number({ linkedAt: daysAgo(2), sentLast24h: 20, firstContactsLast24h: 15 });
    expect(sendBudget(stats, recipient({ knownToNumber: false }), 'otp', now)).toEqual({
      allowed: false,
      reason: 'first_contact_cap',
    });
    expect(sendBudget(stats, recipient(), 'otp', now)).toMatchObject({ allowed: true });
    expect(sendBudget(number(), recipient({ knownToNumber: false }), 'otp', now)).toMatchObject({
      allowed: true,
      firstContact: true,
    });
  });

  it('applies the per-recipient limits to every kind but OTPs', () => {
    for (const busy of [{ sentLastMinute: 1 }, { sentLastHour: 5 }, { sentLastDay: 10 }]) {
      for (const kind of ['alert', 'invitation', 'opt_reply', 'auto_reply'] as const) {
        expect(sendBudget(number(), recipient(busy), kind, now), kind).toEqual({
          allowed: false,
          reason: 'recipient',
        });
      }
      expect(sendBudget(number(), recipient(busy), 'otp', now)).toMatchObject({ allowed: true });
    }
    const under = recipient({ sentLastMinute: 0, sentLastHour: 4, sentLastDay: 9 });
    expect(sendBudget(number(), under, 'invitation', now)).toMatchObject({ allowed: true });
  });

  it('counts OTPs toward the number’s caps', () => {
    expect(sendBudget(number({ sentLast24h: 300 }), recipient(), 'otp', now)).toMatchObject({
      allowed: false,
    });
  });
});

describe('chooseWhatsAppNumber', () => {
  const stranger = recipient({ knownToNumber: false });

  it('prefers the number that knows the recipient while it is within its limits', () => {
    const chosen = chooseWhatsAppNumber(
      [
        { id: 'a', stats: number({ sentLast24h: 0 }), recipient: stranger },
        { id: 'b', stats: number({ sentLast24h: 200 }), recipient: recipient() },
      ],
      'otp',
      now,
    );
    expect(chosen?.id).toBe('b');
    expect(chosen?.budget.firstContact).toBe(false);
  });

  it('otherwise takes the number with the most 24-hour budget left, as a first contact', () => {
    const chosen = chooseWhatsAppNumber(
      [
        { id: 'known-at-cap', stats: number({ sentLast24h: 300 }), recipient: recipient() },
        { id: 'busy', stats: number({ sentLast24h: 100 }), recipient: stranger },
        {
          id: 'young',
          stats: number({ linkedAt: daysAgo(0), sentLast24h: 0 }),
          recipient: stranger,
        },
        { id: 'free', stats: number({ sentLast24h: 10 }), recipient: stranger },
      ],
      'otp',
      now,
    );
    expect(chosen?.id).toBe('free');
    expect(chosen?.budget.firstContact).toBe(true);
  });

  it('finds none when every number is over its limits or none is given', () => {
    expect(chooseWhatsAppNumber([], 'otp', now)).toBeUndefined();
    const full = number({ linkedAt: daysAgo(2), sentLast24h: 10, firstContactsLast24h: 15 });
    expect(
      chooseWhatsAppNumber([{ id: 'a', stats: full, recipient: stranger }], 'otp', now),
    ).toBeUndefined();
  });
});

describe('matchWhatsAppKeyword', () => {
  it('recognizes opt-out and opt-in in Arabic spellings and Latin case', () => {
    for (const text of ['إيقاف', 'ايقاف', ' إيقاف ', 'إيـقـاف', 'STOP', 'stop', 'Stop ']) {
      expect(matchWhatsAppKeyword(text), text).toBe('opt_out');
    }
    for (const text of ['تشغيل', 'تَشغيل', 'START', 'start']) {
      expect(matchWhatsAppKeyword(text), text).toBe('opt_in');
    }
  });

  it('ignores any other text, including a keyword inside a sentence', () => {
    for (const text of ['من أنت؟', 'stop please', 'إيقاف الرسائل', '', 'STOPP']) {
      expect(matchWhatsAppKeyword(text), text).toBeUndefined();
    }
  });
});

describe('API shapes', () => {
  it('takes a trimmed label of 2 to 40 characters', () => {
    expect(createPlatformWhatsAppSessionSchema.parse({ label: ' رقم 1 ' })).toEqual({
      label: 'رقم 1',
    });
    expect(createPlatformWhatsAppSessionSchema.safeParse({ label: 'ر' }).success).toBe(false);
    expect(createPlatformWhatsAppSessionSchema.safeParse({ label: 'x'.repeat(41) }).success).toBe(
      false,
    );
  });
});
