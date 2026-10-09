import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLINIC_PHONE, memoryCredentials, PATIENT_PHONE } from '../../test/credentials.js';
import { FakeWhatsAppTransport } from './fake-transport.js';
import type { SessionEvents } from './whatsapp-transport.js';

function recorder() {
  const seen: unknown[][] = [];
  const events: SessionEvents = {
    qr: (code) => seen.push(['qr', code]),
    open: (account) => seen.push(['open', account]),
    close: (reason) => seen.push(['close', reason]),
    message: (message) => seen.push(['message', message.id]),
    receipt: (receipt) => seen.push(['receipt', receipt.status]),
  };
  return { seen, events };
}

describe('FakeWhatsAppTransport', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports events only after connect resolves: a QR code for a new session', async () => {
    const transport = new FakeWhatsAppTransport();
    const { seen, events } = recorder();
    await transport.connect('s1', memoryCredentials(), events);
    expect(seen).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([['qr', 'fake-qr-1']]);
  });

  it('links on a scan by storing the account and restarting, then opens with it', async () => {
    const transport = new FakeWhatsAppTransport();
    const credentials = memoryCredentials();
    const first = recorder();
    await transport.connect('s1', credentials, first.events);
    await vi.advanceTimersByTimeAsync(0);
    await transport.scan('s1', CLINIC_PHONE);
    expect(first.seen.at(-1)).toEqual(['close', 'restart_required']);
    expect(transport.isConnected('s1')).toBe(false);

    const second = recorder();
    await transport.connect('s1', credentials, second.events);
    await vi.advanceTimersByTimeAsync(0);
    expect(second.seen).toEqual([['open', { phone: CLINIC_PHONE }]]);
  });

  it('replaces a session’s connection when it connects again, like WhatsApp’s 440', async () => {
    const transport = new FakeWhatsAppTransport();
    const credentials = memoryCredentials();
    const first = recorder();
    const old = await transport.connect('s1', credentials, first.events);
    await transport.connect('s1', credentials, recorder().events);
    expect(first.seen).toEqual([['close', 'connection_replaced']]);
    await expect(old.sendText(PATIENT_PHONE, 'synthetic')).rejects.toThrow('closed');
    expect(transport.isConnected('s1')).toBe(true);
  });

  it('records what an open connection sends and refuses to send once closed', async () => {
    const transport = new FakeWhatsAppTransport();
    const connection = await transport.connect('s1', memoryCredentials(), recorder().events);
    expect(await connection.sendText(PATIENT_PHONE, 'synthetic reminder')).toEqual({
      messageId: 'fake-message-1',
    });
    expect(transport.sent).toEqual([
      {
        sessionId: 's1',
        messageId: 'fake-message-1',
        to: PATIENT_PHONE,
        text: 'synthetic reminder',
      },
    ]);
    await connection.close();
    expect(transport.isConnected('s1')).toBe(false);
    await expect(connection.sendText(PATIENT_PHONE, 'synthetic')).rejects.toThrow('closed');
  });

  it('delivers messages, receipts and disconnects to the open connection', async () => {
    const transport = new FakeWhatsAppTransport();
    const { seen, events } = recorder();
    await transport.connect('s1', memoryCredentials(), events);
    transport.receive('s1', {
      id: 'm1',
      from: PATIENT_PHONE,
      text: 'synthetic',
      sentAt: new Date(),
    });
    transport.acknowledge('s1', { messageId: 'fake-message-1', status: 'read', at: new Date() });
    transport.disconnect('s1', 'connection_lost');
    expect(seen).toEqual([
      ['message', 'm1'],
      ['receipt', 'read'],
      ['close', 'connection_lost'],
    ]);
    expect(() => transport.disconnect('s1', 'connection_lost')).toThrow('no open connection');
  });
});
