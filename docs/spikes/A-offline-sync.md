# Spike A — Offline sync (PowerSync, Electron, encrypted SQLite)

Date: 2026-10-09 · Branch: `spike/offline-sync` · Code: `spikes/offline-sync/` (throwaway) · Decision: [ADR 0021](../decisions/0021-sync-engine-confirmed-by-spike-a.md), which confirms and amends [ADR 0008](../decisions/0008-offline-first-clinic-and-sync.md)

## Verdict

**PowerSync, self-hosted, is confirmed as the sync engine.** Every scenario the roadmap asked for passed on the same code, in Node 24.21 (40 of 40 checks) and in Electron 44.4.3 (Node 24.21, main process; 42 of 42, with two extra `safeStorage` checks). Some parts of ADR 0008 need to change; ADR 0021 lists the amendments. The most important:
- the documented way to encrypt the database breaks when the file is reopened;
- a device with a command waiting to upload stops receiving new data;
- the sync service must bypass RLS;
- a revoked device loses its pending read audits.

## What was built

| Part | Choice | Version |
|---|---|---|
| Source database | PostgreSQL 17 in Docker, `wal_level=logical`, RLS forced on every table, publication `powersync` | `postgres:17` |
| Sync service | PowerSync Open Edition, unified mode, **bucket storage in PostgreSQL** (a second database on the same server; no MongoDB), Sync Streams (edition 3) | `journeyapps/powersync-service:1.26.1` |
| Auth | The spike API signs 5-minute EdDSA device tokens (`sub` = device id; claims `tenant_id`, `branch_id`, `device_id`); PowerSync reads the API's JWKS | `jose` 6.2.12 |
| API | Node HTTP server, connects as `shifa_app` (no BYPASSRLS), tenant context per transaction, Zod-validated command envelope, re-executes `BookAppointment` and `RecordAccessed` | `pg` 8.23.1, `zod` 4.6.5 |
| Client | `@powersync/node` in worker threads, SQLite3MultipleCiphers driver, Electron main process; the key is random and protected with `safeStorage` (DPAPI on Windows) | `@powersync/node` 1.1.0, `better-sqlite3-multiple-ciphers` 13.0.3 (SQLite 3.53.4), `electron` 44.4.3 |
| Network loss | A TCP proxy per device and upstream; "offline" drops every open socket and refuses new ones (the SDK sees a real failure, not a `disconnect()` call) | — |

**How commands travel:**
1. One local write transaction inserts the **optimistic row** into the synced table (for example `appointments`, status `booked`) **and** a row into an insert-only `commands` table.
2. The connector uploads only `commands` rows to `POST /api/commands` and drops the optimistic row writes.
3. The server re-runs the command and writes the real rows.
4. PowerSync's next checkpoint **replaces** the device's optimistic row with the server's state: accepted, moved or removed.

No business logic depends on a row write from a device.

Fixtures are synthetic. One tenant-B slot deliberately reuses tenant A's branch id, so the tests can show which protection stops it: the stream's tenant filter or RLS.

## Results

Run: `docker compose up -d`, `pnpm server`, then `pnpm scenarios` (Node) and `pnpm scenarios:electron` (Electron). Times are from the Electron run on the owner's Windows 11 PC, with everything on localhost.

