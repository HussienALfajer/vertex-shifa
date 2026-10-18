import { describe, expect, it } from 'vitest';
import { historyKeyStep } from './history-shortcuts';

const keys = { altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };

describe('history shortcuts', () => {
  it('go back on Alt+Left and forward on Alt+Right', () => {
    expect(historyKeyStep({ ...keys, key: 'ArrowLeft' })).toBe('back');
    expect(historyKeyStep({ ...keys, key: 'ArrowRight' })).toBe('forward');
  });

  it('ignore the arrows without Alt alone', () => {
    expect(historyKeyStep({ ...keys, altKey: false, key: 'ArrowLeft' })).toBeUndefined();
    expect(historyKeyStep({ ...keys, shiftKey: true, key: 'ArrowLeft' })).toBeUndefined();
    expect(historyKeyStep({ ...keys, key: 'ArrowUp' })).toBeUndefined();
  });
});
