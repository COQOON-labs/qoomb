import * as React from 'react';

import { cn } from '../utils/cn';

import { Button } from './Button';

// ── ConfirmDialog ─────────────────────────────────────────────────────────────
//
// Accessible confirmation dialog using the native <dialog> element.
// - Traps focus inside the dialog while open (browser default behaviour)
// - Blocks background interaction via backdrop
// - Keyboard-dismissable via Escape
// - Screen-reader friendly: role="alertdialog" + aria-modal + aria-labelledby
//
// Usage:
//   <ConfirmDialog
//     open={showConfirm}
//     title="Remove member?"
//     description="This cannot be undone."
//     confirmLabel="Remove"
//     variant="destructive"
//     onConfirm={handleRemove}
//     onCancel={() => setShowConfirm(false)}
//   />

export interface ConfirmDialogProps {
  /** Whether the dialog is currently visible. */
  open: boolean;
  /** Short title shown as the dialog heading. */
  title: string;
  /** Optional longer body text explaining the consequence. */
  description?: string;
  /** Label for the confirm (primary action) button. */
  confirmLabel: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Variant for the confirm button. Defaults to "destructive". */
  variant?: 'destructive' | 'primary';
  /** Called when the user confirms the action. */
  onConfirm: () => void;
  /** Called when the user cancels or dismisses the dialog. */
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  variant = 'destructive',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  // Keep the native dialog element in sync with the `open` prop
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  // Close on Escape (native dialog already handles this, but we must sync state)
  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => onCancel();
    dialog.addEventListener('cancel', handleClose);
    return () => dialog.removeEventListener('cancel', handleClose);
  }, [onCancel]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className={cn(
        'rounded-xl border border-border bg-background shadow-lg p-0 max-w-sm w-full',
        'backdrop:bg-black/50',
        // Reset browser default styles
        'open:flex open:flex-col'
      )}
    >
      <div className="p-6 flex flex-col gap-2">
        <h2 id={titleId} className="text-base font-bold text-foreground">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>

      <div className="flex justify-end gap-2 px-6 pb-6">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="button" variant={variant} size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
