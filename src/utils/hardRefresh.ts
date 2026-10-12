/**
 * Hard refresh: throws away everything the browser/PWA may be serving stale
 * (service worker + its caches, cached live prices) and reloads the app
 * from the network. Does NOT touch the user's data or login — assets, PIN,
 * settings and Firebase auth are left alone.
 */
async function networkIsUsable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`/index.html?_p=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    window.clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function hardRefresh(): Promise<boolean> {
  // Clearing the service worker + caches while the connection is weak or
  // down would delete the only copy of the app we can open, and the reload
  // would then land on an empty browser error page. So only do it once the
  // server has actually answered; otherwise keep the cached app as-is.
  if (!(await networkIsUsable())) return false;

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch { /* ignore */ }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }

  // Cached last-known prices — drop so stale numbers can't flash first.
  try {
    localStorage.removeItem('aurafin-live-prices-cache');
  } catch { /* ignore */ }

  // Cache-busting URL forces a fresh HTML fetch past the HTTP cache.
  const url = new URL(window.location.href);
  url.searchParams.set('_r', Date.now().toString());
  window.location.replace(url.toString());
  return true;
}
