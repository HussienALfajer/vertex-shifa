// Spike API: device tokens, the command endpoint that re-executes commands, a cloud booking endpoint.
// Throwaway code. Synthetic data only.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as jose from 'jose';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { seed } from './seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.API_PORT ?? 6060);
const PG_HOST = 'postgres://%s:spike-only-password@127.0.0.1:54317/shifa';
const AUDIENCE = 'vertex-shifa-sync';

// The API runs as shifa_app (RLS applies). Admin is used only for spike seeding and device lookup.
const app = new pg.Pool({ connectionString: PG_HOST.replace('%s', 'shifa_app') });
const admin = new pg.Pool({ connectionString: PG_HOST.replace('%s', 'postgres') });

// --- Keys -----------------------------------------------------------------------------------
const keyFile = path.join(here, '..', '.data', 'jwt-key.json');
async function loadKeys() {
  if (fs.existsSync(keyFile)) {
    const jwk = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
    return { privateKey: await jose.importJWK(jwk.private, 'EdDSA'), publicJwk: jwk.public };
  }
  const { privateKey, publicKey } = await jose.generateKeyPair('EdDSA', { extractable: true });
  const publicJwk = { ...(await jose.exportJWK(publicKey)), kid: 'spike-1', alg: 'EdDSA' };
  fs.mkdirSync(path.dirname(keyFile), { recursive: true });
  fs.writeFileSync(keyFile, JSON.stringify({ private: await jose.exportJWK(privateKey), public: publicJwk }));
  return { privateKey, publicJwk };
}
const keys = await loadKeys();

async function signDeviceToken(device) {
  return new jose.SignJWT({ tenant_id: device.tenant_id, branch_id: device.branch_id, device_id: device.id })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'spike-1' })
    .setSubject(device.id)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(keys.privateKey);
}

async function verifyDeviceToken(req) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const { payload } = await jose.jwtVerify(token, jose.createLocalJWKSet({ keys: [keys.publicJwk] }), { audience: AUDIENCE });
  // A revoked device loses access at once, even with an unexpired token.
  const { rows } = await admin.query('SELECT revoked_at FROM devices WHERE id = $1', [payload.device_id]);
  if (!rows[0] || rows[0].revoked_at) throw Object.assign(new Error('device_revoked'), { status: 403 });
  return payload;
}

