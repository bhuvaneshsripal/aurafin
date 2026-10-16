import { useToastStore, type ToastTone } from '../store/toastStore';

const TONE_CLASSES: Record<ToastTone, string> = {
  error: 'bg-red-600',
  success: 'bg-emerald-700',
  info: 'bg-slate-900',
};

/** Renders active toasts at the top of the screen, clear of the notch. Tap one to dismiss it. */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`animate-backdrop-in pointer-events-auto max-w-md w-full text-left text-sm font-medium text-white rounded-xl shadow-lg px-4 py-3 ${TONE_CLASSES[t.tone]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
