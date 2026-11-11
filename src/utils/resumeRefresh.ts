/**
 * Helpers for the "welcome back" refresh (see hooks/useResumeRefresh).
 *
 * Kept free of React so the decision rules can be tested on their own.
 */

/** Away at least this long and the app counts as "opened after a long time". */
export const AWAY_MS = 30 * 60_000;
/** Never reload for an update more than once in this window (guards against a reload loop). */
export const MIN_RELOAD_GAP_MS = 10 * 60_000;

const LAST_SEEN_KEY = 'aurafin-last-seen';
const LAST_RELOAD_KEY = 'aurafin-resume-reload-at';

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* private mode: best effort */
  }
}

/** When the app was last on screen (written while visible and whenever it is hidden or closed). */
export const readLastSeen = () => readNumber(LAST_SEEN_KEY);
export const writeLastSeen = (ts: number = Date.now()) => writeNumber(LAST_SEEN_KEY, ts);
export const readLastReload = () => readNumber(LAST_RELOAD_KEY);
export const writeLastReload = (ts: number = Date.now()) => writeNumber(LAST_RELOAD_KEY, ts);

export type ResumeAction =
  /** Not away long enough (or nothing to do). */
  | 'none'
  /** Away long enough: refresh quietly in place, no reload. */
  | 'refresh'
  /** Away long enough and a newer build is out: switch to it now, while nothing is in progress. */
  | 'update';

/**
 * What to do when the app comes back.
 *  - A reload only ever happens if a newer build is deployed, the person has not touched anything
 *    yet (nothing to lose), the device is online, and we did not already reload a moment ago.
 *  - Otherwise the app just refreshes its live data in place, and the existing update banner
 *    (which waits for the person) handles a new version they are busy with.
 */
export function decideResume(input: {
  awayMs: number;
  /** A newer build is deployed than the one running. */
  outdated: boolean;
  /** The person has touched the screen / focused a field since coming back. */
  busy: boolean;
  online: boolean;
  /** ms since this hook last reloaded the page, or null if never. */
  sinceLastReloadMs: number | null;
}): ResumeAction {
  if (input.awayMs < AWAY_MS) return 'none';
  const canReload =
    input.outdated &&
    !input.busy &&
    input.online &&
    (input.sinceLastReloadMs === null || input.sinceLastReloadMs >= MIN_RELOAD_GAP_MS);
  return canReload ? 'update' : 'refresh';
}

/** Resolves with the new service worker once it has finished installing and is waiting, or null. */
function waitForWaiting(reg: ServiceWorkerRegistration, timeoutMs: number): Promise<ServiceWorker | null> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve(reg.waiting ?? null), timeoutMs);
    const done = (sw: ServiceWorker | null) => {
      window.clearTimeout(timer);
      resolve(sw);
    };
    const watch = (sw: ServiceWorker | null) => {
      if (!sw) return;
      if (sw.state === 'installed') return done(reg.waiting ?? null);
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed') done(reg.waiting ?? null);
        else if (sw.state === 'redundant') done(null);
      });
    };
    if (reg.waiting) return done(reg.waiting);
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing), { once: true });
  });
}

/**
 * Switches to the newly deployed version without wiping any caches: the new service worker is
 * told to take over and the page reloads once it has (new files come from the network once,
 * everything else from the cache). Returns false if there was no new worker to switch to, so the
 * caller can fall back to a full refresh.
 */
export async function activateWaitingUpdate(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  let reg: ServiceWorkerRegistration | undefined;
  try {
    reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.update().catch(() => {});
  } catch {
    return false;
  }
  const waiting = await waitForWaiting(reg, 10_000);
  if (!waiting) return false;

  let reloaded = false;
  const reload = () => {
    if (reloaded) return;
    reloaded = true;
    writeLastReload();
    writeLastSeen(); // so the reloaded page does not think it was away
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
  window.setTimeout(reload, 5_000); // safety net if the takeover event never arrives
  return true;
}
