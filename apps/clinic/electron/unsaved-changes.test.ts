import { ar } from '@vertex-shifa/i18n';
import type { MessageBoxSyncOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { confirmLeaving } from './unsaved-changes.js';

const texts = ar.common.unsavedChanges;

describe('closing or reloading with unsaved changes', () => {
  it('asks with "Stay" as the default and the cancel choice', () => {
    let asked: MessageBoxSyncOptions | undefined;
    confirmLeaving(texts, (options: MessageBoxSyncOptions) => {
      asked = options;
      return 0;
    });
    expect(asked?.buttons).toEqual([texts.stay, texts.leave]);
    expect(asked?.defaultId).toBe(0);
    expect(asked?.cancelId).toBe(0);
    expect(asked?.detail).toBe(texts.description);
  });

  it('leaves only on "Leave without saving"', () => {
    expect(confirmLeaving(texts, () => 0)).toBe(false);
    expect(confirmLeaving(texts, () => 1)).toBe(true);
  });
});
