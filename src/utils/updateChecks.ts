/**
 * Finds out quickly when a new version of the app has been deployed.
 *
 * A deploy changes `sw.js`, so asking the browser to re-fetch it
 * (`registration.update()`) is how a new version is noticed: the new service
 * worker then installs in the background and the "Update now" notice appears
 * (see UpdateBanner / LoginUpdateButton).
 *
 * The check runs:
 *  - every POLL_MS while the app is on screen (nothing is polled while it is
 *    in the background, which saves battery and data on phones);
 *  - the moment the app returns to the foreground, regains focus, is restored
 *    from the back/forward cache, or the connection comes back.
 *
 * Checks never overlap and are spaced at least MIN_GAP_MS apart, so the
 * several events that fire together when a tab is revisited cost one request.
 * Returns a function that stops everything.
 */
const POLL_MS = 30_000;
const MIN_GAP_MS = 5_000;

export function startUpdateChecks(reg: ServiceWorkerRegistration): () => void {
  let lastCheck = 0;
  let inFlight = false;

  const check = () => {
    if (navigator.onLine === false) return;
    if (document.visibilityState === 'hidden') return;
    const now = Date.now();
    if (inFlight || now - lastCheck < MIN_GAP_MS) return;
    lastCheck = now;
    inFlight = true;
    void reg
      .update()
      .catch(() => {})
      .finally(() => {
        inFlight = false;
      });
  };

  const id = window.setInterval(check, POLL_MS);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.addEventListener('pageshow', check);
  window.addEventListener('online', check);

  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
    window.removeEventListener('pageshow', check);
    window.removeEventListener('online', check);
  };
}
