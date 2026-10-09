// Spike B gateway: one Baileys session, a local control API, OTP and rate limits. Throwaway code.
//
// Privacy rules for this spike (the linked number may be a personal number):
// - only numbers in ALLOWED_RECIPIENTS can be messaged, and only their incoming messages are looked at;
//   everything else is dropped without logging the sender or the content;
// - no history sync, no read receipts, not shown as online;
// - message bodies are never written to the event log; numbers are masked.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import makeWASocket, { DisconnectReason, fetchLatestWaWebVersion, Browsers, useMultiFileAuthState } from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { createOtpService, otpMessage } from './lib/otp.mjs';
import { digitsOnly, loadAllowlist, mask, phoneOfJid, toUserJid } from './lib/phone.mjs';
import { createRateLimiter } from './lib/rate-limiter.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const SESSION = process.env.SESSION_NAME ?? 'test';
const PORT = Number(process.env.CONTROL_PORT ?? 7311);
const allowlist = loadAllowlist(process.env.ALLOWED_RECIPIENTS);
const dataDir = join('.data', `session-${SESSION}`);
mkdirSync(dataDir, { recursive: true });
mkdirSync('out', { recursive: true });
const eventsFile = join('out', 'events.jsonl'); // masked numbers, no message bodies
const startedAt = Date.now();

const log = (ev, fields = {}) => {
  const line = { t: new Date().toISOString(), ms: Date.now() - startedAt, pid: process.pid, ev, ...fields };
  appendFileSync(eventsFile, `${JSON.stringify(line)}\n`);
  console.log(JSON.stringify(line));
};

// --- Lease: exactly one live connection per session (ADR 0012). The product uses a database lease; the spike uses a pid file.
const leaseFile = join(dataDir, 'lease.json');
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
if (existsSync(leaseFile)) {
  const holder = JSON.parse(readFileSync(leaseFile, 'utf8'));
  if (holder.pid !== process.pid && pidAlive(holder.pid) && !process.argv.includes('--ignore-lease')) {
    log('lease_refused', { holder: holder.pid });
    process.exit(3);
  }
}
writeFileSync(leaseFile, JSON.stringify({ pid: process.pid, since: new Date().toISOString() }));
const releaseLease = () => {
  try { if (JSON.parse(readFileSync(leaseFile, 'utf8')).pid === process.pid) rmSync(leaseFile); } catch {}
};

// --- State
const state = {
  status: 'disconnected', // linking | connected | disconnected | needs_relink | banned | replaced
  me: null,
  qrCount: 0,
  firstQrAt: null,
  openedAt: null,
  connects: 0,
  lastClose: null,
  ignoredIncoming: 0,
  messages: {}, // id -> { to, kind, sentAt, statuses: { name: ms after send } }
  incoming: [], // { from, at, len, kind }
};
let currentQr = null;
let sock = null;
let reconnectDelay = 1_000;
let stopping = false;
const sentContent = new Map(); // id -> proto message, kept 1 hour for retry receipts (getMessage)

const limiter = createRateLimiter();
const otp = createOtpService({ pepper: process.env.OTP_PEPPER ?? '' });
const STATUS_NAMES = ['ERROR', 'PENDING', 'SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'];

