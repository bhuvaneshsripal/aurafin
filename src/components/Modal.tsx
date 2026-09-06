import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class for the modal panel. Defaults to 'max-w-md'
   *  — pass a wider one (e.g. 'max-w-xl') for forms with long text fields
   *  like the SIP fund search, which otherwise gets cramped. Ignored when
   *  `fullScreen` or `contentPanel` is set. */
  widthClassName?: string;
  /** Covers the entire viewport, including the sidebar and top bar —
   *  portaled straight to <body>. Used for flows that should feel like
   *  leaving the app entirely (e.g. onboarding-style wizards). */
  fullScreen?: boolean;
  /** Fills the working area only — below the (sticky) top bar and beside
   *  the sidebar on desktop, both of which stay visible and usable. Sits
   *  between a small centered dialog and `fullScreen`: good for longer
   *  forms (e.g. editing an asset) that want the room of a full page
   *  without hiding navigation. Ignored when `fullScreen` is set. */
  contentPanel?: boolean;
}

/** Shared by the fullScreen and contentPanel variants: header + scrollable
 *  body, closes on Escape in addition to the X button / backdrop. */
function PanelBody({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 sm:px-6 pt-[calc(env(safe-area-inset-top)+16px)] pb-4 shrink-0 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white tracking-tight">{title}</h3>
        <button
          onClick={onClose}
          className="keep-round tap-scale h-9 w-9 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">{children}</div>
    </>
  );
}

/** The `contentPanel` variant: fixed to the working area (below the sticky
 *  top bar, right of the sidebar on desktop) instead of the whole viewport.
 *  The top offset is measured from the top bar's actual rendered height
 *  (via its `#app-topbar` id) rather than assumed, so it stays correct if
 *  that bar's height ever changes — re-measured on resize too. */
function ContentPanel({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const topbar = document.getElementById('app-topbar');
      setTop(topbar ? topbar.getBoundingClientRect().bottom : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  return (
    <div
      className="animate-backdrop-in fixed left-0 right-0 md:left-60 bottom-[calc(56px_+_env(safe-area-inset-bottom))] md:bottom-0 z-50 bg-white dark:bg-slate-900 flex flex-col"
      style={{ top }}
    >
      <PanelBody title={title} onClose={onClose}>
        {children}
      </PanelBody>
    </div>
  );
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  widthClassName = 'max-w-md',
  fullScreen = false,
  contentPanel = false,
}: ModalProps) {
  // Escape closes whichever variant is open, same as the phone/PWA back
  // button already does via useModalBackClose at the call site.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (fullScreen) {
    // Portaled straight to <body>, escaping the `.app-scale` zoomed content
    // column (see index.css) that the rest of the page renders inside. Left
    // as a normal descendant, this would inherit that zoom and end up
    // smaller than the true viewport — visibly not covering the bottom nav,
    // which itself renders outside `.app-scale` at full size.
    return createPortal(
      <div className="animate-backdrop-in fixed inset-x-0 top-0 bottom-[calc(56px_+_env(safe-area-inset-bottom))] md:bottom-0 z-50 bg-white dark:bg-slate-900 flex flex-col">
        <PanelBody title={title} onClose={onClose}>
          {children}
        </PanelBody>
      </div>,
      document.body
    );
  }

  if (contentPanel) {
    // Same "escape .app-scale" reasoning as fullScreen above.
    return createPortal(<ContentPanel title={title} onClose={onClose}>{children}</ContentPanel>, document.body);
  }

  return (
    <div
      className="animate-backdrop-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] px-4"
      onClick={onClose}
    >
      <div
        className={`animate-menu-in bg-white dark:bg-slate-800 shadow-xl w-full ${widthClassName} max-h-[90vh] flex flex-col`}
        style={{ borderRadius: 'var(--radius-modal)', transformOrigin: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header stays outside the scroll area — pinned in place, and its
           padding is never eaten by the scrollbar (see body below). */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 className="text-[18px] font-semibold text-slate-900 dark:text-white tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="keep-round tap-scale h-8 w-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {/* Scroll lives on its own box, and scrollbar-gutter reserves the
           scrollbar's track whether or not it's actually showing. Without
           this, the browser's scrollbar carves into the right p-6 padding
           the moment content overflows, so right-aligned controls (e.g. a
           delete button) visually jump to the very edge and look clipped. */}
        <div className="px-6 pb-6 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
