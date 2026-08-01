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
    <div className="animate-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] px-4">
      <div
        className={`animate-menu-in bg-white dark:bg-slate-800 shadow-xl w-full ${widthClassName} p-6 max-h-[90vh] overflow-y-auto`}
        style={{ borderRadius: 'var(--radius-modal)', transformOrigin: 'center' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="keep-round tap-scale h-8 w-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