async function connect() {
  const { state: auth, saveCreds } = await useMultiFileAuthState(join(dataDir, 'auth'));
  const { version, isLatest } = await fetchLatestWaWebVersion().catch(() => ({ version: undefined, isLatest: false }));
  log('connecting', { version: version?.join('.'), isLatest, registered: Boolean(auth.creds.registered) });
  sock = makeWASocket({
    auth,
    version,
    browser: Browsers.ubuntu('Chrome'), // a WEB_BROWSER sub-platform; WIN32 was refused by WhatsApp from 2026-06-30 (Baileys #2741)
    logger: pino({ level: 'silent' }),
    markOnlineOnConnect: false, // keep phone notifications working for the owner
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
    shouldIgnoreJid: (jid) => jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid.endsWith('@newsletter'),
    getMessage: async (key) => sentContent.get(key.id),
  });
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (u) => {
    if (u.qr) {
      currentQr = u.qr;
      state.qrCount += 1;
      state.firstQrAt ??= Date.now();
      state.status = 'linking';
      await QRCode.toFile(join('.data', 'qr.png'), u.qr, { width: 360 });
      log('qr', { n: state.qrCount });
    }
    if (u.connection === 'open') {
      currentQr = null;
      state.status = 'connected';
      state.openedAt = Date.now();
      state.connects += 1;
      reconnectDelay = 1_000;
      state.me = mask(phoneOfJid(sock.user?.id) ?? '');
      log('open', { me: state.me, msSinceStart: Date.now() - startedAt, connects: state.connects, isNewLogin: u.isNewLogin ?? false });
    }
    if (u.connection === 'close') {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      state.lastClose = { code, at: Date.now() };
      log('close', { code, reason: DisconnectReason[code] ?? 'unknown' });
      if (stopping) return;
      if (code === DisconnectReason.loggedOut) { state.status = 'needs_relink'; return; }
      if (code === DisconnectReason.forbidden) { state.status = 'banned'; limiter.pause('banned'); return; }
      if (code === DisconnectReason.connectionReplaced) { state.status = 'replaced'; return; } // another process holds the session: never fight it
      state.status = 'disconnected';
      const delay = code === DisconnectReason.restartRequired ? 0 : reconnectDelay;
      reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
      log('reconnect_scheduled', { inMs: delay });
      setTimeout(() => connect().catch((e) => log('connect_error', { error: e.message })), delay);
    }
  });

  sock.ev.on('messages.update', (updates) => {
    for (const { key, update } of updates) {
      const m = state.messages[key.id];
      if (!m || update.status == null) continue;
      // Receipts repeat and arrive out of order (SERVER_ACK after READ): keep the status monotonic.
      if (update.status <= (m.rank ?? -1)) { log('message_status_stale', { id: key.id, status: STATUS_NAMES[update.status] }); continue; }
      m.rank = update.status;
      const name = STATUS_NAMES[update.status] ?? String(update.status);
      m.statuses[name] ??= Date.now() - m.sentAt;
      log('message_status', { id: key.id, kind: m.kind, status: name, msAfterSend: m.statuses[name] });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message) continue;
      const from = await senderPhone(msg.key);
      if (!from || !allowlist.has(from)) { state.ignoredIncoming += 1; continue; }
      const text = msg.message.conversation ?? msg.message.extendedTextMessage?.text ?? '';
      const kind = /^\s*إيقاف\s*$/.test(text) ? 'opt_out' : /^\s*\d{6}\s*$/.test(text) ? 'code' : 'text';
      const entry = { from: mask(from), at: new Date().toISOString(), len: text.length, kind, upsertType: type, jidType: msg.key.remoteJid.split('@')[1] };
      state.incoming.push(entry);
      // A code received in a chat never verifies a sign-in (ADR 0022: OTP stays one-way).
      log('incoming', entry);
    }
  });
}

// v7 addresses many chats by LID; the phone number comes from the alternate JID or the LID mapping.
async function senderPhone(key) {
  const direct = phoneOfJid(key.remoteJid) ?? phoneOfJid(key.remoteJidAlt);
  if (direct) return direct;
  if (key.remoteJid?.endsWith('@lid')) {
    const pn = await sock.signalRepository.lidMapping.getPNForLID(key.remoteJid).catch(() => null);
    return phoneOfJid(pn);
  }
  return null;
}

async function send(to, text, kind) {
  if (!allowlist.has(to)) return { ok: false, reason: 'not_in_allowlist' };
  if (state.status !== 'connected') return { ok: false, reason: `gateway_${state.status}` };
  const gate = limiter.check(to, Date.now(), { otp: kind === 'otp' });
  if (!gate.ok) return gate;
  const [exists] = await sock.onWhatsApp(to);
  if (!exists?.exists) return { ok: false, reason: 'not_on_whatsapp' };
  const t0 = Date.now();
  const sent = await sock.sendMessage(toUserJid(to), { text });
  limiter.record(to);
  sentContent.set(sent.key.id, sent.message);
  setTimeout(() => sentContent.delete(sent.key.id), 3_600_000).unref();
  state.messages[sent.key.id] = { to: mask(to), kind, sentAt: t0, statuses: { sendMessageReturned: Date.now() - t0 } };
  log('sent', { id: sent.key.id, to: mask(to), kind, firstContact: gate.firstContact, msToReturn: Date.now() - t0, remoteJidType: sent.key.remoteJid.split('@')[1] });
  return { ok: true, id: sent.key.id };
}

