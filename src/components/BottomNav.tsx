import { Fragment, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Target,
  FileUp,
  Calculator,
  Settings,
  MessageSquare,
  X,
  LineChart,
  Gem,
  Wallet,
  Scale,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { hardRefresh } from '../utils/hardRefresh';
import { APP_VERSION } from '../config/version';
import UpdateDot from './UpdateDot';
import QuickAddMenu from './QuickAddMenu';
import { useUiStore } from '../store/uiStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useModalBackClose } from '../hooks/useModalBackClose';
import { useExitPresence } from '../hooks/useExitPresence';

/** Soft inner tint painted behind the active tab's outlined icon (lucide 24x24 grid).
 *  Filling the icon itself made it a flat blob (facets / gear hole vanished), so only
 *  the closed silhouettes get a light wash and the stroke lines stay crisp on top. */
const tints: Record<string, React.ReactNode> = {
  '/': (
    <>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </>
  ),
  '/wealth': <path d="M6 3h12l4 6-10 13L2 9Z" />,
  '/valuation': (
    <>
      <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
      <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    </>
  ),
  '/settings': <circle cx="12" cy="12" r="3" />,
};

const primaryLinks = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/wealth', label: 'Wealth', icon: Gem },
  { to: '/valuation', label: 'Valuation', icon: Scale },
  { to: '/settings', label: 'Settings', icon: Settings },
];

