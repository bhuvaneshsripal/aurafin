import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { ArrowRight, RefreshCw, X } from 'lucide-react';
import { useExitPresence } from '../hooks/useExitPresence';
import { hardRefresh } from '../utils/hardRefresh';
import { useUpdateStore } from '../store/updateStore';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** Four-point sparkle used in the notice's icon badge. */
function SparkleIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path
        d="M16 3c1 7 3.8 10.8 11 13-7.2 2.2-10 6-11 13-1-7-3.8-10.8-11-13 7.200-2.200 10-6 11-13Z"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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

  // Dismissing the banner doesn't clear the red dots: the update is still pending.
  const setUpdateAvailable = useUpdateStore((s) => s.setUpdateAvailable);
  useEffect(() => {
    if (needRefresh) setUpdateAvailable(true);
  }, [needRefresh, setUpdateAvailable]);

  const { mounted, closing } = useExitPresence(needRefresh, 180);
  // Swipe left / right / up to put the notice away.
  const swipe = useSwipeDismiss(() => setNeedRefresh(false), 'up');
  useEffect(() => {
    if (needRefresh) swipe.reset();
  }, [needRefresh, swipe.reset]); // eslint-disable-line react-hooks/exhaustive-deps

  // On phones the top bar and the index strip are pinned to the screen, so
  // the notice reserves its own height (--update-h) and they slide down by
  // that much instead of being covered. Cleared as soon as it unmounts.
  const wrapRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const el = wrapRef.current;
    if (!mounted || !el) {
      root.style.removeProperty('--update-h');
      return;
    }
    const measure = () => root.style.setProperty('--update-h', `${el.offsetHeight}px`);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty('--update-h');
    };
  }, [mounted]);

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
    <div
      ref={wrapRef}
      id="app-update-banner"
      className="max-md:fixed max-md:left-0 max-md:right-0 max-md:top-0 z-[35] bg-page px-3 sm:px-6 md:px-8 pt-[calc(env(safe-area-inset-top)_+_8px)] md:pt-3 pb-2"
    >
      <div
        role="status"
        aria-live="polite"
        {...swipe.bind}
        style={swipe.style}
        className={`select-none ${swipe.flung ? '' : closing ? 'animate-menu-out' : 'animate-dialog-in'} relative mx-auto w-full max-w-[600px] overflow-hidden flex items-center gap-3.5 sm:gap-4 rounded-[20px] bg-white dark:bg-[#1a1d1b] border border-[#e4ebe8] dark:border-white/10 pl-5 pr-3 py-3 shadow-[0_6px_22px_-8px_rgba(15,40,30,0.16)]`}
      >
        {/* Green accent bar on the left edge */}
        <span className="absolute inset-y-0 left-0 w-[5px] bg-[#0a9a4b]" aria-hidden />
        <span
          className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 text-[#0a9a4b]"
          aria-hidden
        >
          <SparkleIcon size={26} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight text-[#0b2420] dark:text-white">New AuraFin update</p>
          <p className="text-[12.5px] leading-snug text-[#5b6a80] dark:text-slate-400 mt-1">
            A faster, smoother experience of AURAFIN. is available
          </p>
        </div>
        <button
          type="button"
          disabled={updating}
          onClick={onUpdate}
          className="tap-scale shrink-0 inline-flex items-center gap-1.5 px-1 py-2 text-[14px] font-semibold text-[#0a9a4b] disabled:opacity-60"
        >
          {updating ? 'Updating…' : 'Update now'}
          {updating ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRight size={16} strokeWidth={2.25} />}
        </button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Dismiss"
          className="tap-scale shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-[#6b7a90] hover:text-[#0b2420] dark:hover:text-white transition-colors"
        >
          <X size={20} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
