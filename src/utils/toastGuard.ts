/** True when an event target is inside a toast (Undo button, swipe area, etc.).
 *  Outside-tap handlers (menus, panels, dropdowns) call this first so that
 *  tapping Undo doesn't count as "tapped outside" and close what's open. */
export const inToast = (target: EventTarget | null | undefined): boolean =>
  typeof Element !== 'undefined' && target instanceof Element && !!target.closest('[data-toast-root]');
