import type { MessageBoxSyncOptions } from 'electron';

/** The texts of the question, from `packages/i18n` (`common.unsavedChanges`). */
export interface UnsavedChangesTexts {
  title: string;
  description: string;
  stay: string;
  leave: string;
}

/**
 * The renderer holds `beforeunload` while a form has unsaved changes. Electron then cancels the
 * close or reload silently (`will-prevent-unload`), so the main process asks the question the
 * in-app dialog asks: staying is the default and what Escape picks. Returns whether to leave.
 */
export function confirmLeaving(
  texts: UnsavedChangesTexts,
  ask: (options: MessageBoxSyncOptions) => number,
): boolean {
  const buttons = [texts.stay, texts.leave];
  const choice = ask({
    type: 'question',
    buttons,
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: texts.title,
    message: texts.title,
    detail: texts.description,
  });
  return choice === 1;
}
