import { useRouter } from '@tanstack/react-router';
import { useEffect } from 'react';

type Step = 'back' | 'forward';

/**
 * The browser's history keys, which the desktop app lacks: Alt+Left goes back and Alt+Right
 * forward, as in every browser whatever the text direction.
 */
export function historyKeyStep(event: {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): Step | undefined {
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined;
  if (event.key === 'ArrowLeft') return 'back';
  if (event.key === 'ArrowRight') return 'forward';
  return undefined;
}

/**
 * Back and forward through the app's history from the keyboard. A screen with unsaved changes
 * still asks first: the router's blocker sees these as any other navigation.
 */
export function useHistoryShortcuts(): void {
  const router = useRouter();
  useEffect(() => {
    const go = (step: Step | undefined, event: Event) => {
      if (!step) return;
      event.preventDefault();
      if (step === 'back') router.history.back();
      else router.history.forward();
    };
    const onKeyDown = (event: KeyboardEvent) => go(historyKeyStep(event), event);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router]);
}
