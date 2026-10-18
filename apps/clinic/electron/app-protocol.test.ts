import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { connectOrigins, contentSecurityPolicy, resolveAppFile } from './app-protocol.js';

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

describe('contentSecurityPolicy', () => {
  it('allows only the app itself without a map server', () => {
    const policy = contentSecurityPolicy([]);
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toContain("worker-src 'self';");
    expect(policy).not.toContain('blob:');
    expect(policy).not.toContain('unsafe');
  });

  it('adds the map origins to connect-src only', () => {
    const policy = contentSecurityPolicy(['https://maps.example.test']);
    expect(policy).toContain("connect-src 'self' https://maps.example.test;");
    expect(policy.match(/maps\.example\.test/g)).toHaveLength(1);
  });
});

describe('connectOrigins', () => {
  it('takes the origin of each configured map URL once', () => {
    expect(
      connectOrigins({
        VITE_MAP_STYLE_URL: 'https://maps.example.test/style.json',
        VITE_MAP_TILES_URL: 'https://tiles.example.test/syria.pmtiles',
        VITE_MAP_GLYPHS_URL: 'https://maps.example.test/fonts/{fontstack}/{range}.pbf',
      }),
    ).toEqual(['https://maps.example.test', 'https://tiles.example.test']);
  });

  it('takes the API origin, without its path', () => {
    expect(connectOrigins({ VITE_API_URL: 'https://api.example.test/' })).toEqual([
      'https://api.example.test',
    ]);
    expect(connectOrigins({ VITE_API_URL: 'http://127.0.0.1:3000' })).toEqual([
      'http://127.0.0.1:3000',
    ]);
    expect(connectOrigins({ VITE_API_URL: 'http://api.example.test' })).toEqual([]);
  });

  it('allows plain HTTP on the loopback interface only, for the local extract', () => {
    expect(connectOrigins({ VITE_MAP_TILES_URL: 'http://localhost:8080/azaz.pmtiles' })).toEqual([
      'http://localhost:8080',
    ]);
    expect(connectOrigins({ VITE_MAP_TILES_URL: 'http://maps.example.test/azaz.pmtiles' })).toEqual(
      [],
    );
  });

  it('refuses hosts that would widen or break the policy', () => {
    expect(
      connectOrigins({
        VITE_MAP_STYLE_URL: 'https://*/style.json',
        VITE_MAP_TILES_URL: 'https://maps.example.test;sandbox/x.pmtiles',
        VITE_MAP_GLYPHS_URL: 'https://maps.example.test%3Bsandbox/{fontstack}/{range}.pbf',
      }),
    ).toEqual([]);
    expect(
      connectOrigins({ VITE_MAP_STYLE_URL: 'https://MAPS.Example.test:8443/style.json' }),
    ).toEqual(['https://maps.example.test:8443']);
  });

  it('ignores unset, malformed, credentialed and non-HTTP URLs', () => {
    expect(connectOrigins({})).toEqual([]);
    expect(
      connectOrigins({
        VITE_MAP_STYLE_URL: 'not a url',
        VITE_MAP_TILES_URL: 'https://user:secret@maps.example.test/x.pmtiles',
        VITE_MAP_GLYPHS_URL: "javascript:alert('x')",
      }),
    ).toEqual([]);
  });
});
