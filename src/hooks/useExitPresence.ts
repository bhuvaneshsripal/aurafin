import { useEffect, useState } from 'react';

/** Keeps something mounted for `ms` after `open` turns false so an exit
 *  animation can play. `mounted` says whether to render at all; `closing`
 *  is true during the exit window (swap the "-in" class for "-out").
 *  Reopening mid-exit cancels it. */
export function useExitPresence(open: boolean, ms = 180) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, reduce ? 0 : ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ms]);

  return { mounted: open || mounted, closing: closing && !open };
}