// --- Control API (127.0.0.1 only)
const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, fail) => {
  let b = '';
  req.on('data', (c) => { b += c; });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch { fail(new Error('invalid_json')); } });
});

const qrPage = () => `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta http-equiv="refresh" content="3">
<title>Spike B link</title><body style="font-family:sans-serif;text-align:center;background:#fff;color:#111">
<h2>ربط واتساب (Spike B)</h2><p>الحالة: <b>${state.status}</b></p>
${currentQr ? `<img src="/qr.png?${state.qrCount}" width="360" height="360" alt="QR"><p>واتساب ← الأجهزة المرتبطة ← ربط جهاز</p>` : '<p>لا يوجد رمز حاليًا.</p>'}</body></html>`;

const otpPage = (msg = '') => `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>Spike B OTP</title>
<body style="font-family:sans-serif;max-width:420px;margin:40px auto;background:#fff;color:#111"><h2>تحقق OTP (Spike B)</h2>
<form method="post" action="/otp/verify-form"><p><label>الرقم <input name="to" dir="ltr" required></label></p>
<p><label>الرمز <input name="code" dir="ltr" inputmode="numeric" maxlength="6" required></label></p><button>تحقق</button></form><p>${msg}</p></body></html>`;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/qr') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(qrPage()); }
    if (req.method === 'GET' && url.pathname === '/qr.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(existsSync('.data/qr.png') && currentQr ? readFileSync('.data/qr.png') : ''); }
    if (req.method === 'GET' && url.pathname === '/otp') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(otpPage()); }
    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, { ...state, limiter: limiter.stats(), rssMiB: Math.round(process.memoryUsage().rss / 1_048_576), uptimeS: Math.round((Date.now() - startedAt) / 1000) });
    }
    if (req.method === 'POST' && url.pathname === '/send') {
      const { to, text } = await readBody(req);
      return json(res, 200, await send(digitsOnly(to), String(text ?? ''), 'text'));
    }
    if (req.method === 'POST' && url.pathname === '/otp/start') {
      const to = digitsOnly((await readBody(req)).to);
      if (!allowlist.has(to)) return json(res, 200, { ok: false, reason: 'not_in_allowlist' });
      const issued = otp.issue(to);
      if (!issued.ok) return json(res, 200, issued);
      const result = await send(to, otpMessage(issued.code), 'otp');
      if (!result.ok) otp.cancel(to);
      log('otp_issued', { to: mask(to), sent: result.ok, reason: result.reason });
      return json(res, 200, result.ok ? { ...result, expiresAt: new Date(issued.expiresAt).toISOString() } : result);
    }
    if (req.method === 'POST' && (url.pathname === '/otp/verify' || url.pathname === '/otp/verify-form')) {
      const raw = url.pathname.endsWith('form')
        ? Object.fromEntries(new URLSearchParams(await new Promise((ok) => { let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => ok(b)); })))
        : await readBody(req);
      const to = digitsOnly(raw.to);
      const result = otp.verify(to, String(raw.code ?? '').trim());
      log('otp_verify', { to: mask(to), ...result });
      if (url.pathname.endsWith('form')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(otpPage(result.ok ? 'تم التحقق ✔' : `فشل: ${result.reason}`)); }
      return json(res, 200, result);
    }
    if (req.method === 'POST' && url.pathname === '/shutdown') {
      json(res, 200, { ok: true });
      return shutdown('api');
    }
    json(res, 404, { error: 'not_found' });
  } catch (e) {
    log('api_error', { error: e.message });
    json(res, 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => log('control_api', { port: PORT, allowlist: [...allowlist].map(mask) }));

function shutdown(why) {
  stopping = true;
  log('shutdown', { why });
  sock?.end(undefined); // close the socket without logging the device out
  releaseLease();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

connect().catch((e) => { log('connect_error', { error: e.message }); process.exit(1); });
