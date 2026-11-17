import { useEffect, useState } from 'react';

/**
 * True once `ms` milliseconds have passed since the page started loading.
 *
 * Measured from page load (performance.now), not from when the component mounts, so going back
 * to a page later in the session never waits again. Used to bound how long headline numbers hold
 * out for a fresh network price before falling back to the last saved one.
 */
export function useStartupGrace(ms = 1200): boolean {
  const elapsed = () => (typeof performance !== 'undefined' ? performance.now() : Infinity) >= ms;
  const [over, setOver] = useState(elapsed);
  useEffect(() => {
    if (over) return;
    const left = Math.max(0, ms - performance.now());
    const t = setTimeout(() => setOver(true), left);
    return () => clearTimeout(t);
  }, [over, ms]);
  return over;
}
