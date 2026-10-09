// Per-sending-number rate limiter (ADR 0012). Pure: the clock and the random source are injected.
// Values are starting points from community reports, not limits published by WhatsApp; see docs/spikes/B-whatsapp-gateway.md.

export const DEFAULT_POLICY = {
  minGapMs: 6_000, // between two sends from the same number
  jitterMs: 6_000, // added at random to every gap: 6 to 12 s
  perHour: 60,
  // Daily cap by age of the number (days since it was linked to the gateway): gradual volume on new numbers.
  warmup: [
    { untilDay: 3, perDay: 30 },
    { untilDay: 7, perDay: 75 },
    { untilDay: 21, perDay: 150 },
    { untilDay: Infinity, perDay: 300 },
  ],
  newRecipientShare: 0.5, // at most half of the daily cap may go to people this number never messaged
  perRecipient: { minGapMs: 60_000, perHour: 5, perDay: 10 },
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function createRateLimiter({ policy = DEFAULT_POLICY, now = Date.now, random = Math.random, linkedAt = now() } = {}) {
  const sends = []; // { at, to, firstContact }
  const known = new Set(); // recipients this number already messaged
  let nextAllowedAt = 0;
  let pausedReason = null;

  const dailyCap = (at) => {
    const ageDays = Math.floor((at - linkedAt) / DAY) + 1;
    return policy.warmup.find((s) => ageDays <= s.untilDay).perDay;
  };

  // Returns { ok: true } or { ok: false, reason, retryAt? }. Does not record anything.
  // OTP sends skip the per-recipient rules: the OTP service has its own (cooldown, hourly cap).
  function check(to, at = now(), { otp = false } = {}) {
    if (pausedReason) return { ok: false, reason: `paused:${pausedReason}` };
    const lastHour = sends.filter((s) => s.at > at - HOUR);
    const lastDay = sends.filter((s) => s.at > at - DAY);
    const cap = dailyCap(at);
    if (lastDay.length >= cap) return { ok: false, reason: 'number_daily_cap', retryAt: lastDay[0].at + DAY };
    if (lastHour.length >= policy.perHour) return { ok: false, reason: 'number_hourly_cap', retryAt: lastHour[0].at + HOUR };
    const firstContact = !known.has(to);
    if (firstContact && lastDay.filter((s) => s.firstContact).length >= Math.floor(cap * policy.newRecipientShare)) {
      return { ok: false, reason: 'new_recipient_daily_cap', retryAt: at + HOUR };
    }
    const mine = otp ? [] : sends.filter((s) => s.to === to);
    const r = policy.perRecipient;
    const last = mine.at(-1);
    if (last && at - last.at < r.minGapMs) return { ok: false, reason: 'recipient_gap', retryAt: last.at + r.minGapMs };
    if (mine.filter((s) => s.at > at - HOUR).length >= r.perHour) return { ok: false, reason: 'recipient_hourly_cap', retryAt: at + HOUR };
    if (mine.filter((s) => s.at > at - DAY).length >= r.perDay) return { ok: false, reason: 'recipient_daily_cap', retryAt: at + DAY };
    if (at < nextAllowedAt) return { ok: false, reason: 'number_gap', retryAt: nextAllowedAt };
    return { ok: true, firstContact };
  }

  // Call after a send was accepted by WhatsApp's server.
  function record(to, at = now()) {
    sends.push({ at, to, firstContact: !known.has(to) });
    known.add(to);
    nextAllowedAt = at + policy.minGapMs + Math.floor(random() * policy.jitterMs);
    while (sends.length && sends[0].at <= at - DAY) sends.shift();
  }

  return {
    check,
    record,
    pause: (reason) => { pausedReason = reason; },
    resume: () => { pausedReason = null; },
    stats: (at = now()) => ({
      lastHour: sends.filter((s) => s.at > at - HOUR).length,
      lastDay: sends.filter((s) => s.at > at - DAY).length,
      dailyCap: dailyCap(at),
      nextAllowedAt,
      pausedReason,
    }),
  };
}
