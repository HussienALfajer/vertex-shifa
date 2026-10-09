// Spike B push sender. Sends one synthetic notification and reports the outcome. Throwaway code.
//   node push-send.mjs expo <ExponentPushToken[...]>                       Expo push service (then reads the receipt)
//   node push-send.mjs fcm <fcm-device-token> <service-account.json>       FCM HTTP v1 directly, without Expo
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const [mode, token, saPath] = process.argv.slice(2);
const title = 'Vertex Shifa';
const body = 'اختبار إشعار Spike B';
const sentAt = Date.now();
const out = (o) => console.log(JSON.stringify({ t: new Date().toISOString(), ...o }));

if (mode === 'expo') {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, data: { sentAt, path: 'expo' }, priority: 'high', channelId: 'default', sound: 'default' }),
  });
  const ticket = await res.json();
  out({ ev: 'expo_ticket', http: res.status, ms: Date.now() - sentAt, ticket: ticket.data ?? ticket });
  const id = ticket.data?.id;
  if (id) {
    await new Promise((ok) => setTimeout(ok, 15_000));
    const r = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    out({ ev: 'expo_receipt', http: r.status, receipt: (await r.json()).data?.[id] ?? null });
  }
} else if (mode === 'fcm') {
  const sa = JSON.parse(readFileSync(saPath, 'utf8'));
  const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(sa.private_key, 'base64url')}`;
  const tok = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  }).then((r) => r.json());
  if (!tok.access_token) { out({ ev: 'fcm_auth_failed', error: tok.error }); process.exit(1); }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tok.access_token}` },
    body: JSON.stringify({ message: { token, notification: { title, body }, data: { sentAt: String(sentAt), path: 'fcm' }, android: { priority: 'HIGH', notification: { channel_id: 'default' } } } }),
  });
  out({ ev: 'fcm_send', http: res.status, ms: Date.now() - sentAt, result: await res.json() });
} else {
  console.error('usage: node push-send.mjs expo <token> | fcm <token> <service-account.json>');
  process.exit(2);
}
