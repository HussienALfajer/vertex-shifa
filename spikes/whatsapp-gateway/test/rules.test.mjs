// Rate-limit and OTP rules with a fake clock: no WhatsApp traffic.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOtpService } from '../lib/otp.mjs';
import { mask, phoneOfJid } from '../lib/phone.mjs';
import { DEFAULT_POLICY, createRateLimiter } from '../lib/rate-limiter.mjs';

const clock = (start = Date.UTC(2026, 9, 9, 8)) => {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
};
const A = '963900000001';
const B = '963900000002';

test('a gap of 6 to 12 s separates two sends from one number', () => {
  const c = clock();
  const rl = createRateLimiter({ now: c.now, random: () => 0.5 });
  assert.ok(rl.check(A).ok);
  rl.record(A);
  assert.equal(rl.check(B).reason, 'number_gap');
  c.advance(8_999);
  assert.equal(rl.check(B).reason, 'number_gap');
  c.advance(1);
  assert.ok(rl.check(B).ok);
});

test('one recipient gets at most one message a minute, 5 an hour, 10 a day', () => {
  const c = clock();
  const rl = createRateLimiter({ now: c.now, random: () => 0, linkedAt: c.now() - 30 * 86_400_000 });
  rl.record(A);
  c.advance(30_000);
  assert.equal(rl.check(A).reason, 'recipient_gap');
  for (let i = 0; i < 4; i++) { c.advance(60_000); assert.ok(rl.check(A).ok); rl.record(A); }
  c.advance(60_000);
  assert.equal(rl.check(A).reason, 'recipient_hourly_cap');
  for (let i = 0; i < 5; i++) { c.advance(3_600_000); rl.record(A); }
  c.advance(3_600_000);
  assert.equal(rl.check(A).reason, 'recipient_daily_cap');
});

test('a new number warms up: 30 a day for its first three days', () => {
  const c = clock();
  const rl = createRateLimiter({ now: c.now, random: () => 0 });
  const policy = { ...DEFAULT_POLICY };
  let sent = 0;
  for (let i = 0; i < 100; i++) {
    const to = `9639${String(i).padStart(8, '0')}`;
    c.advance(policy.minGapMs);
    // Repeat recipients so the new-recipient share does not stop us first.
    const target = i % 2 ? to : A;
    const r = rl.check(target);
    if (r.ok) { rl.record(target); sent++; } else if (r.reason === 'number_daily_cap') break;
  }
  assert.equal(rl.stats().dailyCap, 30);
  assert.ok(sent <= 30);
  c.advance(3 * 86_400_000);
  assert.equal(rl.stats().dailyCap, 75);
});

test('first contacts are limited to half of the daily cap', () => {
  const c = clock();
  const rl = createRateLimiter({ now: c.now, random: () => 0 });
  for (let i = 0; i < 15; i++) {
    const to = `9639${String(i).padStart(8, '0')}`;
    assert.ok(rl.check(to).ok, `send ${i}`);
    rl.record(to);
    c.advance(6_000);
  }
  assert.equal(rl.check('963900000999').reason, 'new_recipient_daily_cap');
  assert.ok(rl.check(`9639${'0'.repeat(8)}`).ok); // a known recipient still gets through
});

test('a paused number sends nothing', () => {
  const rl = createRateLimiter();
  rl.pause('banned');
  assert.equal(rl.check(A).reason, 'paused:banned');
});

test('OTP: right code once, wrong codes count, expiry, cooldown and hourly cap', () => {
  const c = clock();
  const otp = createOtpService({ pepper: 'synthetic-pepper-for-tests', now: c.now });
  const first = otp.issue(A);
  assert.match(first.code, /^\d{6}$/);
  assert.equal(otp.issue(A).reason, 'resend_cooldown');
  assert.equal(otp.verify(A, '000000' === first.code ? '111111' : '000000').reason, 'wrong_code');
  assert.ok(otp.verify(A, first.code).ok);
  assert.equal(otp.verify(A, first.code).reason, 'no_pending_code'); // single use

  c.advance(60_000);
  const second = otp.issue(A);
  c.advance(5 * 60_000 + 1);
  assert.equal(otp.verify(A, second.code).reason, 'expired');

  c.advance(60_000);
  assert.ok(otp.issue(A).ok);
  c.advance(60_000);
  assert.equal(otp.issue(A).reason, 'hourly_cap');
});

test('OTP: five wrong attempts burn the code', () => {
  const otp = createOtpService({ pepper: 'synthetic-pepper-for-tests' });
  const { code } = otp.issue(B);
  const wrong = code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 4; i++) assert.equal(otp.verify(B, wrong).reason, 'wrong_code');
  assert.equal(otp.verify(B, wrong).reason, 'too_many_attempts');
  assert.equal(otp.verify(B, code).reason, 'no_pending_code');
});

test('OTP: a failed send does not burn the cooldown', () => {
  const otp = createOtpService({ pepper: 'synthetic-pepper-for-tests' });
  assert.ok(otp.issue(A).ok);
  otp.cancel(A);
  assert.ok(otp.issue(A).ok);
});

test('phone helpers mask numbers and read only phone-number JIDs', () => {
  assert.equal(mask(A), '963*******01');
  assert.equal(phoneOfJid(`${A}:12@s.whatsapp.net`), A);
  assert.equal(phoneOfJid('123456789@lid'), null);
  assert.equal(phoneOfJid('120363000000000000@g.us'), null);
});

test('an OTP right after a notification is not held by the per-recipient gap', () => {
  const c = clock();
  const rl = createRateLimiter({ now: c.now, random: () => 0 });
  rl.record(A);
  c.advance(DEFAULT_POLICY.minGapMs);
  assert.equal(rl.check(A).reason, 'recipient_gap');
  assert.ok(rl.check(A, c.now(), { otp: true }).ok);
});
