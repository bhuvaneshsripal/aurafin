import { useEffect, useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { hardRefresh } from '../utils/hardRefresh';
import { useUpdateStore } from '../store/updateStore';
import { startUpdateChecks } from '../utils/updateChecks';

/** Small "Update" button for the login page's top bar. UpdateBanner only lives
 *  inside the signed-in shell, so signed-out visitors would never hear about a
 *  new deploy; this runs the same service-worker check and shows a compact
 *  pill (with a red dot) once a new version is waiting. Renders nothing when
 *  the app is up to date. */
export default function LoginUpdateButton() {
  const [updating, setUpdating] = useState(false);
  const [stale, setStale] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      cleanupRef.current?.();
      cleanupRef.current = startUpdateChecks(reg, () => setStale(true));
    },
  });

  // Stop polling when the login page goes away (the app shell starts its own).
  useEffect(
    () => () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    },
    []
  );

  const setUpdateAvailable = useUpdateStore((s) => s.setUpdateAvailable);
  const show = needRefresh || stale;
  useEffect(() => {
    if (show) setUpdateAvailable(true);
  }, [show, setUpdateAvailable]);

  if (!show) return null;

  const onUpdate = () => {
    setUpdating(true);
    if (needRefresh) void updateServiceWorker(true);
    window.setTimeout(() => {
      void hardRefresh().then((ok) => { if (!ok) setUpdating(false); });
    }, needRefresh ? 4000 : 0);
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
