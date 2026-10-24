import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { hardRefresh } from '../utils/hardRefresh';
import { useUpdateStore } from '../store/updateStore';

const CHECK_EVERY_MS = 5 * 60 * 1000;

/** Small "Update" button for the login page's top bar. UpdateBanner only lives
 *  inside the signed-in shell, so signed-out visitors would never hear about a
 *  new deploy; this runs the same service-worker check and shows a compact
 *  pill (with a red dot) once a new version is waiting. Renders nothing when
 *  the app is up to date. */
export default function LoginUpdateButton() {
  const [updating, setUpdating] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => {
        if (navigator.onLine === false) return;
        void reg.update().catch(() => {});
      };
      const onVisible = () => {
        if (document.visibilityState === 'visible') check();
      };
      const id = window.setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', check);
      cleanupRef.current = () => {
        window.clearInterval(id);
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', check);
      };
    },
  });

  // Stop polling when the login page goes away (the app shell starts its own).
  useEffect(() => () => cleanupRef.current?.(), []);

  const setUpdateAvailable = useUpdateStore((s) => s.setUpdateAvailable);
  useEffect(() => {
    if (needRefresh) setUpdateAvailable(true);
  }, [needRefresh, setUpdateAvailable]);

  if (!needRefresh) return null;

  const onUpdate = () => {
    setUpdating(true);
    void updateServiceWorker(true);
    window.setTimeout(() => {
      void hardRefresh().then((ok) => { if (!ok) setUpdating(false); });
    }, 4000);
  };

  return (
    <button
      type="button"
      disabled={updating}
      onClick={onUpdate}
      aria-label="New version available — update now"
      title="New version available"
      className="btn-press relative inline-flex items-center gap-1.5 rounded-full border border-brand-600 bg-brand-50 px-3 h-9 self-center text-[13px] font-semibold text-brand-700 disabled:opacity-60"
    >
      <RefreshCw size={14} className={updating ? 'animate-spin' : ''} />
      <span className="max-[380px]:hidden">{updating ? 'Updating…' : 'Update'}</span>
      {!updating && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900"
        />
      )}
    </button>
  );
}
