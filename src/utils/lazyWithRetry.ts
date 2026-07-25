import { lazy, type ComponentType } from 'react';

const RELOADED_KEY = 'aurafin-chunk-reload';

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
      sessionStorage.removeItem(RELOADED_KEY);
      return module;
    } catch (error) {
      const alreadyReloaded = sessionStorage.getItem(RELOADED_KEY) === 'true';
      if (!alreadyReloaded) {
        sessionStorage.setItem(RELOADED_KEY, 'true');
        window.location.reload();
        // Never resolves — the reload takes over before this would render.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
