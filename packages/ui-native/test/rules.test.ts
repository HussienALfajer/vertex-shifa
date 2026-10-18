import { describe, expect, it } from 'vitest';
import { chainStep } from '../src/focus-chain.js';
import { parseSavedTheme, resolveScheme, themeStorageKey } from '../src/theme-preference.js';

describe('theme', () => {
  it('reads back a saved choice, or none', () => {
    expect(parseSavedTheme(null)).toBeNull();
    expect(parseSavedTheme('sepia')).toBeNull();
    expect(parseSavedTheme('dark')).toBe('dark');
  });

  it('draws the saved choice, or the system setting (light when it says nothing)', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme(null, 'dark')).toBe('dark');
    expect(resolveScheme(null, null)).toBe('light');
  });

  it('is stored under the key the web apps use', () => {
    expect(themeStorageKey).toBe('vertex-theme');
  });
});

describe('focus chain', () => {
  it('moves on with "next" and runs the primary action with "done" on the last field', () => {
    expect([0, 1, 2].map((index) => chainStep(index, 3))).toEqual([
      { returnKeyType: 'next', submitBehavior: 'submit', last: false },
      { returnKeyType: 'next', submitBehavior: 'submit', last: false },
      { returnKeyType: 'done', submitBehavior: 'blurAndSubmit', last: true },
    ]);
  });
});
