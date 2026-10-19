import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Expo Router parses the app's links with query-string@7, which decodes with decode-uri-component@0.2.2.
// patches/decode-uri-component@0.2.2.patch carries 0.5.0's linear decoder into it (GHSA-vcc3-ghjq-m6fr):
// these checks run the copy the app bundles. pnpm-workspace.yaml ignores the advisory, so any other
// version in the tree, which the patch does not cover, fails here.
const fromRouter = createRequire(
  createRequire(import.meta.url).resolve('expo-router/package.json'),
);
const fromQueryString = createRequire(fromRouter.resolve('query-string'));
const decode = fromQueryString('decode-uri-component') as (encoded: string) => string;

describe('the decoder of Expo Router links', () => {
  it('is the only version installed', () => {
    const store = new URL('../../../node_modules/.pnpm/', import.meta.url);
    const copies = readdirSync(store).filter((name) => name.startsWith('decode-uri-component@'));
    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) expect(copy).toMatch(/^decode-uri-component@0\.2\.2(?:_|$)/);
  });

  it('decodes as before', () => {
    expect(decode('a+b%20c')).toBe('a b c');
    expect(decode('%E2%82%AC')).toBe('€');
    expect(decode('%C2%B5%')).toBe('µ%');
    expect(decode('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('decodes malformed input in linear time', () => {
    const started = performance.now();
    expect(decode('%80'.repeat(5000))).toBe('%80'.repeat(5000));
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
