import { fileURLToPath, pathToFileURL } from 'node:url';
import { ar } from '@vertex-shifa/i18n';
import { app, BrowserWindow, dialog, net, protocol, session } from 'electron';
import {
  APP_ORIGIN,
  APP_SCHEME,
  connectOrigins,
  contentSecurityPolicy,
  resolveAppFile,
} from './app-protocol.js';
import { devServerUrl, isAllowedNavigation } from './navigation.js';
import { confirmLeaving } from './unsaved-changes.js';

// The main process will own the local database and the sync client (ADR 0021); the renderer
// reaches them only through IPC. Today it opens one locked-down window on the renderer.

const rendererDir = fileURLToPath(new URL('../renderer/', import.meta.url));
const devServer = devServerUrl(process.argv, app.isPackaged);
const rendererOrigin = devServer ?? APP_ORIGIN;
// The API and map URLs are read at start from the variables the renderer was built with (Vite
// reads the same ones); S04's packaging bakes them in.
const contentSecurity = contentSecurityPolicy(connectOrigins(process.env));

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
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
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
    lockDownSession();
    serveRenderer();
    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
}
