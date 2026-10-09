import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveAppFile } from './app-protocol.js';

const root = resolve('/renderer');

describe('resolveAppFile', () => {
  it('serves a file of the renderer', () => {
    expect(resolveAppFile(root, 'app://clinic/assets/index-abc.js')).toBe(
      join(root, 'assets', 'index-abc.js'),
    );
  });

  it('serves index.html for the root and for client routes', () => {
    expect(resolveAppFile(root, 'app://clinic/')).toBe(join(root, 'index.html'));
    expect(resolveAppFile(root, 'app://clinic/patients/123')).toBe(join(root, 'index.html'));
  });

  it('refuses paths that leave the renderer', () => {
    expect(resolveAppFile(root, 'app://clinic/..%2F..%2Fsecret.txt')).toBeNull();
    expect(resolveAppFile(root, 'app://clinic/..%5C..%5Csecret.txt')).toBeNull();
    expect(resolveAppFile(root, 'app://clinic/assets%00.js')).toBeNull();
  });

  it('keeps dot segments inside the renderer, as the URL parser resolves them', () => {
    expect(resolveAppFile(root, 'app://clinic/%2e%2e/%2e%2e/secret.txt')).toBe(
      join(root, 'secret.txt'),
    );
  });

  it('refuses other hosts, schemes and malformed URLs', () => {
    expect(resolveAppFile(root, 'app://other/index.html')).toBeNull();
    expect(resolveAppFile(root, 'file:///renderer/index.html')).toBeNull();
    expect(resolveAppFile(root, 'app://clinic/%E0%A4%A.js')).toBeNull();
    expect(resolveAppFile(root, 'not a url')).toBeNull();
  });
});
