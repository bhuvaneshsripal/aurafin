import { useEffect } from 'react';

/**
 * While a top-bar menu is open (Add, notifications, profile/overflow), mark <html> with
 * `data-topbar-menu`. When a content panel is also open (html[data-panel-open], see Modal),
 * index.css then lifts the top bar and the menu's dim layer above the panel, so the menu
 * shows on top of it instead of peeking out from behind it.
 *
 * Reference-counted: the desktop and phone copies of a menu are both mounted, and two
 * menus must not clear each other's flag.
 */
let openCount = 0;

export function useTopbarMenuFlag(open: boolean) {
  useEffect(() => {
    if (!open) return;
    openCount += 1;
    document.documentElement.setAttribute('data-topbar-menu', '');
    return () => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.documentElement.removeAttribute('data-topbar-menu');
    };
  }, [open]);
}
