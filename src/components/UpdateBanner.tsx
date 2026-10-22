import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, Sparkles, X } from 'lucide-react';
import { useExitPresence } from '../hooks/useExitPresence';
import { hardRefresh } from '../utils/hardRefresh';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** Top notice shown when a newer version of the app has been deployed.
 *  The new service worker installs in the background and waits; tapping
 *  "Update" activates it and reloads, so nothing changes under the user
 *  mid-task. The app re-checks for a new deploy every few minutes and
 *  whenever the tab/app comes back to the foreground. */
export default function UpdateBanner() {
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine === false) return;
        void reg.update().catch(() => {});
      };
      window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);
    },
  });

  const { mounted, closing } = useExitPresence(needRefresh, 180);
  if (!mounted) return null;

  const onUpdate = () => {
    setUpdating(true);
    // Normally the page reloads as soon as the new worker takes over. If
    // that doesn't happen, fall back to a full cache-clearing refresh.
    void updateServiceWorker(true);
    window.setTimeout(() => {
      void hardRefresh().then((ok) => { if (!ok) setUpdating(false); });
    }, 4000);
  };

  return (
    <div className="fixed left-0 right-0 top-0 z-[80] flex justify-center px-3 pointer-events-none pt-[calc(env(safe-area-inset-top)_+_8px)]">
      <div
        role="status"
        aria-live="polite"
        className={`${closing ? 'animate-menu-out' : 'animate-dialog-in'} pointer-events-auto w-full max-w-md flex items-center gap-3 rounded-2xl px-4 py-3 bg-[#1b1d23] text-white border border-white/5 shadow-lg`}
      >
        <span className="shrink-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-600/20 text-emerald-400" aria-hidden>
          <Sparkles size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Update available</p>
          <p className="text-xs text-slate-400 mt-0.5">A new version of Aurafin is ready.</p>
        </div>
        <button
          type="button"
          disabled={updating}
          onClick={onUpdate}
          className="tap-scale shrink-0 inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <RefreshCw size={14} className={updating ? 'animate-spin' : ''} />
          {updating ? 'Updating…' : 'Update'}
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
          className="tap-scale shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
