// The renderer's only way into the main process (ADR 0021): one call, dispatched and checked by
// the main process (`identity/ipc.ts`), and the main process's events (`DeviceEvent`). A sandboxed
// preload is CommonJS and may require only `electron`, so the channels' names are repeated here
// (`DEVICE_CHANNEL`, `DEVICE_EVENT_CHANNEL`, pinned by a test).
import electron = require('electron');

electron.contextBridge.exposeInMainWorld('vertexShifaDevice', {
  call: (method: string, input: unknown) =>
    electron.ipcRenderer.invoke('device:call', method, input),
  onEvent: (listener: (event: unknown) => void) => {
    const forward = (_event: unknown, event: unknown) => listener(event);
    electron.ipcRenderer.on('device:event', forward);
    return () => {
      electron.ipcRenderer.off('device:event', forward);
    };
  },
});
