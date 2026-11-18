import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { warmEverything, warmHighVolume } from '../utils/appWarmup';
import { WATCHLIST_REMOTE_EVENT } from '../utils/watchlistSync';
import { visibleInterval } from '../utils/visibleInterval';

/**
 * After sign-in, preloads the data other screens need (watchlist prices and
 * trends, the high-volume list) so opening them shows real numbers at once.
 * Runs shortly after startup, again when the watchlist arrives from the cloud,
 * and keeps the prices fresh while the app is open.
 */
export function useAppWarmup() {
  const uid = useAuthStore((s) => s.user?.uid);
  useEffect(() => {
    if (!uid) return;
    const first = window.setTimeout(() => {
      void warmEverything();
      void warmHighVolume();
    }, 1500);
    const onRemote = () => void warmEverything();
    window.addEventListener(WATCHLIST_REMOTE_EVENT, onRemote);
    const stopQuotes = visibleInterval(() => void warmEverything(), 60_000);
    const stopVolume = visibleInterval(() => void warmHighVolume(), 5 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.removeEventListener(WATCHLIST_REMOTE_EVENT, onRemote);
      stopQuotes();
      stopVolume();
    };
  }, [uid]);
}
