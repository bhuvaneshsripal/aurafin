/**
 * Finds out quickly when a new version of the app has been deployed -- and only tells the person.
 *
 * Every build publishes a tiny /version.json. The app compares its own build id with it every
 * VERSION_POLL_MS, so a new deploy is noticed within seconds and the "update" notice appears.
 * Nothing is downloaded or switched: the installed app stays on its current version (each build's
 * service worker has its own file name, see vite.config.ts) until the person taps Update.
 *
 * It runs while the app is on screen, and straight away when it returns to the foreground,
 * regains focus, is restored from the back/forward cache, or the connection comes back. Nothing is
 * polled while it is in the background (saves battery and data). Checks never overlap and are
 * spaced at least MIN_GAP_MS apart. Returns a function that stops everything.
 */
const VERSION_POLL_MS = 10_000;
const MIN_GAP_MS = 2_000;

/** The id of the deployed build, or null when it can't be read (offline, dev, odd response). */
export async function fetchDeployedBuildId(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const id = (await res.json())?.id;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

export function startUpdateChecks(_reg: ServiceWorkerRegistration | undefined, onNewVersion?: (deployedId: string) => void): () => void {
  let lastVersionCheck = 0;
  let versionInFlight = false;
  let announced: string | null = null; // deployed id the user was already told about

  const canCheck = () => navigator.onLine !== false && document.visibilityState !== 'hidden';

  const checkVersion = () => {
    if (import.meta.env.DEV || typeof __BUILD_ID__ === 'undefined') return;
    if (!canCheck() || versionInFlight || Date.now() - lastVersionCheck < MIN_GAP_MS) return;
    lastVersionCheck = Date.now();
    versionInFlight = true;
    void fetchDeployedBuildId()
      .then((id) => {
        if (!id || id === __BUILD_ID__) return;
        if (id !== announced) {
          announced = id;
          onNewVersion?.(id);
        }
      })
      .finally(() => { versionInFlight = false; });
  };

  const checkAll = () => {
    checkVersion();
  };

  checkAll();
  const versionTimer = window.setInterval(checkVersion, VERSION_POLL_MS);
  document.addEventListener('visibilitychange', checkAll);
  window.addEventListener('focus', checkAll);
  window.addEventListener('pageshow', checkAll);
  window.addEventListener('online', checkAll);

  return () => {
    window.clearInterval(versionTimer);
    document.removeEventListener('visibilitychange', checkAll);
    window.removeEventListener('focus', checkAll);
    window.removeEventListener('pageshow', checkAll);
    window.removeEventListener('online', checkAll);
  };
}

/** One-off check used by Settings → New version: is a newer build deployed
 *  than the one running right now? `true`/`false`, or `null` if it couldn't be
 *  determined (offline, dev server). */
export async function isNewVersionDeployed(): Promise<boolean | null> {
  if (import.meta.env.DEV || typeof __BUILD_ID__ === 'undefined') return null;
  const id = await fetchDeployedBuildId();
  if (!id) return null;
  return id !== __BUILD_ID__;
}
