import { useToastStore, type ToastTone } from '../store/toastStore';
import { useNetworkStore } from '../store/networkStore';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';

const TONE_CLASSES: Record<ToastTone, string> = {
  error: 'bg-red-600',
  success: 'bg-emerald-700',
  info: 'bg-slate-900',
};

function SwipeToast({ id, tone, message, edge }: { id: number; tone: ToastTone; message: string; edge: 'up' | 'down' }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const swipe = useSwipeDismiss(() => dismiss(id), edge);
  return (
    <button
      type="button"
      {...swipe.bind}
      style={swipe.style}
      onClick={() => { if (!swipe.wasDragged()) dismiss(id); }}
      className={`${swipe.flung ? '' : 'animate-backdrop-in'} select-none pointer-events-auto max-w-md w-full text-left text-sm font-medium text-white rounded-xl shadow-lg px-4 py-3 ${TONE_CLASSES[tone]}`}
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
            <SwipeToast key={t.id} id={t.id} tone={t.tone} message={t.message} edge="up" />
          ))}
        </div>
      )}
      {bottom.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-0 right-0 z-[71] flex flex-col items-center gap-2 px-4 pointer-events-none bottom-[calc(56px_+_env(safe-area-inset-bottom)_+_12px_+_var(--lift))] md:bottom-[calc(16px_+_var(--lift))]"
          style={{ ['--lift' as string]: `${lift}px` }}
        >
          {bottom.map((t) => (
            <SwipeToast key={t.id} id={t.id} tone={t.tone} message={t.message} edge="down" />
          ))}
        </div>
      )}
    </>
  );
}
