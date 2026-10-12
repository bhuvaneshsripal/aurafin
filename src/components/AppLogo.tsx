import { useEffect, useRef, useState } from 'react';
import { hardRefresh } from '../utils/hardRefresh';

/**
 * The Aurafin coin logo. Auto-rotates a full turn every 4s as a subtle
 * brand flourish, and clicking/tapping it triggers a hard refresh of the app.
 * The auto-rotation bumps `spinKey`; keying the <img> on it remounts the
 * element so the CSS animation restarts cleanly.
 */
export default function AppLogo({ className }: { className?: string }) {
  const [spinKey, setSpinKey] = useState(0);
  const intervalRef = useRef<number | null>(null);

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
        setSpinKey((k) => k + 1);
        void hardRefresh();
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
