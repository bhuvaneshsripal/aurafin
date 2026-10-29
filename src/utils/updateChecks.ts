/**
 * Finds out quickly when a new version of the app has been deployed.
 *
 * Two checks run side by side:
 *
 *  1. Version ping (fast). Every build publishes a tiny /version.json. The app
 *     compares its own build id with it every VERSION_POLL_MS, so a new deploy
 *     is noticed within seconds and the "update" notice can appear right away,
 *     without waiting for the new service worker to finish downloading. The
 *     moment a difference is seen the service worker is also told to fetch the
 *     new version, so it is usually ready by the time "Update" is tapped.
 *
 *  2. Service worker check. A deploy also changes `sw.js`, so
 *     `registration.update()` is repeated every SW_POLL_MS as a safety net.
 *
 * Both run while the app is on screen, and straight away when it returns to
 * the foreground, regains focus, is restored from the back/forward cache, or
 * the connection comes back. Nothing is polled while it is in the background
 * (saves battery and data). Checks never overlap and are spaced at least
 * MIN_GAP_MS apart. Returns a function that stops everything.
 */
const VERSION_POLL_MS = 10_000;
const SW_POLL_MS = 20_000;
const MIN_GAP_MS = 2_000;

/** The id of the deployed build, or null when it can't be read (offline, dev, odd response). */
async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const id = (await res.json())?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

export function startUpdateChecks(reg: ServiceWorkerRegistration | undefined, onNewVersion?: () => void): () => void {
  let lastVersionCheck = 0;
  let lastSwCheck = 0;
  let versionInFlight = false;
  let swInFlight = false;
  let announced: string | null = null; // deployed id the user was already told about

  const canCheck = () => navigator.onLine !== false && document.visibilityState !== 'hidden';

  const checkSw = () => {
    if (!reg || !canCheck() || swInFlight || Date.now() - lastSwCheck < MIN_GAP_MS) return;
    lastSwCheck = Date.now();
    swInFlight = true;
    void reg.update().catch(() => {}).finally(() => { swInFlight = false; });
  };

  const checkVersion = () => {
    if (import.meta.env.DEV || typeof __BUILD_ID__ === 'undefined') return;
    if (!canCheck() || versionInFlight || Date.now() - lastVersionCheck < MIN_GAP_MS) return;
    lastVersionCheck = Date.now();
    versionInFlight = true;
    void fetchDeployedBuildId()
      .then((id) => {
        if (!id || id === __BUILD_ID__) return;
        checkSw(); // start downloading the new version now
        if (id !== announced) {
          announced = id;
          onNewVersion?.();
        }
      })
      .finally(() => { versionInFlight = false; });
  };

  const checkAll = () => {
    checkVersion();
    checkSw();
  };

  checkAll();
  const versionTimer = window.setInterval(checkVersion, VERSION_POLL_MS);
  const swTimer = window.setInterval(checkSw, SW_POLL_MS);
  document.addEventListener('visibilitychange', checkAll);
  window.addEventListener('focus', checkAll);
  window.addEventListener('pageshow', checkAll);
  window.addEventListener('online', checkAll);

  return () => {
    window.clearInterval(versionTimer);
    window.clearInterval(swTimer);
    document.removeEventListener('visibilitychange', checkAll);
    window.removeEventListener('focus', checkAll);
    window.removeEventListener('pageshow', checkAll);
    window.removeEventListener('online', checkAll);
  };
}
