import { useState } from 'react';

/**
 * The Aurafin coin logo. Clicking it plays a one-shot 3D coin-flip
 * animation (see `.logo-flip` / `logo-coin-flip` in index.css) — a nice
 * little easter egg, similar to clicking a brand mark elsewhere.
 *
 * `key={spin}` forces React to remount the <img> on every click so the
 * CSS animation restarts cleanly even on rapid repeat clicks, instead of
 * being a no-op because the class name didn't change.
 */
export default function AppLogo({ className }: { className?: string }) {
  const [spin, setSpin] = useState(0);

  return (
    <img
      key={spin}
      src="/logo-icon.png"
      alt="Aurafin"
      title="Aurafin"
      role="button"
      tabIndex={0}
      onClick={() => setSpin((s) => s + 1)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSpin((s) => s + 1);
        }
      }}
      className={`cursor-pointer select-none ${spin > 0 ? 'logo-flip' : ''} ${className ?? ''}`}
    />
  );
}
