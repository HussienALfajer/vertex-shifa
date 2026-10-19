import type {
  DeviceBridgeWindow,
  DeviceCalls,
  DeviceErrorCode,
  DeviceEvent,
  DeviceMethod,
} from '../../electron/identity/bridge';
import { ApiError } from './api';

declare global {
  interface Window {
    /** The device bridge of the desktop app's preload (`electron/preload.cts`). */
    vertexShifaDevice?: DeviceBridgeWindow;
  }
}

/** A call the main process refused, by its code only. */
export class DeviceCallError extends Error {
  override readonly name = 'DeviceCallError';

  constructor(readonly code: DeviceErrorCode | 'UNAVAILABLE') {
    super(code);
  }
}

/** Whether the app runs in the desktop shell: the clinic system is the desktop app only (S02). */
export function hasDevice(): boolean {
  return typeof window !== 'undefined' && window.vertexShifaDevice !== undefined;
}

/**
 * One call of the device bridge; keys, PINs and refresh tokens stay in the main process. When the
 * main process's own request to the API was refused, the call throws that refusal as an
 * `ApiError`, as a request of the renderer would.
 */
export async function device<M extends DeviceMethod>(
  method: M,
  input: DeviceCalls[M]['input'],
): Promise<DeviceCalls[M]['output']> {
  const bridge = window.vertexShifaDevice;
  if (!bridge) throw new DeviceCallError('UNAVAILABLE');
  const result = await bridge.call(method, input);
  if (!result.ok) {
    if (result.code === 'REFUSED') throw new ApiError(result.refusal ?? 'INTERNAL_ERROR');
    throw new DeviceCallError(result.code);
  }
  return result.value as DeviceCalls[M]['output'];
}

/** Listens to what the main process says on its own; answers the call that stops listening. */
export function onDeviceEvent(listener: (event: DeviceEvent) => void): () => void {
  return window.vertexShifaDevice?.onEvent(listener) ?? (() => undefined);
}

export function deviceErrorCode(error: unknown): DeviceCallError['code'] | undefined {
  return error instanceof DeviceCallError ? error.code : undefined;
}

export type {
  AccessGrant,
  ChangePinResult,
  DeviceEvent,
  InstallationView,
  MemberView,
  RegistrationView,
  UnlockResult,
} from '../../electron/identity/bridge';