| Scenario | What was shown | Result |
|---|---|---|
| First sync | Three devices sync their scope from empty: about 0.45 s for the first device, 30 to 60 ms for each of the others | Pass |
| Replication scope | A device of tenant B holds no row of tenant A, and the reverse. The stream's tenant filter **alone** excludes the tenant-B row that carries branch A's id | Pass |
| RLS and the sync service | With RLS forced, a replication role **without** BYPASSRLS sees 0 rows in a snapshot query. PowerSync's role (BYPASSRLS) sees all 11 slots | Pass (finding) |
| Cloud vs reception, patient present | Reception goes offline; a cloud booking takes the shared slot; reception books the same slot offline for a walk-in. On reconnect the server re-executes the command:<br>- the walk-in is booked;<br>- the cloud booking moves to `requested`, with a conflict record;<br>- alternatives come **only** from the online and shared pools;<br>- an outbox notice goes to the moved patient (ids and times only).<br>Device A sees the moved booking and device B sees the conflict. From reconnect to outcome on the device: about 0.45 s | Pass |
| Cloud vs reception, phone booking | Same, without the patient present. The reception booking reached the server second, so it becomes `requested` with a conflict. The device's optimistic `booked` row is replaced by the server's `requested` row | Pass |
| Two offline reception devices | A books first by its own clock and B books second; B reconnects first. B is accepted and A is adjusted into a conflict ("first to reach the server"); the alternatives come only from the reception and shared pools. Both devices converge to the same rows. A partial unique index guarantees one active booking per slot | Pass |
| Server authority | Rejected:<br>- a booking from the online pool (`pool_not_allowed`);<br>- a slot of another tenant and branch (`slot_not_found`, from token scope);<br>- a tenant-B slot carrying branch A's id (`slot_not_found`, which **only RLS** can produce, because the handler's branch filter matches).<br>The rejected optimistic rows disappear from the device at the next checkpoint | Pass |
| Idempotency | Uploading the same command again returns the stored outcome (`replay: true`) and writes nothing | Pass |
| Read audit offline | A note is read offline from the local database. A `read` and a `break_glass_read` audit command are queued and uploaded on reconnect, with the device read time (`occurred_at`), the server time (`recorded_at`) and the device. The actor is the user id **the device sent**; the spike does not verify it (ADR 0021 adds a per-user proof). An `UPDATE` on `audit_log` fails (append-only trigger) | Pass |
| API down, sync up | A device whose upload fails **receives no new checkpoint**: it did not show a new cloud booking that device B already showed, for as long as the API was unreachable. After the API came back, it caught up within about 0.1 to 0.6 s | Pass (finding) |
| Process kill | A child process books offline and is killed (`SIGKILL`, no close). After a restart (which reopens the encrypted file) the command is still queued and the optimistic row is still there; on reconnect the command is accepted. The writer runs with `synchronous=FULL`. **A real power cut was not simulated**: a process kill leaves the operating system's cache to be flushed | Pass |
| Encryption at rest | Checked while the devices are open:<br>- the file has no SQLite header;<br>- the WAL file exists and is not empty;<br>- neither file contains the note or patient text, which the same search finds in an unencrypted control file | Pass |
| Encryption keys | Opening without the key or with a wrong key fails; the right key works. The SDK's **documented** key setup creates a database but fails to reopen it (`file is not a database`). With the key set in the worker, a closed device database reopens with its data | Pass (finding) |
| Key storage (Electron) | The key file written by `safeStorage` does not contain the key in clear and decrypts back to the same key | Pass |
| Revocation | (1) A revoked device that only downloads **keeps receiving** new data from PowerSync, which has no revocation list (until its token expires, 5 minutes at most). (2) Its next upload is refused by the API (403); the client calls `disconnectAndClear()` and its tables are empty. Its pending read-audit command was **lost**: the queue was cleared and the command never uploaded | Pass (findings) |

## Findings

1. **The documented encryption setup fails on reopen.** The `@powersync/node` README sets the key in `initializeConnection`. But versions 1.1.0 and 1.1.1 run `SELECT powersync_update_hooks('install')` on the writer connection *before* that hook. A new, empty file opens fine; any reopen of an existing encrypted file fails. Workaround (proved): a custom worker that subclasses the driver and sets `PRAGMA hexkey` in its constructor (`spikes/offline-sync/client/encrypted.worker.mjs`). Report it upstream before Phase 1, and keep a test that reopens an encrypted database.
2. **A waiting upload freezes downloads.** PowerSync does not apply a new checkpoint while the upload queue has entries; this is how it stays consistent. So the command endpoint's availability decides how fresh a device's data is, and one command the server keeps failing would freeze that device for good. Rules in ADR 0021:
   - every command gets an outcome, and business refusals return 2xx;
   - a handler bug is recorded and can be re-run later;
   - only infrastructure failures make the device retry;
   - the UI shows "waiting to upload" separately from "offline".
