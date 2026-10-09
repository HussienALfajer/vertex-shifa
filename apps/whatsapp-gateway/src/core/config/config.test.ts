import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('reads the transport', () => {
    expect(loadConfig({ WHATSAPP_TRANSPORT: 'fake' })).toEqual({ transport: 'fake' });
  });

  it('refuses a missing or unknown transport, naming the variable without its value', () => {
    expect(() => loadConfig({})).toThrow('Invalid gateway environment: WHATSAPP_TRANSPORT');
    const load = () => loadConfig({ WHATSAPP_TRANSPORT: 'secret-transport' });
    expect(load).toThrow('Invalid gateway environment: WHATSAPP_TRANSPORT');
    expect(load).not.toThrow(/secret-transport/);
  });
});