// --- Transactions with tenant context (ADR 0004) --------------------------------------------
async function inTenant(tenantId, fn) {
  const client = await app.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// --- Commands --------------------------------------------------------------------------------
const Envelope = z.object({
  id: z.uuid(),
  type: z.string(),
  user_id: z.uuid(),
  device_time: z.iso.datetime({ offset: true }),
  payload: z.record(z.string(), z.unknown()),
});
const BookAppointment = z.object({
  appointment_id: z.uuid(),
  slot_id: z.uuid(),
  patient_id: z.uuid(),
  patient_present: z.boolean(),
});
const RecordAccessed = z.object({
  entity_type: z.enum(['visit_note']),
  entity_id: z.uuid(),
  break_glass: z.boolean(),
});

const ACTIVE = ['booked', 'confirmed', 'arrived', 'in_consultation'];
const POOLS = { reception: ['reception', 'shared'], online: ['online', 'shared'] };

async function nearestFreeSlots(db, slot, channel) {
  const { rows } = await db.query(
    `SELECT s.id, s.starts_at FROM slots s
      WHERE s.branch_id = $1 AND s.practitioner_id = $2 AND s.id <> $3 AND s.pool = ANY($4)
        AND NOT EXISTS (SELECT 1 FROM appointments a WHERE a.slot_id = s.id AND a.status = ANY($5))
      ORDER BY abs(extract(epoch FROM s.starts_at - $6::timestamptz)) LIMIT 3`,
    [slot.branch_id, slot.practitioner_id, slot.id, POOLS[channel], ACTIVE, slot.starts_at],
  );
  return rows.map((r) => ({ slot_id: r.id, starts_at: r.starts_at }));
}

// Re-executes BookAppointment with the business rules. Never trusts what the device decided.
async function bookAppointment(db, auth, cmd, p) {
  const { rows: [slot] } = await db.query('SELECT * FROM slots WHERE id = $1 AND branch_id = $2 FOR UPDATE', [p.slot_id, auth.branch_id]);
  if (!slot) return { outcome: 'rejected', detail: { reason: 'slot_not_found' } };
  if (!POOLS.reception.includes(slot.pool)) return { outcome: 'rejected', detail: { reason: 'pool_not_allowed', pool: slot.pool } };
  const { rows: [patient] } = await db.query('SELECT id FROM patients WHERE id = $1 AND branch_id = $2', [p.patient_id, auth.branch_id]);
  if (!patient) return { outcome: 'rejected', detail: { reason: 'patient_not_found' } };

  const insert = (status, conflictId = null) => db.query(
    `INSERT INTO appointments (id, tenant_id, branch_id, slot_id, patient_id, channel, patient_present, status, origin_device_id, command_id, conflict_id)
     VALUES ($1,$2,$3,$4,$5,'reception',$6,$7,$8,$9,$10)`,
    [p.appointment_id, auth.tenant_id, auth.branch_id, slot.id, p.patient_id, p.patient_present, status, auth.device_id, cmd.id, conflictId],
  );

  const { rows: [existing] } = await db.query('SELECT * FROM appointments WHERE slot_id = $1 AND status = ANY($2)', [slot.id, ACTIVE]);
  if (!existing) {
    await insert('booked');
    return { outcome: 'accepted', detail: { appointment_id: p.appointment_id, status: 'booked' } };
  }

  // ADR 0009: the patient present at the clinic wins; otherwise the booking that reached the server first.
  const incomingWins = p.patient_present && !existing.patient_present;
  const rule = incomingWins ? 'patient_present_wins' : 'first_to_server_wins';
  const conflictId = uuidv7();
  const moved = incomingWins
    ? { id: existing.id, patient_id: existing.patient_id, channel: existing.channel }
    : { id: p.appointment_id, patient_id: p.patient_id, channel: 'reception' };
  const alternatives = await nearestFreeSlots(db, slot, moved.channel);
  await db.query(
    `INSERT INTO booking_conflicts (id, tenant_id, branch_id, slot_id, kept_appointment_id, moved_appointment_id, rule, alternatives)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [conflictId, auth.tenant_id, auth.branch_id, slot.id, incomingWins ? p.appointment_id : existing.id, moved.id, rule, JSON.stringify(alternatives)],
  );
  if (incomingWins) {
    // The moved booking is never cancelled silently: it waits for a new slot, with alternatives and a notice.
    await db.query("UPDATE appointments SET status = 'requested', conflict_id = $2 WHERE id = $1", [existing.id, conflictId]);
    await insert('booked');
  } else {
    await insert('requested', conflictId);
  }
  await db.query(
    "INSERT INTO outbox (tenant_id, kind, patient_id, payload) VALUES ($1, 'booking_moved', $2, $3)",
    [auth.tenant_id, moved.patient_id, JSON.stringify({ appointment_id: moved.id, alternatives })],
  );
  return { outcome: 'adjusted', detail: { conflict_id: conflictId, rule, moved_appointment_id: moved.id, alternatives } };
}

async function recordAccessed(db, auth, cmd, p) {
  // The read already happened on the device; the server records it even if it cannot match the entity.
  const { rows: [note] } = await db.query('SELECT id FROM visit_notes WHERE id = $1', [p.entity_id]);
  await db.query(
    `INSERT INTO audit_log (tenant_id, branch_id, actor_user_id, device_id, action, entity_type, entity_id, occurred_at, command_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [auth.tenant_id, auth.branch_id, cmd.user_id, auth.device_id, p.break_glass ? 'break_glass_read' : 'read', p.entity_type, p.entity_id, cmd.device_time, cmd.id],
  );
  return { outcome: 'accepted', detail: note ? {} : { warning: 'entity_not_found' } };
}

const handlers = {
  BookAppointment: { schema: BookAppointment, run: bookAppointment },
  RecordAccessed: { schema: RecordAccessed, run: recordAccessed },
};

// Idempotent by command id. Always answers with an outcome so the device's upload queue never blocks
// on a business refusal (PowerSync's upload queue is FIFO and blocks the download of new checkpoints).
async function executeCommand(auth, raw) {
  const parsed = Envelope.safeParse(raw);
  if (!parsed.success) return { id: raw?.id ?? null, outcome: 'rejected', detail: { reason: 'invalid_envelope' } };
  const cmd = parsed.data;
  return inTenant(auth.tenant_id, async (db) => {
    const { rows: [seen] } = await db.query('SELECT outcome, outcome_detail FROM command_log WHERE id = $1', [cmd.id]);
    if (seen) return { id: cmd.id, outcome: seen.outcome, detail: seen.outcome_detail, replay: true };
    const handler = handlers[cmd.type];
    const payload = handler?.schema.safeParse(cmd.payload);
    let result;
    if (!handler) result = { outcome: 'rejected', detail: { reason: 'unknown_command' } };
    else if (!payload.success) result = { outcome: 'rejected', detail: { reason: 'invalid_payload' } };
    else {
      await db.query('SAVEPOINT cmd');
      try {
        result = await handler.run(db, auth, cmd, payload.data);
      } catch (e) {
        await db.query('ROLLBACK TO SAVEPOINT cmd');
        result = { outcome: 'rejected', detail: { reason: 'server_error', code: e.code ?? null } };
      }
    }
    await db.query(
      `INSERT INTO command_log (id, tenant_id, branch_id, device_id, user_id, type, payload, device_time, outcome, outcome_detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [cmd.id, auth.tenant_id, auth.branch_id, auth.device_id, cmd.user_id, cmd.type, JSON.stringify(cmd.payload), cmd.device_time, result.outcome, JSON.stringify(result.detail)],
    );
    return { id: cmd.id, ...result };
  });
}

// Cloud channel (patient app / public page): synchronous, books only from the online and shared pools.
async function bookOnline(body) {
  return inTenant(body.tenant_id, async (db) => {
    const { rows: [slot] } = await db.query('SELECT * FROM slots WHERE id = $1 FOR UPDATE', [body.slot_id]);
    if (!slot || !POOLS.online.includes(slot.pool)) return { status: 422, body: { error: 'slot_not_bookable_online' } };
    const { rows: [taken] } = await db.query('SELECT id FROM appointments WHERE slot_id = $1 AND status = ANY($2)', [slot.id, ACTIVE]);
    if (taken) return { status: 409, body: { error: 'slot_taken' } };
    const id = uuidv7();
    await db.query(
      `INSERT INTO appointments (id, tenant_id, branch_id, slot_id, patient_id, channel, patient_present, status)
       VALUES ($1,$2,$3,$4,$5,'online',false,'booked')`,
      [id, slot.tenant_id, slot.branch_id, slot.id, body.patient_id],
    );
    return { status: 201, body: { appointment_id: id } };
  });
}

// --- HTTP ------------------------------------------------------------------------------------
async function readJson(req) {
  let s = '';
  for await (const chunk of req) s += chunk;
  return s ? JSON.parse(s) : {};
}
function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const routes = {
  'GET /api/auth/keys': async () => [200, { keys: [keys.publicJwk] }],
  'POST /api/auth/device-token': async (req) => {
    const { device_id } = await readJson(req);
    const { rows: [device] } = await admin.query('SELECT * FROM devices WHERE id = $1', [device_id]);
    if (!device) return [404, { error: 'unknown_device' }];
    if (device.revoked_at) return [403, { error: 'device_revoked' }];
    return [200, { token: await signDeviceToken(device), expires_in: 300 }];
  },
  'POST /api/commands': async (req) => {
    const auth = await verifyDeviceToken(req);
    const { commands } = await readJson(req);
    const results = [];
    for (const c of commands) results.push(await executeCommand(auth, c));
    return [200, { results }];
  },
  'POST /api/online/book': async (req) => {
    const r = await bookOnline(await readJson(req));
    return [r.status, r.body];
  },
  // Spike-only helpers.
  'POST /api/spike/reset': async () => [200, await seed(admin)],
  'POST /api/spike/revoke': async (req) => {
    const { device_id } = await readJson(req);
    await admin.query('UPDATE devices SET revoked_at = now() WHERE id = $1', [device_id]);
    return [200, {}];
  },
  'POST /api/spike/sql': async (req) => {
    const { sql, params } = await readJson(req);
    const r = await admin.query(sql, params ?? []);
    return [200, Array.isArray(r) ? r.map((x) => x.rows) : r.rows];
  },
};

http.createServer(async (req, res) => {
  const route = routes[`${req.method} ${req.url}`];
  if (!route) return send(res, 404, { error: 'not_found' });
  try {
    const [status, body] = await route(req);
    send(res, status, body);
  } catch (e) {
    const status = e.status ?? (e.code?.startsWith?.('ERR_JW') ? 401 : 500);
    if (status === 500) console.error(e);
    send(res, status, { error: e.message });
  }
}).listen(PORT, () => console.log(`spike api on :${PORT}`));
