import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionNotConnectedError } from '../src/sessions/sessions.service.js';
import { FakeWhatsAppTransport } from '../src/transport/fake-transport.js';
import type { SessionEvents } from '../src/transport/whatsapp-transport.js';
import { CLINIC_PHONE, memoryCredentials, PATIENT_PHONE } from './credentials.js';
import { startGateway } from './gateway.js';

let gateway: Awaited<ReturnType<typeof startGateway>>;
// Lets the fake transport report its events: fake timers delay a timeout of 0 set during a tick by
// 1 ms.
const settle = () => vi.advanceTimersByTimeAsync(1);
const ignore: SessionEvents = {
  qr: () => {},
  open: () => {},
  close: () => {},
  message: () => {},
  receipt: () => {},
};

/** A session opened and linked by a QR scan, connected. */
async function linkedSession() {
  const id = randomUUID();
  const credentials = memoryCredentials();
  await gateway.sessions.open(id, credentials);
  await settle();
  await gateway.transport.scan(id, CLINIC_PHONE);
  await settle();
  return { id, credentials };
}

beforeEach(async () => {
  vi.useFakeTimers();
  gateway = await startGateway();
});
afterEach(async () => {
  await gateway.app.close();
  vi.useRealTimers();
});

describe('the gateway', () => {
  it('runs on the transport the config names', () => {
    expect(gateway.transport).toBeInstanceOf(FakeWhatsAppTransport);
  });
});

describe('a session', () => {
  it('links by QR code: linking, then connected after the restart WhatsApp asks for', async () => {
    const id = randomUUID();
    await gateway.sessions.open(id, memoryCredentials());
    await settle();
    expect(gateway.sessions.state(id)).toBe('linking');
    await gateway.transport.scan(id, CLINIC_PHONE);
    await settle();
    expect(gateway.sessions.state(id)).toBe('connected');
    expect(gateway.transport.isConnected(id)).toBe(true);
  });

  it('opens at once with stored credentials', async () => {
    const { credentials } = await linkedSession();
    const id = randomUUID();
    await gateway.sessions.open(id, credentials);
    await settle();
    expect(gateway.sessions.state(id)).toBe('connected');
  });

  it('refuses to open a session twice in one process', async () => {
    const { id, credentials } = await linkedSession();
    await expect(gateway.sessions.open(id, credentials)).rejects.toThrow('already open');
  });

  it('reconnects after a lost connection with backoff from 1 s, reset once it opens', async () => {
    const { id } = await linkedSession();
    const connect = vi.spyOn(gateway.transport, 'connect');

    gateway.transport.disconnect(id, 'connection_lost');
    expect(gateway.sessions.state(id)).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(999);
    expect(connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(1);

    // Lost again before it opened: the wait doubles.
    gateway.transport.disconnect(id, 'connection_lost');
    await vi.advanceTimersByTimeAsync(1999);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);
    await settle();
    expect(gateway.sessions.state(id)).toBe('connected');

    // Opened, so the next loss waits 1 s again.
    gateway.transport.disconnect(id, 'connection_lost');
    await vi.advanceTimersByTimeAsync(1000);
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('restarts at once only once before it opens; a repeated restart backs off', async () => {
    const { id } = await linkedSession();
    const connect = vi.spyOn(gateway.transport, 'connect');
    gateway.transport.disconnect(id, 'restart_required');
    expect(connect).toHaveBeenCalledTimes(1);
    gateway.transport.disconnect(id, 'restart_required');
    expect(gateway.sessions.state(id)).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(999);
    expect(connect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(connect).toHaveBeenCalledTimes(2);
    await settle();
    expect(gateway.sessions.state(id)).toBe('connected');

    // Opened, so the next restart is at once again.
    gateway.transport.disconnect(id, 'restart_required');
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('sends nothing while a restart reconnects, until the new connection opens', async () => {
    const { id } = await linkedSession();
    gateway.transport.disconnect(id, 'restart_required');
    await Promise.resolve();
    await expect(gateway.sending.sendText(id, PATIENT_PHONE, 'synthetic')).rejects.toThrow(
      SessionNotConnectedError,
    );
    await settle();
    await expect(gateway.sending.sendText(id, PATIENT_PHONE, 'synthetic')).resolves.toEqual({
      messageId: expect.any(String),
    });
  });

  it('retries with backoff when connecting fails', async () => {
    const id = randomUUID();
    const connect = vi
      .spyOn(gateway.transport, 'connect')
      .mockRejectedValueOnce(new Error('synthetic network failure'));
    await gateway.sessions.open(id, memoryCredentials());
    expect(gateway.sessions.state(id)).toBe('disconnected');
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(gateway.sessions.state(id)).toBe('linking');
  });

  it('stops in needs_relink when logged out and in banned when forbidden, never reconnecting', async () => {
    const loggedOut = await linkedSession();
    const banned = await linkedSession();
    const connect = vi.spyOn(gateway.transport, 'connect');
    gateway.transport.disconnect(loggedOut.id, 'logged_out');
    gateway.transport.disconnect(banned.id, 'forbidden');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(connect).not.toHaveBeenCalled();
    expect(gateway.sessions.state(loggedOut.id)).toBe('needs_relink');
    expect(gateway.sessions.state(banned.id)).toBe('banned');
    await expect(gateway.sending.sendText(banned.id, PATIENT_PHONE, 'synthetic')).rejects.toThrow(
      SessionNotConnectedError,
    );
  });

  it('lets go of a session another process took over and never reconnects it', async () => {
    const { id, credentials } = await linkedSession();
    const connect = vi.spyOn(gateway.transport, 'connect');
    // Another process connects the same session: WhatsApp replaces this process's connection.
    await gateway.transport.connect(id, credentials, ignore);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(gateway.sessions.state(id)).toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('ignores late events of a closed connection', async () => {
    const connect = vi.spyOn(gateway.transport, 'connect');
    const { id } = await linkedSession();
    expect(connect).toHaveBeenCalledTimes(2);
    const closed = connect.mock.calls[0]?.[2];
    closed?.close('forbidden');
    closed?.qr('fake-qr-late');
    expect(gateway.sessions.state(id)).toBe('connected');
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('closes every connection on shutdown and stops pending reconnects', async () => {
    const connected = await linkedSession();
    const waiting = await linkedSession();
    gateway.transport.disconnect(waiting.id, 'connection_lost');
    const connect = vi.spyOn(gateway.transport, 'connect');
    await gateway.app.close();
    expect(gateway.transport.isConnected(connected.id)).toBe(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(connect).not.toHaveBeenCalled();
    gateway = await startGateway();
  });
});

describe('sending', () => {
  it('sends through a connected session', async () => {
    const { id } = await linkedSession();
    const { messageId } = await gateway.sending.sendText(id, PATIENT_PHONE, 'synthetic reminder');
    expect(gateway.transport.sent).toEqual([
      { sessionId: id, messageId, to: PATIENT_PHONE, text: 'synthetic reminder' },
    ]);
  });

  it('refuses a session that is linking, disconnected or not run here', async () => {
    const linking = randomUUID();
    await gateway.sessions.open(linking, memoryCredentials());
    await settle();
    const lost = await linkedSession();
    gateway.transport.disconnect(lost.id, 'connection_lost');
    for (const id of [linking, lost.id, randomUUID()]) {
      await expect(gateway.sending.sendText(id, PATIENT_PHONE, 'synthetic')).rejects.toThrow(
        SessionNotConnectedError,
      );
    }
    expect(gateway.transport.sent).toEqual([]);
  });
});
