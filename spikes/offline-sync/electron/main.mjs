// Runs the scenarios in Electron's main process (no window). The database key is random and stored
// on disk only encrypted by safeStorage (DPAPI on Windows, Keychain on macOS).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { app, safeStorage } from 'electron';

const here = path.dirname(fileURLToPath(import.meta.url));

function databaseKey() {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('safeStorage unavailable');
  const file = path.join(app.getPath('userData'), 'db-key.bin');
  if (fs.existsSync(file)) return { hexKey: safeStorage.decryptString(fs.readFileSync(file)), created: false, file };
  const hexKey = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, safeStorage.encryptString(hexKey));
  return { hexKey, created: true, file };
}

app.whenReady().then(async () => {
  let code = 1;
  try {
    const key = databaseKey();
    const onDisk = fs.readFileSync(key.file);
    console.log(`key ${key.created ? 'created' : 'loaded'} via safeStorage`);
    const extraChecks = [
      { scenario: 'electron-key', name: 'the stored key file does not contain the key in clear', ok: !onDisk.includes(Buffer.from(key.hexKey)), detail: { bytes: onDisk.length } },
      { scenario: 'electron-key', name: 'the key file decrypts back to the same key through safeStorage', ok: safeStorage.decryptString(onDisk) === key.hexKey, detail: { created: key.created } },
    ];
    const { runAll } = await import(path.join(here, '..', 'scenarios', 'run.mjs').replace(/\\/g, '/').replace(/^/, 'file:///'));
    const report = await runAll({
      hexKey: key.hexKey,
      label: 'electron',
      childExec: process.execPath,
      childEnv: { ELECTRON_RUN_AS_NODE: '1' },
      extraChecks,
    });
    code = report.failed ? 1 : 0;
  } catch (e) {
    console.error(e);
  }
  app.exit(code);
});
