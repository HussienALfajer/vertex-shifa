import { release } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ar } from '@vertex-shifa/i18n';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  powerMonitor,
  protocol,
  safeStorage,
  session,
} from 'electron';
import {
  APP_ORIGIN,
  APP_SCHEME,
  connectOrigins,
  contentSecurityPolicy,
  resolveAppFile,
} from './app-protocol.js';
import { DEVICE_CHANNEL, DEVICE_EVENT_CHANNEL, type DeviceEvent } from './identity/bridge.js';
import { Installation } from './identity/installation.js';
import { handleDeviceCall } from './identity/ipc.js';
import type { Protector } from './identity/keys.js';
import { httpTransport } from './identity/server.js';
import { stateFile } from './identity/state-file.js';
import { devServerUrl, isAllowedNavigation } from './navigation.js';
import { sleepTracker } from './power.js';
import { confirmLeaving } from './unsaved-changes.js';

// The main process owns the installation's identity (S02: keys, PINs, registrations) and will own
// the local database and the sync client (ADR 0021); the renderer reaches them only through the
// device bridge (`preload.cts`). It opens one locked-down window on the renderer.

const rendererDir = fileURLToPath(new URL('../renderer/', import.meta.url));
const devServer = devServerUrl(process.argv, app.isPackaged);
const rendererOrigin = devServer ?? APP_ORIGIN;
// The API and map URLs are read at start from the variables the renderer was built with (Vite
// reads the same ones); S04's packaging bakes them in.
const contentSecurity = contentSecurityPolicy(connectOrigins(process.env));
/** The API the main process asks itself (sessions, registrations, enrollments: ADR 0021). */
const apiOrigin = connectOrigins({ VITE_API_URL: process.env.VITE_API_URL })[0];

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function serveRenderer(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const file = resolveAppFile(rendererDir, request.url);
    if (!file) return new Response(null, { status: 404 });
    const response = await net.fetch(pathToFileURL(file).toString()).catch(() => null);
    if (!response?.ok) return new Response(null, { status: 404 });
    const headers = new Headers(response.headers);
    headers.set('Content-Security-Policy', contentSecurity);
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, { status: 200, headers });
  });
}

/**
 * Electron `safeStorage`: DPAPI on Windows binds what it seals to the Windows account (ADR 0021).
 * Without a real keystore (Linux's `basic_text`), nothing is stored and the bridge refuses.
 */
function deviceProtector(): Protector | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
    return undefined;
  }
  return {
    encrypt: (plain) => safeStorage.encryptString(plain.toString('base64')),
    decrypt: (sealed) => Buffer.from(safeStorage.decryptString(sealed), 'base64'),
  };
}

/**
 * The device bridge: calls from the app's own renderer only, each checked by `handleDeviceCall`;
 * the main process's events (`DeviceEvent`) go to the window. When the computer wakes, the
 * offline window is checked at once and the renderer hears how long it slept (rule 25).
 */
function serveDeviceBridge(send: (event: DeviceEvent) => void): void {
  const protector = deviceProtector();
  const appInfo = { os: `${process.platform} ${release()}`, appVersion: app.getVersion() };
  const installation = protector
    ? new Installation(
        stateFile(join(app.getPath('userData'), 'identity', 'installation.bin'), protector),
        protector,
        undefined,
        undefined,
        {
          server: httpTransport(apiOrigin, (url, init) => net.fetch(url, init)),
          appInfo,
          onEvent: send,
        },
      )
    : undefined;
  ipcMain.handle(DEVICE_CHANNEL, (event, method: unknown, input: unknown) => {
    if (!isAllowedNavigation(event.senderFrame?.url ?? '', rendererOrigin)) {
      return { ok: false, code: 'INVALID_INPUT' };
    }
    if (!installation) return { ok: false, code: 'STORAGE_UNAVAILABLE' };
    return handleDeviceCall(installation, appInfo, method, input);
  });
  const sleep = sleepTracker({ wall: () => Date.now(), monotonic: () => performance.now() });
  powerMonitor.on('suspend', () => {
    sleep.suspended();
    send({ type: 'suspended' });
  });
  powerMonitor.on('resume', () => {
    send({ type: 'resumed', sleptMs: sleep.resumed() });
    void installation?.checkWindow().catch(() => undefined);
  });
}

function lockDownSession(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    // Every screen fits a phone's width (AGENTS.md "Responsive"): the window may be narrow.
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // The renderer's tools only on the dev server: in the built app they would let anyone at the
      // computer call the device bridge directly (ADR 0021).
      devTools: devServer !== null,
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, rendererOrigin)) event.preventDefault();
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url, rendererOrigin)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  // A form with unsaved changes holds `beforeunload`: closing or reloading asks first.
  window.webContents.on('will-prevent-unload', (event) => {
    const leave = confirmLeaving(ar.common.unsavedChanges, (options) =>
      dialog.showMessageBoxSync(window, options),
    );
    if (leave) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());

  void window.loadURL(`${rendererOrigin}/`);
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(() => {
    if (!devServer) Menu.setApplicationMenu(null);
    lockDownSession();
    serveRenderer();
    serveDeviceBridge((event) => {
      // Only to the app's own renderer, never to a page it was navigated away to.
      const contents = mainWindow?.webContents;
      if (contents && isAllowedNavigation(contents.getURL(), rendererOrigin)) {
        contents.send(DEVICE_EVENT_CHANNEL, event);
      }
    });
    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
}
