import { useEffect, useState } from 'react';
import { WifiLow, X } from 'lucide-react';
import { useNetworkQuality, type NetworkQuality } from '../hooks/useNetworkQuality';
import { useExitPresence } from '../hooks/useExitPresence';

const COPY: Record<Exclude<NetworkQuality, 'good'>, { title: string; body: string }> = {
  low: { title: 'Low network connection', body: 'Some features may work slowly or not at all.' },
  offline: { title: 'No network connection', body: "You're offline. Some features may not work." },
};

/** Bottom notice for a weak or missing connection, with a dismiss button.
 *  Dismissing hides it until the connection state changes again (e.g. it
 *  drops from low to offline, or recovers and later degrades). */
export default function NetworkBanner() {
  const quality = useNetworkQuality();
  const [dismissedFor, setDismissedFor] = useState<NetworkQuality | null>(null);

  // A recovery re-arms the banner for the next drop.
  useEffect(() => {
    if (quality === 'good') setDismissedFor(null);
  }, [quality]);

  const show = quality !== 'good' && dismissedFor !== quality;
  // Keep the last message around while the exit animation plays.
  const [last, setLast] = useState<Exclude<NetworkQuality, 'good'>>('low');
  useEffect(() => {
    if (quality !== 'good') setLast(quality);
  }, [quality]);
  const { mounted, closing } = useExitPresence(show, 180);
  if (!mounted) return null;

  const kind = quality !== 'good' ? quality : last;
  const { title, body } = COPY[kind];

  return (
    <div
      className="fixed left-0 right-0 z-[70] flex justify-center px-4 pointer-events-none bottom-[calc(56px_+_env(safe-area-inset-bottom)_+_12px)] md:bottom-4"
    >
      <div
        role="status"
        aria-live="polite"
        className={`${closing ? 'animate-menu-out' : 'animate-dialog-in'} pointer-events-auto w-full max-w-md flex items-center gap-3.5 rounded-2xl px-4 py-3 bg-[#1b1d23] text-white border border-white/5 shadow-lg`}
      >
        {/* Wi-Fi glyph with a small red "x" badge */}
        <span className="relative shrink-0 inline-flex h-7 w-7 items-center justify-center" aria-hidden>
          <WifiLow size={26} strokeWidth={2} className="text-white" />
          <X size={11} strokeWidth={3.5} className="absolute -bottom-0.5 -right-0.5 text-red-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{body}</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissedFor(quality)}
          aria-label="Dismiss"
          className="tap-scale shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