interface MoreLink {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

/** Shown in the More sheet as a disabled tile until the feature ships. */
const COMING_SOON_LABEL = 'Coming soon';

const moreLinks: MoreLink[] = [
  { to: '/wealth/performance', label: 'Performance', icon: LineChart },
  { to: '/transactions', label: 'Money', icon: Wallet },
  { to: '/essentials', label: 'Essentials', icon: Target },
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/volume', label: 'High volume', icon: Activity },
  { to: '/swing', label: 'Swing scan', icon: TrendingUp },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
];

/** Round nav button. Its size comes from the pill's `--nb` variable so the whole
 *  bar can shrink smoothly; the green "active" disc is a separate sliding
 *  indicator behind the buttons, so the button itself only changes color. */
function navBtn(active: boolean) {
  return `tap-scale relative z-10 h-[var(--nb)] w-[var(--nb)] shrink-0 rounded-full inline-flex items-center justify-center transition-colors duration-100 ${
    active ? 'text-primary-ink' : 'text-muted hover:bg-surface-hover/70'
  }`;
}

function tapFeedback() {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(6);
    } catch {
      /* haptics are best-effort */
    }
  }
}

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  // While the on-screen keyboard is up over a focused text field it covers the
  // bottom of the screen. Native apps hide their tab bar in that state; do the same
  // so it never sits on top of the field being typed into (see the effect below).
  const location = useLocation();
  // Index of the tab the sliding indicator sits behind (-1 = none, e.g. on
  // pages that only live in the More sheet).
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const activeIdx = primaryLinks.findIndex(({ to }) =>
    to === '/' || to === '/wealth' ? path === to : path === to || path.startsWith(`${to}/`),
  );
  // The tab just tapped. The highlight jumps to it right away instead of waiting
  // for the route (and a lazy-loaded page) to finish switching.
  const [tapIdx, setTapIdx] = useState<number | null>(null);
  useEffect(() => {
    setTapIdx(null);
  }, [location.pathname]);
  useEffect(() => {
    if (tapIdx === null) return;
    const t = window.setTimeout(() => setTapIdx(null), 1500); // safety net if navigation never happens
    return () => window.clearTimeout(t);
  }, [tapIdx]);
  const shownIdx = tapIdx ?? activeIdx;
  // The centre slot (raised "+") sits between the 2nd and 3rd tab, so tabs on
  // its right are one slot further along.
  const CENTER_AFTER = 2;
  const slotIdx = shownIdx >= CENTER_AFTER ? shownIdx + 1 : shownIdx;
  // 0 = full size, 1 = fully shrunk. Driven by how close the page is to its end
  // and eased frame by frame, so the bar shrinks slowly instead of snapping.
  const pillRef = useRef<HTMLElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null); // the visible pill
  const shrinkTarget = useRef(0);
  const shrinkNow = useRef(0);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const notificationsOpen = useUiStore((s) => s.notificationsOpen);
  // The bottom nav stays visible on the notifications page; only the "+" button hides.
  const hideFab = useUiStore((s) => s.hideFab) || typing || searchOpen || notificationsOpen;
  const { mounted: moreMounted, closing: moreClosing } = useExitPresence(moreOpen, 180);
  useBodyScrollLock(moreOpen);
  useModalBackClose(moreOpen, () => setMoreOpen(false));

  // Swipe the More sheet down to close it. Works from anywhere on the sheet
  // as long as its content is scrolled to the top.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sheetRef.current;
    if (!moreMounted || !el) return;
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let tracking = false;
    let dragging = false;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      tracking = el.scrollTop <= 0;
      dragging = false;
      startY = lastY = e.touches[0].clientY;
      lastT = e.timeStamp;
      velocity = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      const dy = y - startY;
      if (!dragging) {
        if (dy <= 4 || el.scrollTop > 0) return;
        dragging = true;
        el.style.animation = 'none';
        el.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (y - lastY) / dt;
      lastY = y;
      lastT = e.timeStamp;
      el.style.transform = `translate3d(0, ${Math.max(0, dy)}px, 0)`;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      tracking = false;
      const dy = lastY - startY;
      if (dy > 90 || velocity > 0.6) {
        el.style.transition = 'transform 180ms ease-in';
        el.style.transform = 'translate3d(0, 100%, 0)';
        tapFeedback();
        setMoreOpen(false);
      } else {
        el.style.transition = 'transform 200ms ease-out';
        el.style.transform = 'translate3d(0, 0, 0)';
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [moreMounted]);

  // Shrink the bar gradually over the last stretch of the page; grow it back as
  // the user scrolls up or lands on another page. Pages too short to scroll
  // never shrink it.
  useEffect(() => {
    const RANGE = 220; // px from the page end where shrinking begins
    const EASE = 0.18; // fraction of the remaining distance covered per frame (lower = slower)
    const MAX_STEP = 0.045; // cap per frame, so even a fast flick takes ~0.4s to fully shrink
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let anim = 0;
    let measure = 0;
    const apply = () => {
      pillRef.current?.style.setProperty('--p', shrinkNow.current.toFixed(3));
    };
    const step = () => {
      const diff = shrinkTarget.current - shrinkNow.current;
      if (reduceMotion || Math.abs(diff) < 0.002) {
        shrinkNow.current = shrinkTarget.current;
        anim = 0;
      } else {
        const move = Math.min(Math.abs(diff) * EASE, MAX_STEP);
        shrinkNow.current += Math.sign(diff) * Math.max(move, 0.004);
        anim = requestAnimationFrame(step);
      }
      apply();
    };
    // Page height is measured only when the layout changes (resize / content size),
    // never inside the scroll handler: reading scrollHeight there forces a layout
    // on every scroll frame, which is what made scrolling feel laggy.
    let scrollable = 0;
    const remeasure = () => {
      scrollable = document.documentElement.scrollHeight - window.innerHeight;
      schedule();
    };
    const check = () => {
      measure = 0;
      if (scrollable <= 120) {
        shrinkTarget.current = 0;
      } else {
        const t = Math.min(1, Math.max(0, 1 - (scrollable - window.scrollY) / RANGE));
        shrinkTarget.current = t * t * (3 - 2 * t); // smoothstep
      }
      if (!anim) anim = requestAnimationFrame(step);
    };
    const schedule = () => {
      if (!measure) measure = requestAnimationFrame(check);
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', remeasure);
    // Page height changes as data loads; re-measure when it does.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(remeasure) : null;
    ro?.observe(document.body);
    remeasure();
    return () => {
      if (anim) cancelAnimationFrame(anim);
      if (measure) cancelAnimationFrame(measure);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', remeasure);
      ro?.disconnect();
    };
  }, [location.pathname]);

  // Swipe up anywhere along the bottom bar area (the pill, the "+", or the strip
  // beside them) to open the More sheet, on every page. Listens on the document so it
  // does not depend on where inside the bar the finger lands.
  const barHidden = searchOpen || typing;
  useEffect(() => {
    if (barHidden || moreOpen) return;
    const PAD = 10; // forgiving margin around the visible bar
    let s: { x: number; y: number; fired: boolean } | null = null;
    // Only a touch that starts on the bar itself counts, so scrolling the page from
    // just above it still works normally.
    const inBarZone = (x: number, y: number) => {
      const r = barRef.current?.getBoundingClientRect();
      if (!r) return false;
      return x >= r.left - PAD && x <= r.right + PAD && y >= r.top - PAD - 14 && y <= r.bottom + PAD;
    };
    // Another overlay (modal, menu, search) has locked the page: leave the gesture to it.
    const overlayOpen = () => document.documentElement.style.overflow === 'hidden';
    const onStart = (e: TouchEvent) => {
      s = null;
      if (e.touches.length !== 1 || window.innerWidth >= 768 || overlayOpen()) return;
      const t = e.touches[0];
      if (inBarZone(t.clientX, t.clientY)) s = { x: t.clientX, y: t.clientY, fired: false };
    };
    const onMove = (e: TouchEvent) => {
      if (!s) return;
      // The gesture belongs to the bar: keep the page behind it from moving with the finger.
      if (e.cancelable) e.preventDefault();
      if (s.fired) return;
      const t = e.touches[0];
      const dy = s.y - t.clientY; // positive = finger moved up
      const dx = Math.abs(t.clientX - s.x);
      if (dy > 24 && dy > dx) {
        s.fired = true;
        tapFeedback();
        setMoreOpen(true);
      }
    };
    const onEnd = () => {
      s = null;
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [barHidden, moreOpen]);

  // Hide the bar only while a text field is focused AND the on-screen keyboard is
  // really covering the screen. Focus alone is not enough: a field can keep focus
  // after the keyboard is dismissed (back button / swipe), be auto-focused without
  // a keyboard, or be used with a hardware keyboard. In those cases the bar used to
  // vanish and never come back, leaving the user without navigation.
  useEffect(() => {
    const NON_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image'];
    const isTextField = (el: Element | null) => {
      if (!el) return false;
      if (el instanceof HTMLTextAreaElement) return !el.readOnly;
      if (el instanceof HTMLInputElement) return !el.readOnly && !NON_TEXT.includes(el.type);
      return (el as HTMLElement).isContentEditable === true;
    };
    const vv = window.visualViewport;
    // Keyboard counts as open when the visible height drops this far below the
    // tallest height seen at the current width (the layout resizes with the keyboard).
    const KEYBOARD_MIN = 140;
    let baseline = Math.max(window.innerHeight, vv?.height ?? 0);
    let baselineWidth = window.innerWidth;
    const keyboardOpen = () => {
      if (!vv) return true; // can't measure: fall back to "focused = typing"
      if (window.innerWidth !== baselineWidth) {
        // Rotation / window resize: start measuring again.
        baselineWidth = window.innerWidth;
        baseline = 0;
      }
      const h = Math.min(vv.height, window.innerHeight);
      baseline = Math.max(baseline, vv.height, window.innerHeight);
      return baseline - h > KEYBOARD_MIN;
    };
    const compute = () => setTyping(isTextField(document.activeElement) && keyboardOpen());

    let t: number | undefined;
    const onIn = () => {
      window.clearTimeout(t);
      compute();
    };
    const onOut = () => {
      window.clearTimeout(t);
      // Delay so hopping between two fields doesn't flash the bar.
      t = window.setTimeout(compute, 120);
    };
    // The keyboard opens/closes after focus changes; re-check whenever the viewport moves.
    const onViewport = () => compute();
    // A tap outside any field, or Enter in one, dismisses the keyboard on most phones
    // without a blur on the field; resize covers it, this is the safety net.
    const onPointerDown = (e: Event) => {
      const el = e.target as Element | null;
      if (!isTextField(el) && isTextField(document.activeElement)) {
        window.clearTimeout(t);
        t = window.setTimeout(compute, 350);
      }
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    document.addEventListener('pointerdown', onPointerDown, true);
    vv?.addEventListener('resize', onViewport);
    window.addEventListener('resize', onViewport);
    window.addEventListener('orientationchange', onViewport);
    compute();
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
      document.removeEventListener('pointerdown', onPointerDown, true);
      vv?.removeEventListener('resize', onViewport);
      window.removeEventListener('resize', onViewport);
      window.removeEventListener('orientationchange', onViewport);
    };
  }, []);

  // Tell the page layout the bar is hidden so it can stop reserving room for it
  // (see `html[data-typing] #main-content` in index.css).
  useEffect(() => {
    const root = document.documentElement;
    if (typing) root.setAttribute('data-typing', '');
    else root.removeAttribute('data-typing');
    return () => root.removeAttribute('data-typing');
  }, [typing]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  /** Tapping the tab you're already on refreshes it. */
  const onTabTap = (to: string) => {
    setMoreOpen(false);
    tapFeedback();
    // Tapping the tab you're already on refreshes the page (falls back to
    // scrolling to the top if the app can't reach the network).
    // Only on the page's own main view. On a sub-view of the same page (an open
    // edit / add form, a holding detail... these live in the URL as ?edit=, ?add=...)
    // the tap just goes back to the main view instead of refreshing.
    // Read the real address bar, not the router's `location`: open sub-views
    // (?holding=, ?edit=) are written with history.replaceState, which the router
    // never sees, so `location.search` would wrongly look empty there.
    // A page that has its own in-page "opened" state (e.g. a stock loaded on Valuation)
    // can claim the tap by cancelling this event: it goes back to its main view first,
    // and only a second tap on the main view refreshes.
    if (location.pathname === to) {
      const ev = new CustomEvent('aurafin:tab-home', { cancelable: true });
      window.dispatchEvent(ev);
      if (ev.defaultPrevented) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
    }
    if (location.pathname === to && !window.location.search && !location.search) {
      void hardRefresh({ showBar: true, keepPage: true }).then((ok) => {
        if (!ok) window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } else {
      // Picking a tab always shows that page from its top. A normal tab change is
      // a new navigation, which the router-level scroll handling already starts
      // at the top; this also covers tapping the tab you are already inside
      // (a sub-view that never reaches the router).
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  return (
    <>
      {!searchOpen && !typing && (
        // Floating glass pill with round icon buttons. The outer strip keeps the
        // 80px footprint (other layers are positioned above it),
        // is transparent and lets taps through everywhere except the pill.
        <nav
          aria-label="Primary"
          ref={(el) => {
            // --p (0 = full size, 1 = shrunk) lives on the nav so the pill and the "+" both follow it.
            pillRef.current = el;
            // Re-apply after the bar remounts (e.g. closing search).
            el?.style.setProperty('--p', shrinkNow.current.toFixed(4));
          }}
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-[calc(80px+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] flex items-center justify-center pointer-events-none"
        >
          {/* Soft fade at the bottom of the screen: page content melts into the
              background behind the bar instead of being cut off by it. Taps pass through. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[calc(120px+env(safe-area-inset-bottom))]"
            style={{
              background:
                'linear-gradient(to top, var(--color-page) 0%, color-mix(in srgb, var(--color-page) 85%, transparent) 35%, color-mix(in srgb, var(--color-page) 40%, transparent) 70%, transparent 100%)',
            }}
          />
          <div
            ref={barRef}
            style={
              {
                // Each size blends from its full value (--x0) to its shrunk value (--x1) by --p.
                // The bar also narrows toward the page end.
                width: 'min(560px, calc(100% - 32px))',
                '--nb': 'var(--nb0)',
                '--ng': 'var(--ng0)',
                '--np': 'var(--np0)',
                // Shrinking is a transform (GPU only), not a resize, so it never re-lays-out the page.
                transform: 'translateY(calc(3px * var(--p, 0)))',
                scale: 'calc(1 - 0.07 * var(--p, 0))',
                willChange: 'transform, scale',
              } as React.CSSProperties
            }
            className={[
              'pointer-events-auto relative grid grid-cols-5 items-center justify-items-center touch-none rounded-full',
              // Frosted glass: translucent surface + blur of the page scrolling behind it.
              // Solid white (dark theme keeps its dark surface).
              'bg-white dark:bg-surface',
              'shadow-[0_10px_28px_-10px_rgba(23,23,23,0.35),inset_0_1px_0_rgba(255,255,255,0.55)]',
              'dark:shadow-[0_10px_28px_-10px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.07)]',
              // Size tokens: button (nb), gap (ng), padding (np); 0 = full size, 1 = shrunk.
              '[--nb0:48px] [--nb1:44px] [--ng0:4px] [--ng1:4px] [--np0:5px] [--np1:5px]',
              'max-[360px]:[--nb0:42px] max-[360px]:[--nb1:39px] max-[360px]:[--ng0:3px] max-[360px]:[--ng1:3px]',
              'p-[var(--np)]',
            ].join(' ')}
          >
            {/* Grab handle: hints that the bar can be swiped up for more options. */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-[1.5px] h-[3px] w-8 -translate-x-1/2 rounded-full bg-slate-300/80 dark:bg-slate-600"
            />
            {/* Sliding active indicator: glides behind whichever tab is current. */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-[var(--np)] top-[var(--np)] flex h-[var(--nb)] w-[calc((100%-2*var(--np))/5)] items-center justify-center motion-reduce:!transition-none"
              style={
                {
                  // --nav-idx is a registered number property (see index.css) so only the
                  // tab change animates, not the size changes while scrolling.
                  '--nav-idx': Math.max(slotIdx, 0),
                  transform: 'translateX(calc(var(--nav-idx) * 100%))',
                  opacity: shownIdx < 0 ? 0 : 1,
                  transition: '--nav-idx 140ms cubic-bezier(0.2,0,0,1), opacity 120ms ease',
                } as React.CSSProperties
              }
            >
              <span className="h-[var(--nb)] w-[var(--nb)] rounded-full bg-primary-soft shadow-[0_3px_10px_-2px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]" />
            </span>
            {primaryLinks.map(({ to, label, icon: Icon }, i) => (
              <Fragment key={to}>
                {i === CENTER_AFTER && (
                  // Empty middle cell under the raised "+" (the button itself lives outside the pill).
                  <span aria-hidden className="h-[var(--nb)]" />
                )}
              <NavLink
                to={to}
                end={to === '/' || to === '/wealth'}
                onClick={() => {
                  setTapIdx(i);
                  onTabTap(to);
                }}
                aria-label={label}
                title={label}
                className={({ isActive }) => navBtn(tapIdx !== null ? i === tapIdx : isActive)}
              >
                {({ isActive }) => {
                  // The current tab's icon gets a bolder stroke and a soft tint; the others stay thin outlines.
                  const filled = tapIdx !== null ? i === tapIdx : isActive;
                  return (
                    <span className="relative inline-flex">
                      {filled && (
                        <svg
                          aria-hidden
                          viewBox="0 0 24 24"
                          width={23}
                          height={23}
                          className="absolute inset-0 fill-current opacity-[0.22]"
                        >
                          {tints[to]}
                        </svg>
                      )}
                      <Icon size={23} strokeWidth={filled ? 2.1 : 1.75} />
                      {to === '/settings' && <UpdateDot />}
                    </span>
                  );
                }}
              </NavLink>
              </Fragment>
            ))}
            {/* Keyboard / screen-reader way to reach the More sheet (swipe is touch-only). */}
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className="sr-only"
            />
          </div>

          {/* "+" centred horizontally and raised so it sits on the bar's top edge. Lives beside the pill (not inside it) because
              the pill's backdrop blur would trap the menu's full-screen backdrop. Hidden when a
              page's own bottom toolbar needs the space, and while typing. */}
          {!hideFab && (
            // No transform on this wrapper: a transformed parent would trap the menu's
            // full-screen backdrop inside a small square around the button.
            <div
              className="pointer-events-none absolute inset-x-0 flex justify-center"
              style={{ bottom: 'calc(env(safe-area-inset-bottom) + 36px)' }}
            >
              <div className="pointer-events-auto">
                <QuickAddMenu variant="center" />
              </div>
            </div>
          )}
        </nav>
      )}

      {moreMounted && (
        <div
          className={`${moreClosing ? 'animate-backdrop-out' : 'animate-backdrop-in'} md:hidden fixed inset-0 z-50 bg-slate-900/30 flex items-end`}
          onClick={() => setMoreOpen(false)}
        >
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className={`${moreClosing ? 'animate-sheet-out' : 'animate-sheet-in'} w-full bg-surface rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)] max-h-[75vh] overflow-y-auto overscroll-contain`}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
            <div className="flex items-center justify-between px-5 pt-3 pb-2">
              <h3 className="text-base font-semibold text-ink">More</h3>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="icon-outline-green tap-scale h-9 w-9 flex items-center justify-center"
              >
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-5 pb-2 pt-2">
              {moreLinks.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `tap-scale flex flex-col items-center justify-center gap-2 rounded-xl border px-2 py-4 text-xs font-medium text-center transition-colors ${
                      isActive
                        ? 'bg-primary-soft text-primary-ink border-transparent'
                        : 'bg-surface border-line text-slate-600 hover:bg-surface-hover'
                    }`
                  }
                >
                  <Icon size={20} strokeWidth={1.75} />
                  {label}
                </NavLink>
              ))}
              <div
                aria-disabled="true"
                className="relative flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-surface px-2 py-4 text-xs font-medium text-center text-slate-500 opacity-70 cursor-not-allowed select-none"
              >
                <MessageSquare size={20} strokeWidth={1.75} />
                Feedback
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {COMING_SOON_LABEL}
                </span>
              </div>
            </div>
            <div className="px-5 pb-6 pt-2 text-center text-xs text-muted">
              <p className="mb-1 font-medium">Aurafin v{APP_VERSION}</p>
              Developed by Bhuvanesh S ·{' '}
              <a
                href="https://www.linkedin.com/in/bhuvaneshs07"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-ink hover:underline font-medium"
              >
                Contact us
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
