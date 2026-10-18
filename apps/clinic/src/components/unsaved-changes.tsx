import { useBlocker } from '@tanstack/react-router';
import { UnsavedChangesDialog } from '@vertex-shifa/ui';
import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Asks before leaving a screen whose form has unsaved changes: in-app navigation (links, history
 * keys) shows the "Stay" / "Leave without saving" dialog; reloading or closing the window is
 * held by `beforeunload`, which the desktop app's main process turns into the same question.
 * Render `dialog` inside the screen. Call `allowLeaving` right before a navigation the form
 * itself starts after a save (the new values are saved, not lost).
 */
export function useUnsavedChangesGuard(dirty: boolean): {
  dialog: ReactNode;
  allowLeaving: () => void;
} {
  const { t } = useTranslation();
  const state = useRef({ dirty, released: false, mounted: false });
  state.current.dirty = dirty;
  // A screen that gives way to a redirect (`<Navigate>`) is gone before the redirect runs: its
  // layout cleanup runs first, so it no longer blocks a navigation it cannot ask about.
  useLayoutEffect(() => {
    state.current.mounted = true;
    return () => {
      state.current.mounted = false;
    };
  }, []);
  const blocks = () => state.current.mounted && state.current.dirty && !state.current.released;
  const blocker = useBlocker({
    shouldBlockFn: blocks,
    enableBeforeUnload: blocks,
    withResolver: true,
  });
  return {
    dialog: (
      <UnsavedChangesDialog
        open={blocker.status === 'blocked'}
        onStay={() => blocker.reset?.()}
        onLeave={() => blocker.proceed?.()}
        labels={{
          title: t('unsavedChanges.title'),
          description: t('unsavedChanges.description'),
          stay: t('unsavedChanges.stay'),
          leave: t('unsavedChanges.leave'),
        }}
      />
    ),
    allowLeaving: () => {
      state.current.released = true;
    },
  };
}
