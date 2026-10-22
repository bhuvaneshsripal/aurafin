import { useToastStore, type ToastTone } from '../store/toastStore';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';

const TONE_CLASSES: Record<ToastTone, string> = {
  error: 'bg-red-600',
  success: 'bg-emerald-700',
  info: 'bg-slate-900',
};

function SwipeToast({ id, tone, message }: { id: number; tone: ToastTone; message: string }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const swipe = useSwipeDismiss(() => dismiss(id), 'up');
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

/** Renders active toasts at the top of the screen, clear of the notch. Tap one, or swipe it left, right or up, to dismiss it. */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      {toasts.map((t) => (
        <SwipeToast key={t.id} id={t.id} tone={t.tone} message={t.message} />
      ))}
    </div>
  );
}
