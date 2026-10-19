import type { Page } from '@playwright/test';
import { Installation } from '../electron/identity/installation.js';
import { handleDeviceCall } from '../electron/identity/ipc.js';
import { memoryStore, testPinCost, testProtector } from '../electron/identity/test-support.js';

/**
 * The desktop app's device bridge for the E2E, which runs the renderer in Chromium without
 * Electron: the main process's own `Installation` and call checks, in the test's process, with a
 * stand-in for `safeStorage`, a cheap Argon2id cost and a clock the test moves. The state lives
 * here, so it outlasts reloads of the page as it outlasts reloads of the window.
 */
export type DeviceBridge = {
  installation: Installation;
  /** Moves the device clock by `ms` from the real time (negative: set back). */
  setClockOffset: (ms: number) => void;
};

export async function installDeviceBridge(page: Page): Promise<DeviceBridge> {
  let offset = 0;
  const installation = new Installation(
    memoryStore(),
    testProtector(),
    () => new Date(Date.now() + offset),
    testPinCost,
  );
  const appInfo = { os: 'win32 10.0.26200', appVersion: '0.0.0-e2e' };
  await page.exposeFunction('vertexShifaDeviceE2e', (method: unknown, input: unknown) =>
    handleDeviceCall(installation, appInfo, method, input),
  );
  // A string: the E2E is typed for Node, without the DOM's globals.
  await page.addInitScript(
    'window.vertexShifaDevice = { call: (method, input) => window.vertexShifaDeviceE2e(method, input) };',
  );
  return {
    installation,
    setClockOffset: (ms) => {
      offset = ms;
    },
  };
}
