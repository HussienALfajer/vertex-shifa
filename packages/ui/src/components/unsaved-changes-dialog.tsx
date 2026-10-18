'use client';

import { useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';
import { Button } from './button';

interface UnsavedChangesDialogProps {
  open: boolean;
  /** Close the dialog and keep the form as it is. */
  onStay: () => void;
  /** Go where the user was going; the changes are lost. */
  onLeave: () => void;
  labels: { title: string; description: string; stay: string; leave: string };
}

/**
 * Asked when the user leaves a screen whose form has unsaved changes. Staying is the default:
 * it has the focus, and Escape stays.
 */
function UnsavedChangesDialog({ open, onStay, onLeave, labels }: UnsavedChangesDialogProps) {
  const stay = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent data-slot="unsaved-changes-dialog" initialFocus={stay}>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.title}</AlertDialogTitle>
          <AlertDialogDescription>{labels.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onLeave}>
            {labels.leave}
          </Button>
          <Button ref={stay} onClick={onStay}>
            {labels.stay}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { UnsavedChangesDialog, type UnsavedChangesDialogProps };
