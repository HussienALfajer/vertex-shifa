// A clinic device: encrypted local PowerSync database, commands in an upload queue, network via proxies.
import { Worker } from 'node:worker_threads';
import path from 'node:path';
import fs from 'node:fs';
import { PowerSyncDatabase, Schema, Table, column, createConsoleLogger, LogLevels } from '@powersync/node';
import { v7 as uuidv7 } from 'uuid';
import { createProxy } from './proxy.mjs';

export const API_PORT = 6060;
export const SYNC_PORT = 8080;

const text = column.text;
const int = column.integer;
export const schema = new Schema({
  slots: new Table({ tenant_id: text, branch_id: text, practitioner_id: text, starts_at: text, pool: text }),
  patients: new Table({ tenant_id: text, branch_id: text, full_name: text }),
  visit_notes: new Table({ tenant_id: text, branch_id: text, patient_id: text, body: text }),
  appointments: new Table({
    tenant_id: text, branch_id: text, slot_id: text, patient_id: text, channel: text, patient_present: int,
    status: text, origin_device_id: text, command_id: text, conflict_id: text, received_at: text,
  }),
  booking_conflicts: new Table({
    tenant_id: text, branch_id: text, slot_id: text, kept_appointment_id: text, moved_appointment_id: text,
    rule: text, alternatives: text, status: text, created_at: text,
  }),
  command_log: new Table({ type: text, outcome: text, outcome_detail: text, received_at: text }),
  // The upload queue of typed commands. Insert-only: rows are never stored locally, only queued.
  commands: new Table({ type: text, user_id: text, device_time: text, payload: text }, { insertOnly: true }),
});

// Sync errors are expected here (the scenarios cut the network); the scenarios assert on outcomes instead.
const logger = createConsoleLogger({ minLevel: LogLevels.error + 1 });

export async function waitFor(fn, { timeout = 30000, every = 100, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return { value, ms: Date.now() - start };
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, every));
  }
}