3. **Rejected and adjusted commands need a home on the device.** At the next checkpoint the optimistic row simply goes away, and in the spike nothing tells the user. For bookings, the server keeps the moved booking as `requested`, so nothing is lost. For future clinical and money commands, a rejection would remove the user's work from the screen. ADR 0021 adds a local command journal and a "needs attention" list.
4. **The sync service must bypass RLS.** PowerSync's initial snapshot is a plain `SELECT`, which RLS filters to nothing; logical replication itself ignores RLS. The replication role therefore has `REPLICATION BYPASSRLS` with `SELECT` only. For data on devices, tenant isolation rests on the Sync Streams filters, so every stream query must filter on `auth.parameter('tenant_id')`; a convention test should enforce this. Its bucket storage holds copies of medical data and needs the same protections as the main database (ADR 0016).
5. **Revocation has two speeds and loses audits.** The API refuses a revoked device at once, but PowerSync keeps streaming to it until its token expires. `disconnectAndClear()` also drops every queued command, including read audits and any unsynced clinical or money work. ADR 0021 adds a limited audit-only upload path; what happens to the other pending commands is an owner question (Q14).
6. **The acting user is not proved.** The device token identifies the device; the user id inside a command is whatever the device sends. ADR 0021 requires a per-user proof from the PIN session, checked by the server.
7. **Durability setting.** The SDK leaves `synchronous=NORMAL`. The spike sets `FULL` on the writer. Only a real power-cut test on clinic hardware can confirm durability.
8. **Optimistic rows plus commands work as designed.** One local transaction holds the optimistic row and the command, and the server's checkpoint replaces the row. No local reconciliation code was needed. Write checkpoints need nothing custom, as long as the API commits a command's effects before it answers.
9. **Client types are SQLite types.** Booleans arrive as integers; timestamps, JSON and ids as text. `packages/contracts` needs codecs for the local side.
10. **Electron:** everything ran in the main process with worker threads. SQLite3MultipleCiphers is an N-API module with Windows prebuilds, so it needed no rebuild for Electron. Setup snag: when pnpm blocked build scripts on the first install, Electron's binary download did not run later; `node node_modules/electron/install.js` fixes it.
11. **Footprint and license:**
    - The PowerSync container used about 125 MiB of RAM at rest. Bucket storage in PostgreSQL removes MongoDB from the stack.
    - The PowerSync Service is FSL-1.1-ALv2. Self-hosting it for our own product is free; offering a competing sync service is not allowed. Each version becomes Apache-2.0 after two years. The client SDKs are Apache-2.0.

## Not covered (next steps or open)

- A real power cut on clinic hardware; clock skew and the hybrid logical clock; pre-allocated number ranges; schema and protocol versioning; app updates that wait for an empty queue.
- The per-user command proof, the local command journal, the audit-only path for revoked devices, and key slots per user (ADR 0021 design items).
- A replication scope by role (for example clinical data only for clinical roles) and on-demand subscription streams; the spike scoped by tenant and branch only.
- Volume and hardware: first sync and long offline periods (days, thousands of commands) on the pilot clinics' PCs (Q8).
- A network that disappears without a TCP reset (a stuck 4G router): how fast the SDK notices.
- Packaging with electron-builder (native modules outside the asar), the IPC layer between renderer and main process, and auto-update.
- Clinic connectivity heartbeats and freezing the shared pool while a clinic is offline (ADR 0009).
- PowerSync operations: backups and encryption of bucket storage, re-replication time after a sync-config change, monitoring.
