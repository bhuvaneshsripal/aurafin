import { useEffect, useRef, useState } from 'react';
import { hardRefresh } from '../utils/hardRefresh';

/**
 * The Aurafin coin logo. Flips like a coin every 4s as a subtle brand
 * flourish, and clicking/tapping it flips it once more and then triggers a
 * hard refresh of the app (clears cached prices + service worker, reloads).
 * Each flip bumps `spinKey`; keying the <img> on it remounts the element so
 * the CSS animation restarts cleanly.
 */
export default function AppLogo({ className }: { className?: string }) {
  const [spinKey, setSpinKey] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const refreshing = useRef(false);

  useEffect(() => {
    intervalRef.current = window.setInterval(() => {
      setSpinKey((k) => k + 1);
    }, 4000);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        // Ignore repeat taps while a refresh is already on its way.
        if (refreshing.current) return;
        refreshing.current = true;
        // Stop the idle flips and play one flip, then refresh — the short
        // pause lets the flip be seen before the page reloads.
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        setSpinKey((k) => k + 1);
        window.setTimeout(() => {
          void hardRefresh().then((ok) => {
            // Offline / server unreachable: stay on the page and re-arm.
            if (!ok) refreshing.current = false;
          });
        }, 600);
      }}
      aria-label="Aurafin"
      title="Aurafin"
      className={`inline-block overflow-hidden select-none shrink-0 rounded-full border-0 bg-transparent p-0 cursor-pointer tap-scale ${className ?? ''}`}
    >
      <img
        key={spinKey}
        src="/logo-icon.png"
        alt="Aurafin"
        className="block h-full w-full object-cover animate-logo-spin"
        draggable={false}
      />
    </button>
  );
}
