import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StateStore } from './installation.js';
import type { Protector } from './keys.js';

/**
 * The installation's state in one file, encrypted as a whole by the protector (the members' names
 * and phones are personal data). Written to a temporary file and renamed over the old one, so a
 * power cut leaves the old state or the new one, never half of either.
 */
export function stateFile(path: string, protector: Protector): StateStore {
  return {
    async read() {
      let sealed: Buffer;
      try {
        sealed = await readFile(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
      return protector.decrypt(sealed).toString('utf8');
    },
    async write(text) {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.tmp`;
      try {
        await writeFile(temporary, protector.encrypt(Buffer.from(text, 'utf8')), { flush: true });
        await rename(temporary, path);
      } catch (error) {
        await rm(temporary, { force: true });
        throw error;
      }
    },
  };
}
