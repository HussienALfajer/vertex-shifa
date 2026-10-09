// WhatsApp OTP rules (ADR 0012): six digits, short expiry, attempt limit, resend cooldown, hourly cap.
// Only a keyed hash of the code is kept. Pure apart from crypto; the clock is injected.
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const OTP_POLICY = {
  ttlMs: 5 * 60_000,
  maxAttempts: 5,
  resendCooldownMs: 60_000,
  maxPerHour: 3,
};

export function createOtpService({ pepper, policy = OTP_POLICY, now = Date.now }) {
  if (!pepper || pepper.length < 16) throw new Error('OTP pepper must be at least 16 characters');
  const pending = new Map(); // phone -> { hash, expiresAt, attempts, sentAt }
  const issued = new Map(); // phone -> [sentAt]

  const hash = (phone, code) => createHmac('sha256', pepper).update(`${phone}|${code}`).digest();

  // Returns { ok: true, code } (the caller sends the code and forgets it) or { ok: false, reason, retryAt }.
  function issue(phone) {
    const at = now();
    const current = pending.get(phone);
    if (current && at - current.sentAt < policy.resendCooldownMs) {
      return { ok: false, reason: 'resend_cooldown', retryAt: current.sentAt + policy.resendCooldownMs };
    }
    const recent = (issued.get(phone) ?? []).filter((t) => t > at - 3_600_000);
    if (recent.length >= policy.maxPerHour) return { ok: false, reason: 'hourly_cap', retryAt: recent[0] + 3_600_000 };
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    pending.set(phone, { hash: hash(phone, code), expiresAt: at + policy.ttlMs, attempts: 0, sentAt: at });
    issued.set(phone, [...recent, at]);
    return { ok: true, code, expiresAt: at + policy.ttlMs };
  }

  // A failed send must not burn the cooldown or the hourly quota.
  function cancel(phone) {
    pending.delete(phone);
    const list = issued.get(phone) ?? [];
    list.pop();
  }

  // Returns { ok: true } or { ok: false, reason }.
  function verify(phone, code) {
    const entry = pending.get(phone);
    if (!entry) return { ok: false, reason: 'no_pending_code' };
    if (now() > entry.expiresAt) {
      pending.delete(phone);
      return { ok: false, reason: 'expired' };
    }
    entry.attempts += 1;
    const match = /^\d{6}$/.test(String(code)) && timingSafeEqual(entry.hash, hash(phone, String(code)));
    if (match) {
      pending.delete(phone);
      return { ok: true };
    }
    if (entry.attempts >= policy.maxAttempts) {
      pending.delete(phone);
      return { ok: false, reason: 'too_many_attempts' };
    }
    return { ok: false, reason: 'wrong_code', attemptsLeft: policy.maxAttempts - entry.attempts };
  }

  return { issue, cancel, verify, hasPending: (phone) => pending.has(phone) };
}

// Arabic OTP message: no medical content, the brand is visible, a warning not to share it.
export const otpMessage = (code) => `رمز التحقق في Vertex Shifa: ${code}\nصالح لمدة 5 دقائق. لا تشاركه مع أحد.`;
