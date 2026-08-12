import { useEffect, useRef } from 'react';

/**
 * Makes the phone/PWA Back button close an open modal instead of navigating
 * the whole app away from the page underneath it.
 *
 * While `isOpen` is true, one extra "guard" history entry is pushed (same
 * URL, no route change). Pressing Back then just pops that guard — which
 * this hook catches via `popstate` and turns into `onClose()` — instead of
 * leaving the current page. Closing the modal any other way (X button,
 * save, backdrop click) is also kept in sync: the moment `isOpen` flips to
 * false, the unused guard entry is quietly popped so Back keeps behaving
 * normally afterwards.
 *
 * Several call sites can be active in the same component (e.g. AssetsTab
 * uses this for the "viewing asset" screen, the Edit modal, and the tag
 * modal). A single guard entry is shared across all of them via a small
 * module-level stack, rather than each instance pushing/popping its own:
 * one component swapping "close screen A, open modal B" in a single React
 * update (for example, tapping Edit from the asset-detail view) closes A
 * and opens B in the very same commit. If each instance managed its own
 * history entry, A's cleanup would call `history.back()` after B had
 * already pushed its entry, popping B's guard instead of A's and closing
 * the modal that had just opened. Deferring the "pop" by one tick lets a
 * same-commit open cancel a same-commit close before any navigation
 * happens, so the net stack size (not the raw open/close order) is what
 * decides whether a history entry actually gets pushed or popped.
 *
 * Usage: just call it alongside the existing open/close state —
 *   useModalBackClose(modalOpen, () => setModalOpen(false));
 * No changes needed at the call sites that already toggle that state.
 */
let guardStack: Array<() => void> = [];
let entryPushed = false;
let listenerAdded = false;
let pendingCollapse: ReturnType<typeof setTimeout> | null = null;

function ensurePopstateListener() {
  if (listenerAdded) return;
  listenerAdded = true;
  window.addEventListener('popstate', () => {
    entryPushed = false;
    const top = guardStack.pop();
    top?.();
  });
}

export function useModalBackClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const handleRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    ensurePopstateListener();

    // Cancel any pop that a modal closing in this same render was about to
    // perform once its timer fires — this one reclaims the shared guard
    // entry instead.
    if (pendingCollapse !== null) {
      clearTimeout(pendingCollapse);
      pendingCollapse = null;
    }

    const handle = () => onCloseRef.current();
    handleRef.current = handle;
    guardStack.push(handle);
    if (!entryPushed) {
      window.history.pushState({ __modalGuard: true }, '', window.location.href);
      entryPushed = true;
    }

    return () => {
      const idx = guardStack.lastIndexOf(handle);
      if (idx !== -1) guardStack.splice(idx, 1);
      handleRef.current = null;

      if (guardStack.length === 0 && entryPushed) {
        // Don't pop immediately — give any modal opening in this same tick
        // a chance to reclaim the guard entry first (see comment above).
        pendingCollapse = setTimeout(() => {
          pendingCollapse = null;
          if (guardStack.length === 0 && entryPushed) {
            entryPushed = false;
            window.history.back();
          }
        }, 0);
      }
    };
  }, [isOpen]);
}
