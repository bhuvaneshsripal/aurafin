import type { MouseEvent } from 'react';

/**
 * What tapping the nav button of the page you are ALREADY on does: show that page's main view
 * from the top. It never reloads the app (prices update by themselves).
 *
 * - A page that keeps its own in-page state (a stock opened on Valuation, the search box) can
 *   claim the tap by cancelling the `aurafin:tab-home` event; it goes back to its main view itself.
 * - An open panel / detail screen leaves one "guard" entry on top of the browser history (see
 *   useModalBackClose). It is closed by stepping back over that entry, instead of navigating
 *   forward and leaving it behind. That keeps Back honest: it goes exactly one step, to where you
 *   were before, rather than replaying the screens you just closed or jumping to Overview.
 */
export function handleActiveTabTap(e: MouseEvent, opts: { skipHistoryPop?: boolean } = {}) {
  const ev = new CustomEvent('aurafin:tab-home', { cancelable: true });
  window.dispatchEvent(ev);
  if (!ev.defaultPrevented && !opts.skipHistoryPop && window.history.state?.__modalGuard) {
    e.preventDefault();
    window.history.back();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
