// Spike A scenarios. Run with Node (`pnpm scenarios`) or inside Electron (`pnpm scenarios:electron`).
// Needs: docker compose up -d, and the API (`pnpm server`).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Database from 'better-sqlite3-multiple-ciphers';
import { openDevice, waitFor, dbPath, API_PORT } from '../client/device.mjs';
import { IDS } from '../server/seed.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const API = `http://127.0.0.1:${API_PORT}`;
const P = IDS.patients;

async function post(route, body, headers = {}) {
  const r = await fetch(`${API}${route}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json() };
}
const sql = async (q, params) => (await post('/api/spike/sql', { sql: q, params })).body;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const offline = (d) => waitFor(() => !d.db.currentStatus.connected, { label: `${d.name} offline` });

const poolsOf = async (alternatives) =>
  (await sql('SELECT pool FROM slots WHERE id = ANY($1)', [alternatives.map((a) => a.slot_id)])).map((r) => r.pool);

export async function runAll({ hexKey, label, childExec = process.execPath, childEnv = {}, extraChecks = [] }) {
  const results = [];
  const timings = {};
  const check = (scenario, name, ok, detail) => {
    results.push({ scenario, name, ok: Boolean(ok), detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  [${scenario}] ${name}${ok ? '' : `  ${JSON.stringify(detail)}`}`);
  };
  for (const c of extraChecks) check(c.scenario, c.name, c.ok, c.detail);
  const run = async (scenario, fn) => {
    const t = Date.now();
    try { await fn(); } catch (e) { check(scenario, 'scenario ran to the end', false, String(e?.stack ?? e)); }
    timings[scenario] = Date.now() - t;
  };

  const dir = path.join(here, '..', '.data', `devices-${label}`);
  fs.rmSync(dir, { recursive: true, force: true });
  await post('/api/spike/reset');

  const open = (name, deviceId) => openDevice({ name, deviceId, userId: IDS.user, dir, hexKey });
  const A = await open('reception-a', IDS.deviceA);
  const B = await open('reception-b', IDS.deviceB);
  const X = await open('other-tenant', IDS.deviceOtherTenant);
  const devices = [A, B, X];

  await run('first-sync', async () => {
    for (const d of devices) {
      const t = Date.now();
      await d.start();
      timings[`first-sync-${d.name}`] = Date.now() - t;
    }
    await waitFor(async () => (await A.db.get('SELECT count(*) n FROM slots')).n === 9, { label: 'A slots' });
    await waitFor(async () => (await B.db.get('SELECT count(*) n FROM slots')).n === 9, { label: 'B slots' });
    check('first-sync', 'reception devices hold the 9 slots of their branch', true);
  });

  await run('replication-scope', async () => {
    await waitFor(async () => (await X.db.get('SELECT count(*) n FROM slots')).n === 1, { label: 'X slots' });
    const leakedToX = await X.db.get('SELECT (SELECT count(*) FROM slots WHERE tenant_id = ?) + (SELECT count(*) FROM patients WHERE tenant_id = ?) + (SELECT count(*) FROM visit_notes WHERE tenant_id = ?) n', [IDS.tenantA, IDS.tenantA, IDS.tenantA]);
    const leakedToA = await A.db.get('SELECT (SELECT count(*) FROM slots WHERE tenant_id = ?) + (SELECT count(*) FROM patients WHERE tenant_id = ?) + (SELECT count(*) FROM visit_notes WHERE tenant_id = ?) n', [IDS.tenantB, IDS.tenantB, IDS.tenantB]);
    check('replication-scope', 'a device of tenant B holds no tenant A rows', leakedToX.n === 0, leakedToX);
    check('replication-scope', 'a device of tenant A holds no tenant B rows', leakedToA.n === 0, leakedToA);
    const trap = await sql('SELECT tenant_id, branch_id FROM slots WHERE id = $1', [IDS.slotTenantBInBranchA]);
    const trapOnA = await A.db.getOptional('SELECT 1 FROM slots WHERE id = ?', [IDS.slotTenantBInBranchA]);
    check('replication-scope', "the stream's tenant filter alone excludes a tenant B row that carries branch A's id", trap.length === 1 && trap[0].branch_id === IDS.branchA && !trapOnA, { trap, trapOnA });
    const rls = await sql(`
      DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'powersync_no_bypass') THEN
        CREATE ROLE powersync_no_bypass LOGIN REPLICATION NOBYPASSRLS; GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_no_bypass; END IF; END $$;
      BEGIN; SET LOCAL ROLE powersync_no_bypass; SELECT count(*)::int AS n FROM slots; COMMIT;
      BEGIN; SET LOCAL ROLE powersync_role; SELECT count(*)::int AS n FROM slots; COMMIT;`);
    const counts = rls.filter((r) => r.length === 1).map((r) => r[0].n);
    check('replication-scope', 'with RLS, a replication role without BYPASSRLS sees 0 rows in a snapshot query; powersync_role (BYPASSRLS) sees all 11', counts[0] === 0 && counts[1] === 11, counts);
  });

  await run('cloud-vs-reception-present', async () => {
    A.goOffline();
    await offline(A);
    const cloud = await post('/api/online/book', { tenant_id: IDS.tenantA, slot_id: IDS.slotShared, patient_id: P[1] });
    check('cloud-vs-reception-present', 'cloud booking of the shared slot accepted while reception is offline', cloud.status === 201, cloud);
    const walkIn = await A.book({ slotId: IDS.slotShared, patientId: P[0], patientPresent: true });
    const local = await A.db.get('SELECT status FROM appointments WHERE id = ?', [walkIn.appointmentId]);
    check('cloud-vs-reception-present', 'offline booking is visible locally at once (booked)', local.status === 'booked', local);
    check('cloud-vs-reception-present', 'the command waits in the upload queue', (await A.pendingCommands()) >= 1);
    A.goOnline();
    const { value: outcome, ms } = await waitFor(() => A.outcome(walkIn.commandId), { label: 'outcome' });
    timings['reconnect-to-outcome-present'] = ms;
    const detail = JSON.parse(outcome.outcome_detail);
    check('cloud-vs-reception-present', 'server re-executed the command: adjusted, patient present wins', outcome.outcome === 'adjusted' && detail.rule === 'patient_present_wins', outcome);
    const [server] = [await sql('SELECT id, status, conflict_id FROM appointments WHERE slot_id = $1 ORDER BY received_at', [IDS.slotShared])];
    const cloudRow = server.find((r) => r.id === cloud.body.appointment_id);
    const walkInRow = server.find((r) => r.id === walkIn.appointmentId);
    check('cloud-vs-reception-present', 'server: walk-in booked, cloud booking moved to requested with the conflict id', walkInRow?.status === 'booked' && cloudRow?.status === 'requested' && cloudRow.conflict_id === detail.conflict_id, server);
    const outbox = await sql("SELECT patient_id, payload FROM outbox WHERE kind = 'booking_moved'");
    const pools = outbox.length === 1 ? await poolsOf(outbox[0].payload.alternatives) : [];
    check('cloud-vs-reception-present', 'moved patient gets a notice with alternatives, all from the online and shared pools', outbox.length === 1 && outbox[0].patient_id === P[1] && pools.length > 0 && pools.every((p) => p === 'online' || p === 'shared'), { outbox, pools });
    await waitFor(async () => (await A.db.getOptional("SELECT 1 FROM appointments WHERE id = ? AND status = 'requested'", [cloud.body.appointment_id])), { label: 'A sees moved cloud booking' });
    await waitFor(async () => (await B.db.getOptional('SELECT 1 FROM booking_conflicts WHERE id = ?', [detail.conflict_id])), { label: 'B sees conflict' });
    check('cloud-vs-reception-present', 'the result streams back: device A sees the moved booking, device B sees the conflict in its inbox', true);
  });

  await run('cloud-vs-reception-phone', async () => {
    A.goOffline();
    await offline(A);
    const cloud = await post('/api/online/book', { tenant_id: IDS.tenantA, slot_id: IDS.slotShared2, patient_id: P[2] });
    const phone = await A.book({ slotId: IDS.slotShared2, patientId: P[3], patientPresent: false });
    A.goOnline();
    const { value: outcome } = await waitFor(() => A.outcome(phone.commandId), { label: 'outcome' });
    check('cloud-vs-reception-phone', 'phone booking reaching the server second is adjusted (first to server wins)', cloud.status === 201 && outcome.outcome === 'adjusted' && JSON.parse(outcome.outcome_detail).rule === 'first_to_server_wins', outcome);
    const { value: local } = await waitFor(() => A.db.getOptional("SELECT status, conflict_id FROM appointments WHERE id = ? AND status = 'requested'", [phone.appointmentId]), { label: 'local replaced' });
    check('cloud-vs-reception-phone', "the device's optimistic 'booked' row was replaced by the server's 'requested' row", local.conflict_id !== null, local);
  });

  await run('two-offline-receptions', async () => {
    A.goOffline();
    B.goOffline();
    await offline(A);
    await offline(B);
    const a = await A.book({ slotId: IDS.slotReception, patientId: P[4], patientPresent: false });
    await sleep(50);
    const b = await B.book({ slotId: IDS.slotReception, patientId: P[5], patientPresent: false });
    // B reconnects first although A booked first on its own clock.
    B.goOnline();
    const { value: ob } = await waitFor(() => B.outcome(b.commandId), { label: 'B outcome' });
    A.goOnline();
    const { value: oa } = await waitFor(() => A.outcome(a.commandId), { label: 'A outcome' });
    check('two-offline-receptions', 'device B (first to reach the server) accepted; device A adjusted into a conflict', ob.outcome === 'accepted' && oa.outcome === 'adjusted', { ob, oa });
    const converged = async () => {
      const q = 'SELECT id, status FROM appointments WHERE slot_id = ? ORDER BY id';
      const [ra, rb] = [await A.db.getAll(q, [IDS.slotReception]), await B.db.getAll(q, [IDS.slotReception])];
      return JSON.stringify(ra) === JSON.stringify(rb) && ra.length === 2 && ra.find((r) => r.id === b.appointmentId)?.status === 'booked' && ra.find((r) => r.id === a.appointmentId)?.status === 'requested';
    };
    const { ms } = await waitFor(converged, { label: 'convergence' });
    timings['two-devices-converge-after-last-reconnect'] = ms;
    const conflicts = await sql('SELECT rule, alternatives FROM booking_conflicts WHERE slot_id = $1', [IDS.slotReception]);
    const pools = conflicts.length === 1 ? await poolsOf(conflicts[0].alternatives) : [];
    check('two-offline-receptions', 'both devices converge on the same state; one conflict, alternatives all from the reception and shared pools', conflicts.length === 1 && pools.length > 0 && pools.every((p) => p === 'reception' || p === 'shared'), { conflicts, pools });
    const active = await sql("SELECT count(*)::int n FROM appointments WHERE slot_id = $1 AND status = 'booked'", [IDS.slotReception]);
    check('two-offline-receptions', 'never two active bookings on one slot (server)', active[0].n === 1, active);
  });

  await run('server-authority', async () => {
    A.goOffline();
    await offline(A);
    const wrongPool = await A.book({ slotId: IDS.slotOnline, patientId: P[0], patientPresent: true });
    const otherTenant = await A.book({ slotId: IDS.slotOtherTenant, patientId: P[0], patientPresent: true });
    // Same branch id, other tenant: the handler's branch filter matches, so only RLS can refuse it.
    const rlsOnly = await A.book({ slotId: IDS.slotTenantBInBranchA, patientId: P[0], patientPresent: true });
    A.goOnline();
    const { value: o1 } = await waitFor(() => A.outcome(wrongPool.commandId), { label: 'o1' });
    const { value: o2 } = await waitFor(() => A.outcome(otherTenant.commandId), { label: 'o2' });
    const { value: o3 } = await waitFor(() => A.outcome(rlsOnly.commandId), { label: 'o3' });
    check('server-authority', 'reception booking from the online pool rejected', o1.outcome === 'rejected' && JSON.parse(o1.outcome_detail).reason === 'pool_not_allowed', o1);
    check('server-authority', "booking a slot of another tenant and branch rejected (token scope)", o2.outcome === 'rejected' && JSON.parse(o2.outcome_detail).reason === 'slot_not_found', o2);
    check('server-authority', "booking a tenant B slot that carries branch A's id rejected (RLS alone)", o3.outcome === 'rejected' && JSON.parse(o3.outcome_detail).reason === 'slot_not_found', o3);
    await waitFor(async () => !(await A.db.getOptional('SELECT 1 FROM appointments WHERE id IN (?, ?, ?)', [wrongPool.appointmentId, otherTenant.appointmentId, rlsOnly.appointmentId])), { label: 'optimistic rows removed' });
    check('server-authority', 'rejected optimistic rows disappear from the device at the next checkpoint', true);
    // Idempotency: the same command uploaded again (e.g. the ack was lost) changes nothing.
    const [cmd] = await sql('SELECT id, type, user_id, device_time, payload FROM command_log WHERE outcome = $1 AND device_id = $2 LIMIT 1', ['accepted', IDS.deviceB]);
    const before = await sql('SELECT count(*)::int n FROM appointments');
    const replay = await post('/api/commands', { commands: [{ ...cmd, device_time: new Date(cmd.device_time).toISOString() }] }, { authorization: `Bearer ${B.state.token}` });
    const after = await sql('SELECT count(*)::int n FROM appointments');
    check('server-authority', 'replayed command returns the stored outcome and writes nothing', replay.body.results?.[0]?.replay === true && replay.body.results[0].outcome === 'accepted' && before[0].n === after[0].n, { replay: replay.body, before, after });
  });

  await run('api-down', async () => {
    // PowerSync is reachable, our API is not: a device with a queued command stops applying new checkpoints.
    A.cutApiOnly();
    const queued = await A.book({ slotId: IDS.slotReception2, patientId: P[1], patientPresent: false });
    const cloud = await post('/api/online/book', { tenant_id: IDS.tenantA, slot_id: IDS.slotOnline, patient_id: P[2] });
    await waitFor(() => B.db.getOptional('SELECT 1 FROM appointments WHERE id = ?', [cloud.body.appointment_id]), { label: 'B sees cloud booking' });
    await sleep(3000);
    const seenByA = await A.db.getOptional('SELECT 1 FROM appointments WHERE id = ?', [cloud.body.appointment_id]);
    check('api-down', 'FINDING: while its upload is blocked, device A does not receive a new cloud booking that device B already shows', !seenByA && A.db.currentStatus.connected, { seenByA, connected: A.db.currentStatus.connected });
    A.goOnline();
    const { ms } = await waitFor(() => A.db.getOptional('SELECT 1 FROM appointments WHERE id = ?', [cloud.body.appointment_id]), { label: 'A catches up' });
    timings['api-restored-to-catch-up'] = ms;
    const { value: o } = await waitFor(() => A.outcome(queued.commandId), { label: 'queued outcome' });
    check('api-down', 'when the API returns, the queued command is accepted and A catches up', o.outcome === 'accepted', o);
  });

  await run('read-audit', async () => {
    A.goOffline();
    await offline(A);
    const read = await A.openNote(IDS.note);
    const glass = await A.openNote(IDS.note, { breakGlass: true });
    check('read-audit', 'a medical note is readable offline from the local database', read.note?.body === 'Synthetic note body');
    await sleep(1500);
    A.goOnline();
    await waitFor(() => A.outcome(glass.commandId), { label: 'audit outcome' });
    const rows = await sql('SELECT action, actor_user_id, device_id, occurred_at, recorded_at FROM audit_log WHERE command_id = ANY($1) ORDER BY id', [[read.commandId, glass.commandId]]);
    const ok = rows.length === 2 && rows[0].action === 'read' && rows[1].action === 'break_glass_read'
      && rows.every((r) => r.device_id === IDS.deviceA && r.actor_user_id === IDS.user && new Date(r.recorded_at) - new Date(r.occurred_at) >= 1000);
    check('read-audit', 'both reads uploaded on reconnect with the device read time, actor and device', ok, rows);
    const tamper = await post('/api/spike/sql', { sql: 'UPDATE audit_log SET action = $1', params: ['x'] });
    check('read-audit', 'audit rows cannot be updated (append-only trigger)', tamper.status === 500 && /append-only/.test(tamper.body.error), tamper);
  });

  await run('process-kill', async () => {
    // SIGKILL only: the OS still flushes its cache. A real power cut is not simulated (see the report).
    const child = spawn(childExec, [path.join(here, 'power-loss-child.mjs'), dir, hexKey], { env: { ...process.env, ...childEnv }, stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    const exit = await new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
    const booked = JSON.parse(out.trim().split('\n').pop());
    check('process-kill', 'child process killed right after an offline booking', exit.code !== 0, exit);
    const C = await open('crash', IDS.deviceCrash);
    const pending = await C.pendingCommands();
    const row = await C.db.getOptional('SELECT status FROM appointments WHERE id = ?', [booked.appointmentId]);
    check('process-kill', 'after restart (reopening the encrypted file) the command is still queued and the local booking is still there', pending >= 1 && row?.status === 'booked', { pending, row });
    const writerSync = await C.db.writeLock((tx) => tx.get('PRAGMA synchronous'));
    check('process-kill', 'the writer connection runs with synchronous=FULL', writerSync.synchronous === 2, writerSync);
    await C.start();
    const { value: o } = await waitFor(() => C.outcome(booked.commandId), { label: 'crash outcome' });
    check('process-kill', 'the surviving command uploads on reconnect and is accepted', o.outcome === 'accepted', o);
    await C.close();
  });

  await run('encryption-at-rest', async () => {
    // Checked while the devices are open, so the WAL file exists.
    const file = dbPath(A);
    const wal = `${file}-wal`;
    const walSize = fs.existsSync(wal) ? fs.statSync(wal).size : 0;
    const header = fs.readFileSync(file).subarray(0, 16).toString('latin1');
    check('encryption-at-rest', 'database file has no SQLite plaintext header', header !== 'SQLite format 3\u0000', header);
    const plain = path.join(dir, 'control-plain.sqlite');
    const c = new Database(plain);
    c.exec("CREATE TABLE t (v text); INSERT INTO t VALUES ('Synthetic note body')");
    c.close();
    const contains = (f, s) => fs.existsSync(f) && fs.readFileSync(f).includes(Buffer.from(s));
    check('encryption-at-rest', 'control: the text search finds the note in an unencrypted file', contains(plain, 'Synthetic note body'));
    const leaks = ['Synthetic note body', 'Synthetic Patient'].filter((s) => [file, wal].some((f) => contains(f, s)));
    check('encryption-at-rest', 'the WAL is present and non-empty; no note or patient text in the database or the WAL', walSize > 0 && leaks.length === 0, { walSize, leaks });
  });

  await run('revocation', async () => {
    // 1. Revoked while online with nothing to upload: PowerSync keeps streaming until the token expires.
    await post('/api/spike/revoke', { device_id: IDS.deviceB });
    const late = await post('/api/online/book', { tenant_id: IDS.tenantA, slot_id: IDS.slotOnline2, patient_id: P[5] });
    const { value: streamed } = await waitFor(() => B.db.getOptional('SELECT 1 FROM appointments WHERE id = ?', [late.body.appointment_id]), { label: 'B still streams', timeout: 10000 });
    check('revocation', 'FINDING: a revoked device that only downloads still receives new data from PowerSync (no revocation list; stops at token expiry)', late.status === 201 && streamed && !B.state.revoked, { late, revoked: B.state.revoked });
    // 2. Its next upload (an offline read) is refused by the API; the device wipes itself.
    await B.openNote(IDS.note);
    await waitFor(async () => B.state.revoked && (await B.db.get('SELECT count(*) n FROM slots')).n === 0, { label: 'B wiped' });
    const left = await B.db.get('SELECT (SELECT count(*) FROM patients) + (SELECT count(*) FROM visit_notes) + (SELECT count(*) FROM appointments) n');
    check('revocation', 'after the API refuses it (403), the device wipes its replicated data', left.n === 0, left);
    const pending = await B.pendingCommands();
    const audits = await sql('SELECT count(*)::int n FROM audit_log WHERE device_id = $1', [IDS.deviceB]);
    check('revocation', 'FINDING: the pending read-audit command of the revoked device is lost (queue cleared, never uploaded)', pending === 0 && audits[0].n === 0, { pending, audits });
  });

  for (const d of devices) await d.close().catch(() => {});

  await run('encryption-keys', async () => {
    const file = dbPath(A);
    const tryOpen = (key) => {
      const db = new Database(file, { readonly: true });
      try {
        if (key) db.pragma(`hexkey='${key}'`);
        return db.prepare('SELECT count(*) n FROM ps_oplog').get().n;
      } catch (e) {
        return e.message;
      } finally {
        db.close();
      }
    };
    const noKey = tryOpen(null);
    const wrongKey = tryOpen('bb'.repeat(32));
    const rightKey = tryOpen(hexKey);
    check('encryption-keys', 'opening without the key or with a wrong key fails; the right key works', typeof noKey === 'string' && typeof wrongKey === 'string' && typeof rightKey === 'number', { noKey, wrongKey, rightKey });
    // The SDK's documented setup (key in initializeConnection): fine on a new file, fails on reopen.
    const docOpen = (name) => openDevice({ name, deviceId: IDS.deviceA, userId: IDS.user, dir, hexKey, documentedKeySetup: true });
    const first = await docOpen('documented-setup');
    const firstOk = (await first.db.get('SELECT count(*) n FROM ps_kv')).n >= 0;
    await first.close();
    let reopenError = null;
    try {
      const again = await docOpen('documented-setup');
      await again.db.get('SELECT count(*) n FROM ps_kv');
      await again.close();
    } catch (e) {
      reopenError = e.message;
    }
    check('encryption-keys', 'FINDING: the documented key setup creates a database but fails to reopen it ("file is not a database")', firstOk && /not a database/.test(reopenError ?? ''), { firstOk, reopenError });
    const reopened = await open('reception-a', IDS.deviceA);
    const slots = (await reopened.db.get('SELECT count(*) n FROM slots')).n;
    await reopened.close();
    check('encryption-keys', 'with the key set in the worker, a cleanly closed device database reopens with its data', slots === 9, { slots });
  });

  fs.mkdirSync(path.join(here, '..', 'out'), { recursive: true });
  const failed = results.filter((r) => !r.ok).length;
  const report = { label, runtime: process.versions, failed, passed: results.length - failed, timings, results };
  fs.writeFileSync(path.join(here, '..', 'out', `report-${label}.json`), JSON.stringify(report, null, 2));
  console.log(`\n${label}: ${results.length - failed} passed, ${failed} failed`);
  console.log('timings (ms):', JSON.stringify(timings));
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await runAll({ hexKey: 'a1'.repeat(32), label: 'node' });
  process.exit(report.failed ? 1 : 0);
}
