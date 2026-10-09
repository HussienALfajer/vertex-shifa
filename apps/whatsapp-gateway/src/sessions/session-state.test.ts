import { describe, expect, it } from 'vitest';
import { disconnectAction, reconnectDelay } from './session-state.js';

describe('disconnectAction', () => {
  it('follows the disconnect table of ADR 0022', () => {
    expect(disconnectAction('restart_required')).toEqual({ kind: 'reconnect_now' });
    expect(disconnectAction('logged_out')).toEqual({ kind: 'stop', state: 'needs_relink' });
    expect(disconnectAction('forbidden')).toEqual({ kind: 'stop', state: 'banned' });
    expect(disconnectAction('connection_replaced')).toEqual({ kind: 'release' });
    expect(disconnectAction('connection_lost')).toEqual({
      kind: 'reconnect_later',
      state: 'disconnected',
    });
  });
});

describe('reconnectDelay', () => {
  it('starts at 1 s and doubles up to 60 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(reconnectDelay)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ]);
  });
});
