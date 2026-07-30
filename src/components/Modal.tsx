import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class for the modal panel. Defaults to 'max-w-md'
   *  — pass a wider one (e.g. 'max-w-xl') for forms with long text fields
   *  like the SIP fund search, which otherwise gets cramped. */
  widthClassName?: string;
}

export default function Modal({ open, onClose, title, children, widthClassName = 'max-w-md' }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full ${widthClassName} p-6 max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
