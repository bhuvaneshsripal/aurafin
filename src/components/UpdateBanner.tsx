import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { useExitPresence } from '../hooks/useExitPresence';
import { useUpdateStore } from '../store/updateStore';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';
import { fetchDeployedBuildId, startUpdateChecks } from '../utils/updateChecks';
import { hardRefresh } from '../utils/hardRefresh';

const DISMISSED_KEY = 'aurafin-dismissed-update';
function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

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
 *  Two buttons: "Update" installs it right here and reloads onto the page you are on (your data and
 *  login are untouched), and "Later" puts the notice away until a different build is deployed. The
 *  app checks for a new deploy every 10 seconds while it is on screen and immediately whenever it
 *  comes back to the foreground (see utils/updateChecks). */
export default function UpdateBanner() {
  // True as soon as the version ping sees a newer deploy, before the new service worker has finished installing.
  const [stale, setStale] = useState(false);
  // Which deployed build the notice is about, and which one the user already dismissed.
  // A dismissed notice stays away (even after a reload) until a *different* build is deployed.
  const [deployedId, setDeployedId] = useState<string | null>(null);
  const [idReady, setIdReady] = useState(false);
  const [dismissedId, setDismissedId] = useState<string | null>(readDismissed);
  const [updating, setUpdating] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const stopChecksRef = useRef<(() => void) | null>(null);
  const {
    needRefresh: [needRefresh],
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      stopChecksRef.current?.();
      stopChecksRef.current = startUpdateChecks(reg, (id) => {
        setDeployedId(id);
        setIdReady(true);
        setStale(true);
      });
    },
  });

  // Stop checking when the banner goes away (it starts again on the next mount).
  useEffect(
    () => () => {
      stopChecksRef.current?.();
      stopChecksRef.current = null;
    },
    []
  );

  // The service worker can report an update before the version ping does: look up the id.
  useEffect(() => {
    if (!needRefresh || idReady) return;
    let cancelled = false;
    void fetchDeployedBuildId().then((id) => {
      if (cancelled) return;
      if (id) setDeployedId(id);
      setIdReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [needRefresh, idReady]);

  // Dismissing the banner doesn't clear the red dots: the update is still pending.
  const setUpdateAvailable = useUpdateStore((s) => s.setUpdateAvailable);
  const pending = needRefresh || stale;
  const updateKey = deployedId ?? 'unknown';
  const show = pending && idReady && updateKey !== dismissedId;
  useEffect(() => {
    if (pending) setUpdateAvailable(true);
  }, [pending, setUpdateAvailable]);

  const dismiss = () => {
    setDismissedId(updateKey);
    try {
      localStorage.setItem(DISMISSED_KEY, updateKey);
    } catch {
      /* private mode: stays dismissed for this session only */
    }
  };
  const { mounted, closing } = useExitPresence(show, 180);
  // Swipe left / right / up to put the notice away.
  const swipe = useSwipeDismiss(dismiss, 'up');
  useEffect(() => {
    if (show) swipe.reset();
  }, [show, swipe.reset]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Installs the new version right from the notice and stays on the current page.
  const updateNow = () => {
    if (updating) return;
    setUpdating(true);
    setUpdateFailed(false);
    void hardRefresh({ keepPage: true }).then((ok) => {
      if (!ok) {
        setUpdating(false);
        setUpdateFailed(true); // offline / server unreachable: nothing was cleared, try again later
      }
    });
  };

  return (
    <>
    <div
      ref={wrapRef}
      id="app-update-banner"
      className="max-md:fixed max-md:left-0 max-md:right-0 max-md:top-0 md:sticky md:top-0 z-[35] bg-page px-3 sm:px-6 md:px-8 pt-[calc(env(safe-area-inset-top)_+_8px)] md:pt-3 pb-2"
    >
      <div
        role="status"
        aria-live="polite"
        {...swipe.bind}
        style={swipe.style}
        className={`select-none ${swipe.flung ? '' : closing ? 'animate-menu-out' : 'animate-dialog-in'} relative mx-auto w-full max-w-[600px] overflow-hidden flex items-center gap-3.5 sm:gap-4 rounded-[20px] bg-white dark:bg-[#0a0a0a] border border-[#e4ebe8] dark:border-white/10 pl-5 pr-3 py-3 shadow-[0_6px_22px_-8px_rgba(15,40,30,0.16)]`}
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
            {updateFailed ? "Couldn't update. Check your connection and try again." : 'A new version is ready.'}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={updateNow}
            disabled={updating}
            className="tap-scale inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-[#0a9a4b] px-4 sm:px-5 text-[13.5px] font-semibold text-white shadow-sm hover:bg-[#088a43] disabled:opacity-70 transition-colors"
          >
            {updating && <RefreshCw size={14} className="animate-spin" />}
            {updating ? 'Updating…' : 'Update'}
          </button>
          <button
            type="button"
            onClick={dismiss}
            disabled={updating}
            className="tap-scale inline-flex h-9 items-center justify-center rounded-full border border-[#d5e0db] dark:border-white/15 px-4 sm:px-5 text-[13.5px] font-semibold text-[#3d4b5f] dark:text-slate-200 hover:bg-[#f2f6f4] dark:hover:bg-white/5 disabled:opacity-60 transition-colors"
          >
            Later
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
