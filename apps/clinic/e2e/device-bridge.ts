import type { Page } from '@playwright/test';
import type { DeviceEvent } from '../electron/identity/bridge.js';
import { Installation } from '../electron/identity/installation.js';
import { handleDeviceCall } from '../electron/identity/ipc.js';
import { offline, type Transport } from '../electron/identity/server.js';
import { memoryStore, testPinCost, testProtector } from '../electron/identity/test-support.js';
import { trackActivity } from './settle.js';

/**
 * The desktop app's device bridge for the E2E, which runs the renderer in Chromium without
 * Electron: the main process's own `Installation` and call checks, in the test's process, with a
 * stand-in for `safeStorage`, a cheap Argon2id cost, a clock the test moves, and the main
 * process's own requests answered by the mocked API (`connect`) while the page is online. The
 * state lives here, so it outlasts reloads of the page as it outlasts reloads of the window.
 */
export type DeviceBridge = {
  installation: Installation;
  /** Moves the device clock by `ms` from the real time (negative: set back). */
  setClockOffset: (ms: number) => void;
  /** Where the main process's requests go: the mocked API's routes. */
  connect: (transport: Transport) => void;
  /** What the main process tells the renderer on its own, as `main.ts` sends it. */
  emit: (event: DeviceEvent) => Promise<void>;
};

export async function installDeviceBridge(page: Page): Promise<DeviceBridge> {
  // Before the page opens anything: `settled` waits for its requests and the bridge's calls.
  const working = await trackActivity(page);
  let offset = 0;
  /** The furthest the clock was moved forward: time that passed, for the monotonic clock. */
  let passed = 0;
  let server: Transport = offline;
  const emit = async (event: DeviceEvent) => {
    await page.evaluate(
      `window.vertexShifaDeviceEvent && window.vertexShifaDeviceEvent(${JSON.stringify(event)})`,
    );
  };
  const appInfo = { os: 'win32 10.0.26200', appVersion: '0.0.0-e2e' };
  const installation = new Installation(
    memoryStore(),
    testProtector(),
    () => new Date(Date.now() + offset),
    testPinCost,
    {
      // The page going offline (`context.setOffline`) takes the main process off the network too.
      server: async (request) => {
        const online = await page.evaluate('navigator.onLine').catch(() => true);
        if (online === false) throw new Error('Offline');
        return server(request);
      },
      appInfo,
      // Moving the clock forward stands for time passing; setting it back moves no monotonic time.
      monotonic: () => performance.now() + passed,
      onEvent: (event) => void emit(event).catch(() => undefined),
    },
  );
  await page.exposeFunction('vertexShifaDeviceE2e', (method: unknown, input: unknown) =>
    working(() => handleDeviceCall(installation, appInfo, method, input)),
  );
  // A string: the E2E is typed for Node, without the DOM's globals.
  await page.addInitScript(`
    const listeners = new Set();
    window.vertexShifaDeviceEvent = (event) => { for (const listener of listeners) listener(event); };
    window.vertexShifaDevice = {
      call: (method, input) => window.vertexShifaDeviceE2e(method, input),
      onEvent: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    };
  `);
  return {
    installation,
    setClockOffset: (ms) => {
      offset = ms;
      passed = Math.max(passed, ms);
    },
    connect: (transport) => {
      server = transport;
    },
    emit,
  };
}
