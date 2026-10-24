import { lazy, type ComponentType } from 'react';

const RELOADED_KEY = 'aurafin-chunk-reload';

// sessionStorage can throw in locked-down browser modes; the retry guard is a
// nicety and must never be the thing that breaks navigation.
function ssGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function ssSet(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* best-effort only */
  }
}
function ssRemove(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* best-effort only */
  }
}

/**
 * Same as React.lazy(), but recovers from "Failed to fetch dynamically
 * imported module" — the error you get when a tab stays open across a
 * redeploy and then navigates to a route whose JS chunk no longer exists
 * at its old hashed URL. Instead of leaving the page blank forever, this
 * reloads the tab once (picking up the new deployment's chunk list) rather
 * than surfacing the error every time.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
) {
  return lazy(async () => {
    try {
      const module = await factory();
      // A successful load means we're on a working deployment — clear the
      // guard so a *future* real deploy can trigger one reload again.
      ssRemove(RELOADED_KEY);
      return module;
    } catch (error) {
      const alreadyReloaded = ssGet(RELOADED_KEY) === 'true';
      // Offline/weak network: a reload can't fetch anything new and would just
      // risk an empty page, so surface the error (with a Reload button) instead.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!alreadyReloaded && !offline) {
        ssSet(RELOADED_KEY, 'true');
        window.location.reload();
        // Never resolves — the reload takes over before this would render.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
