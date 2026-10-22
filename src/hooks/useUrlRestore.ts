import { useEffect, useRef } from 'react';

/**
 * Keeps a full-screen sub-view (e.g. a holding's detail page) alive across a
 * browser refresh by mirroring "which item is open" into a URL query param.
 *
 * - While `current` is set, `?param=<id>` is written to the address bar.
 * - When the page loads with `?param=<id>` and nothing is open yet, the
 *   matching item is looked up in `items` and handed to `restore`.
 *
 * The URL is updated with history.replaceState (keeping the existing history
 * state) rather than a router navigation, so it adds no history entries and
 * doesn't trigger the page's "location changed → close overlays" reset.
 *
 * Nothing is written until the restore attempt has finished; otherwise the
 * initial "nothing open" state would erase the param before it was read.
 */
export function useUrlRestore<T extends { id: string }>(
  param: string,
  current: T | null,
  items: T[],
  restore: (item: T) => void,
) {
  const readyRef = useRef(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  // Restore once the data is available.
  useEffect(() => {
    if (readyRef.current) return;
    const id = new URLSearchParams(window.location.search).get(param);
    if (!id) {
      readyRef.current = true;
      return;
    }
    const found = items.find((i) => i.id === id);
    if (found) {
      restoreRef.current(found);
      // Defer, so the mirror effect below (same commit, state not yet
      // updated) doesn't see "nothing open" and strip the param again.
      setTimeout(() => {
        readyRef.current = true;
      }, 0);
    } else if (items.length > 0) {
      // Data is loaded but the item is gone (deleted / other profile).
      readyRef.current = true;
    }
  }, [param, items]);

  // Mirror the open item into the URL.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!readyRef.current) return;
    const url = new URL(window.location.href);
    const inUrl = url.searchParams.get(param);
    if (currentId === inUrl || (currentId === null && inUrl === null)) return;
    if (currentId) url.searchParams.set(param, currentId);
    else url.searchParams.delete(param);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }, [currentId, param]);
}
