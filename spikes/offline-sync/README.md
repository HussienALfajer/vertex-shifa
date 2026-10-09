# Spike A — offline sync (throwaway)

Proves ADR 0008 with PowerSync self-hosted, PostgreSQL 17 and an encrypted SQLite client, in Node and in Electron. Findings: [`docs/spikes/A-offline-sync.md`](../../docs/spikes/A-offline-sync.md). Not product code; do not import from here.

## Run (Windows, Docker Desktop, Node 24, pnpm)

```bash
pnpm install
docker compose up -d
pnpm server
```

Then, in a second terminal:

```bash
pnpm scenarios
```

```bash
pnpm scenarios:electron
```

If Electron was skipped by pnpm's build-script approval, download its binary with `node node_modules/electron/install.js`. Reports go to `out/` and device databases to `.data/` (both git-ignored). Stop with `docker compose down -v`.

## Layout

| Path | What |
|---|---|
| `docker-compose.yaml`, `powersync/` | PostgreSQL 17 (logical WAL) and PowerSync 1.26.1 with PostgreSQL bucket storage and Sync Streams |
| `db/01-schema.sql` | Synthetic schema: slots with pools, appointments, conflicts, append-only `command_log` and `audit_log`, RLS |
| `server/` | API: device tokens (EdDSA, JWKS), `POST /api/commands` (re-executes commands), cloud booking, spike helpers |
| `client/` | Device: PowerSync database in an encrypted worker, command queue, TCP proxies that simulate network loss |
| `scenarios/` | All checks (`run.mjs`) and the power-loss child process |
| `electron/main.mjs` | Runs the same scenarios in Electron's main process with a `safeStorage`-protected key |
