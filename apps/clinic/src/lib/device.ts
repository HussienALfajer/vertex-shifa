import type {
  DeviceBridgeWindow,
  DeviceCalls,
  DeviceErrorCode,
  DeviceMethod,
} from '../../electron/identity/bridge';

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

/** One call of the device bridge; keys and PINs stay in the main process. */
export async function device<M extends DeviceMethod>(
  method: M,
  input: DeviceCalls[M]['input'],
): Promise<DeviceCalls[M]['output']> {
  const bridge = window.vertexShifaDevice;
  if (!bridge) throw new DeviceCallError('UNAVAILABLE');
  const result = await bridge.call(method, input);
  if (!result.ok) throw new DeviceCallError(result.code);
  return result.value as DeviceCalls[M]['output'];
}

export function deviceErrorCode(error: unknown): DeviceCallError['code'] | undefined {
  return error instanceof DeviceCallError ? error.code : undefined;
}

export type {
  ChangePinResult,
  InstallationView,
  MemberView,
  RegistrationView,
  UnlockResult,
} from '../../electron/identity/bridge';
