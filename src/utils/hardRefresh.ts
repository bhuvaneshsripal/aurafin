/**
 * Hard refresh: throws away everything the browser/PWA may be serving stale
 * (service worker + its caches, cached live prices) and reloads the app
 * from the network. Does NOT touch the user's data or login — assets, PIN,
 * settings and Firebase auth are left alone.
 */
export async function hardRefresh(): Promise<void> {
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
}
