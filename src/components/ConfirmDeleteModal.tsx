import type { ReactNode } from 'react';
import Modal from './Modal';

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  busy?: boolean;
}

/** Shared confirmation dialog for any delete/remove action in the app.
 *  Confirm button uses the app's brand green (same green as the Add
 *  button), matching the rest of the app's destructive actions, which
 *  use green rather than red. */
export default function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title = 'Delete this?',
  description = "This can't be undone.",
  confirmLabel = 'Delete',
  busy = false,
}: ConfirmDeleteModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">{description}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-medium"
        >
          {busy ? 'Deleting...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
