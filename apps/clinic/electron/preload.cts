// The renderer's only way into the main process (ADR 0021): one call, dispatched and checked by
// the main process (`identity/ipc.ts`). A sandboxed preload is CommonJS and may require only
// `electron`, so the channel's name is repeated here (`DEVICE_CHANNEL`, pinned by a test).
import electron = require('electron');

electron.contextBridge.exposeInMainWorld('vertexShifaDevice', {
  call: (method: string, input: unknown) =>
    electron.ipcRenderer.invoke('device:call', method, input),
});