function claims(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

/**
 * @param {{ name: string, deviceId: string, userId: string, dir: string, hexKey: string, documentedKeySetup?: boolean }} opts
 * documentedKeySetup: set the key in `initializeConnection` as the SDK README shows (fails on reopen).
 */
export async function openDevice({ name, deviceId, userId, dir, hexKey, documentedKeySetup = false }) {
  const syncProxy = await createProxy(SYNC_PORT);
  const apiProxy = await createProxy(API_PORT);
  const api = `http://127.0.0.1:${apiProxy.port}`;
  fs.mkdirSync(dir, { recursive: true });
  const dbFilename = `${name}.sqlite`;

  const db = new PowerSyncDatabase({
    schema,
    logger,
    database: {
      dbFilename,
      dbLocation: dir,
      openWorker: (_, options) => new Worker(new URL('./encrypted.worker.mjs', import.meta.url), {
        ...options, workerData: { hexKey, keyInWorker: !documentedKeySetup },
      }),
      initializeConnection: documentedKeySetup
        ? async (conn) => {
          await conn.execute(`PRAGMA hexkey = '${hexKey}'`);
          await conn.execute('PRAGMA user_version');
        }
        : undefined,
    },
  });

  const state = { token: null, claims: null, revoked: false, uploads: [] };

  const connector = {
    async fetchCredentials() {
      const r = await fetch(`${api}/api/auth/device-token`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device_id: deviceId }),
      });
      if (r.status === 403) {
        // Revoked: wipe replicated data (ADR 0005, 0008). Deferred so the sync loop can unwind first.
        state.revoked = true;
        setTimeout(() => db.disconnectAndClear().catch(() => {}), 0);
        throw new Error('device_revoked');
      }
      if (!r.ok) throw new Error(`token ${r.status}`);
      const { token } = await r.json();
      state.token = token;
      state.claims = claims(token);
      return { endpoint: `http://127.0.0.1:${syncProxy.port}`, token };
    },
    async uploadData(database) {
      const tx = await database.getNextCrudTransaction();
      if (!tx) return;
      // Only commands travel. Optimistic row writes made next to a command stay local and are replaced by
      // the server's state at the next checkpoint.
      const commands = tx.crud
        .filter((op) => op.table === 'commands' && op.op === 'PUT')
        .map((op) => ({ id: op.id, type: op.opData.type, user_id: op.opData.user_id, device_time: op.opData.device_time, payload: JSON.parse(op.opData.payload) }));
      if (commands.length) {
        if (!state.token) await connector.fetchCredentials();
        const r = await fetch(`${api}/api/commands`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${state.token}` },
          body: JSON.stringify({ commands }),
        });
        if (r.status === 401) state.token = null;
        if (r.status === 403) {
          state.revoked = true;
          setTimeout(() => db.disconnectAndClear().catch(() => {}), 0);
        }
        if (!r.ok) throw new Error(`upload ${r.status}`); // keeps the transaction queued; the SDK retries
        const { results } = await r.json();
        state.uploads.push(...results);
      }
      await tx.complete();
    },
  };

  const connect = () => db.connect(connector, { retryDelayMs: 300, crudUploadThrottleMs: 50 });

  async function queueCommand(tx, type, payload) {
    const id = uuidv7();
    await tx.execute('INSERT INTO commands (id, type, user_id, device_time, payload) VALUES (?, ?, ?, ?, ?)', [
      id, type, userId, new Date().toISOString(), JSON.stringify(payload),
    ]);
    return id;
  }

  const device = {
    name, db, state, dir, dbFilename,
    async start() {
      await connect();
      await db.waitForFirstSync();
    },
    goOffline() { syncProxy.cut(); apiProxy.cut(); },
    goOnline() { syncProxy.restore(); apiProxy.restore(); },
    cutApiOnly() { apiProxy.cut(); },
    async book({ slotId, patientId, patientPresent }) {
      const busy = await db.getOptional(
        "SELECT id FROM appointments WHERE slot_id = ? AND status IN ('booked','confirmed','arrived','in_consultation')", [slotId]);
      if (busy) throw new Error('slot busy locally');
      const appointmentId = uuidv7();
      let commandId;
      await db.writeTransaction(async (tx) => {
        await tx.execute(
          `INSERT INTO appointments (id, tenant_id, branch_id, slot_id, patient_id, channel, patient_present, status, origin_device_id)
           VALUES (?, ?, ?, ?, ?, 'reception', ?, 'booked', ?)`,
          [appointmentId, state.claims.tenant_id, state.claims.branch_id, slotId, patientId, patientPresent ? 1 : 0, deviceId]);
        commandId = await queueCommand(tx, 'BookAppointment', {
          appointment_id: appointmentId, slot_id: slotId, patient_id: patientId, patient_present: patientPresent,
        });
      });
      return { appointmentId, commandId };
    },
    // Reading a medical record writes a local, append-only audit command (ADR 0008, 0016).
    async openNote(noteId, { breakGlass = false } = {}) {
      return db.writeTransaction(async (tx) => {
        const note = await tx.getOptional('SELECT id, body FROM visit_notes WHERE id = ?', [noteId]);
        const commandId = await queueCommand(tx, 'RecordAccessed', { entity_type: 'visit_note', entity_id: noteId, break_glass: breakGlass });
        return { note, commandId, readAt: new Date().toISOString() };
      });
    },
    outcome: (commandId) => db.getOptional('SELECT outcome, outcome_detail FROM command_log WHERE id = ?', [commandId]),
    pendingCommands: async () => (await db.getUploadQueueStats()).count,
    async close() {
      await db.close();
      await syncProxy.close();
      await apiProxy.close();
    },
  };
  return device;
}

export function dbPath(device) {
  return path.join(device.dir, device.dbFilename);
}
