import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { logoShape, markShape } from './logo-shapes';

function brandShape(file: string) {
  const source = readFileSync(
    new URL(`../../../../brand/logo/svg/${file}`, import.meta.url),
    'utf8',
  );
  return {
    viewBox: /viewBox="([^"]+)"/.exec(source)?.[1],
    d: /<path[^>]*\sd="([^"]+)"/.exec(source)?.[1],
  };
}

describe('logo shapes', () => {
  it('match the logo files in brand/logo/svg', () => {
    expect(logoShape).toEqual(brandShape('vertex-shifa-logo.svg'));
    expect(markShape).toEqual(brandShape('vertex-shifa-mark.svg'));
  });
});
