import { useToastStore, type Toast, type ToastTone } from '../store/toastStore';
import { useNetworkStore } from '../store/networkStore';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';

const TONE_CLASSES: Record<ToastTone, string> = {
  error: 'bg-red-600',
  success: 'bg-emerald-700',
  info: 'bg-[#171717] dark:bg-[#232321] dark:border dark:border-white/10',
};

function SwipeToast({ id, tone, message, edge, action }: { id: number; tone: ToastTone; message: string; edge: 'up' | 'down'; action?: Toast['action'] }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const swipe = useSwipeDismiss(() => dismiss(id), edge);
  const base = `${swipe.flung ? '' : 'animate-backdrop-in'} select-none pointer-events-auto max-w-md w-full text-left text-sm font-medium text-white rounded-xl shadow-lg px-4 py-3 ${TONE_CLASSES[tone]}`;
  if (action) {
    // Message + action button side by side; the whole bar still swipes away.
    return (
      <div {...swipe.bind} style={swipe.style} className={`${base} flex items-center justify-between gap-4`}>
        <span className="min-w-0">{message}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
            dismiss(id);
          }}
          className="shrink-0 rounded-md px-1 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-[#7fd9a8] hover:text-white"
        >
          {action.label}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      {...swipe.bind}
      style={swipe.style}
      onClick={() => { if (!swipe.wasDragged()) dismiss(id); }}
      className={base}
    >
      {message}
    </button>
  );
}

/** Renders active toasts. Top ones sit clear of the notch; bottom ones sit
 *  above the nav bar (and above the network banner while that is showing).
 *  Tap one, or swipe it away, to dismiss it. */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const quality = useNetworkStore((s) => s.quality);

  if (toasts.length === 0) return null;
  const top = toasts.filter((t) => t.placement === 'top');
  const bottom = toasts.filter((t) => t.placement === 'bottom');
  // The network banner lives in the same bottom slot; stack above it.
  const lift = quality !== 'good' ? 84 : 0;

  return (
    <>
      {top.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          {top.map((t) => (
            <SwipeToast key={t.id} id={t.id} tone={t.tone} message={t.message} edge="up" action={t.action} />
          ))}
        </div>
      )}
      {bottom.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-0 right-0 z-[71] flex flex-col items-center gap-2 px-4 pointer-events-none bottom-[calc(80px_+_env(safe-area-inset-bottom)_+_12px_+_var(--lift))] md:bottom-[calc(16px_+_var(--lift))]"
          style={{ ['--lift' as string]: `${lift}px` }}
        >
          {bottom.map((t) => (
            <SwipeToast key={t.id} id={t.id} tone={t.tone} message={t.message} edge="down" action={t.action} />
          ))}
        </div>
      )}
    </>
  );
}
