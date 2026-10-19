import { onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

/**
 * Whether the browser is online, as TanStack Query sees it (the `online` and `offline` events).
 * The console needs the API for everything: offline, saving is disabled and nothing is queued.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  );
}
