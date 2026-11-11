/**
 * Route code prefetching. Pages are lazy chunks, so the first visit to a screen
 * normally waits on a download. Here the chunk is fetched earlier: when the
 * pointer hovers or a finger touches a link to it, and in idle time shortly
 * after startup. A repeat dynamic import() of the same module is served from
 * the module cache, so the lazy() wrappers in App.tsx pick it up for free.
 * Skipped on Data Saver and very slow connections.
 */
const ROUTES: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/Dashboard'),
  '/wealth': () => import('../pages/Wealth'),
  '/essentials': () => import('../pages/Essentials'),
  '/transactions': () => import('../pages/Transactions'),
  '/calculators': () => import('../pages/Calculators'),
  '/watchlist': () => import('../pages/Watchlist'),
  '/indices': () => import('../pages/Indices'),
  '/valuation': () => import('../pages/Valuation'),
  '/settings': () => import('../pages/Settings'),
  '/import': () => import('../pages/Import'),
  '/wealth/performance': () => import('../pages/InvestmentPnL'),
  '/stock': () => import('../pages/StockQuote'),
  '/volume': () => import('../pages/HighVolume'),
  '/swing': () => import('../pages/SwingScanner'),
};

const done = new Set<string>();

function constrained(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (!!c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

export function prefetchRoute(path: string): void {
  const key = path.split('?')[0].replace(/\/$/, '') || '/';
  const load = ROUTES[key];
  if (!load || done.has(key)) return;
  done.add(key);
  load().catch(() => done.delete(key));
}

/** Prefetch on hover/touch of any in-app link, and warm the main screens when idle. */
export function startRoutePrefetch(): () => void {
  if (typeof window === 'undefined' || constrained()) return () => {};
  const onIntent = (e: Event) => {
    const a = (e.target as Element | null)?.closest?.('a[href^="/"]') as HTMLAnchorElement | null;
    if (a) prefetchRoute(a.pathname);
  };
  document.addEventListener('pointerover', onIntent, { passive: true });
  document.addEventListener('touchstart', onIntent, { passive: true });

  // One chunk per idle slot, so warming never competes with the user's own taps.
  const queue = ['/essentials', '/watchlist', '/calculators', '/indices', '/settings'];
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void };
  let handle = 0;
  let timer = 0;
  const next = () => {
    const p = queue.shift();
    if (!p) return;
    prefetchRoute(p);
    schedule();
  };
  const schedule = () => {
    if (w.requestIdleCallback) handle = w.requestIdleCallback(next, { timeout: 4000 });
    else timer = window.setTimeout(next, 1500);
  };
  const start = window.setTimeout(schedule, 4000);
  return () => {
    document.removeEventListener('pointerover', onIntent);
    document.removeEventListener('touchstart', onIntent);
    window.clearTimeout(start);
    window.clearTimeout(timer);
    if (handle && w.cancelIdleCallback) w.cancelIdleCallback(handle);
  };
}
