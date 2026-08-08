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
 * Usage: just call it alongside the existing open/close state —
 *   useModalBackClose(modalOpen, () => setModalOpen(false));
 * No changes needed at the call sites that already toggle that state.
 */
export function useModalBackClose(isOpen: boolean, onClose: () => void) {
  const pushedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    window.history.pushState({ __modalGuard: true }, '', window.location.href);
    pushedRef.current = true;

    const onPopState = () => {
      pushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('popstate', onPopState);
      // Closed via the "X" / save / backdrop rather than Back — the guard
      // entry is still sitting there unused, so pop it ourselves.
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [isOpen]);
}
