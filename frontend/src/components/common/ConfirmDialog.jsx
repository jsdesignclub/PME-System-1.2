/**
 * A confirmation step for anything irreversible.
 *
 * Wraps `Modal` rather than reimplementing an overlay, so the focus trap and
 * Esc handling exist once. The one thing it adds is that Esc and the backdrop
 * do NOT dismiss it: a dialog whose whole purpose is "are you sure?" should
 * have an explicit answer, and letting a stray click mean "yes, delete it" is
 * the failure mode `ConfirmDialog` exists to prevent.
 *
 * Used by the duty-chart delete, which is a hard delete — unlike a user, a duty
 * row has no deactivation route.
 */
import { useState } from 'react';

import { Modal } from './Modal.jsx';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={title} onClose={busy ? () => {} : onCancel}>
      <p className="text-sm text-slate-700">{message}</p>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="rounded-btn border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={confirm}
          className={`rounded-btn px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
            destructive ? 'bg-danger hover:bg-danger-hover' : 'bg-brand hover:bg-brand-700'
          }`}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
