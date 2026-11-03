import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useModalBackClose } from '../hooks/useModalBackClose';
import { useExitPresence } from '../hooks/useExitPresence';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  /** Tailwind max-width class for the modal panel. Defaults to 'max-w-md'
   *  — pass a wider one (e.g. 'max-w-xl') for forms with long text fields
   *  like the SIP fund search, which otherwise gets cramped. Ignored when
   *  `fullScreen` or `contentPanel` is set. */
  widthClassName?: string;
  /** Covers the entire viewport, including the sidebar and top bar —
   *  portaled straight to <body>. Used for flows that should feel like
   *  leaving the app entirely (e.g. onboarding-style wizards). */
  fullScreen?: boolean;
  /** Fills the working area only — below the (sticky) top bar and beside
   *  the sidebar on desktop, both of which stay visible and usable. Sits
   *  between a small centered dialog and `fullScreen`: good for longer
   *  forms (e.g. editing an asset) that want the room of a full page
   *  without hiding navigation. Ignored when `fullScreen` is set. */
  contentPanel?: boolean;
  /** Skips PanelBody's own title/X header — for a form that renders its
   *  own page-style header (title/subtitle/back-link) as its first child
   *  instead, so the panel isn't left with two headers stacked. Only
   *  meaningful together with `fullScreen` or `contentPanel`. */
  hideHeader?: boolean;
  /** Buttons pinned at the bottom of the dialog. Only the content above
   *  scrolls; the footer never moves. */
  footer?: ReactNode;
  /** On phones (<768px) cover the whole screen, bottom nav included, with
   *  the header and `footer` pinned and only the body scrolling. Desktop
   *  keeps the normal centered dialog. */
  fullScreenOnMobile?: boolean;
  /** With `contentPanel`: no gap, rounding, border or backdrop around the
   *  panel, so it sits flush against the sidebar and top bar like a page. */
  flush?: boolean;
}

/** True on phone-width screens; follows rotation/resize. */
function useIsMobile() {
  const q = '(max-width: 767px)';
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

/** Where the top bar (and the market index strip under it) end on screen, so
 *  a phone panel can start right below them and leave them visible. */
function useBarsBottom(active: boolean) {
  const [top, setTop] = useState(0);
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      // Only bars that are actually on screen count (a dismissed update banner
      // keeps its element but has no height).
      const bottoms = ['app-update-banner', 'app-topbar', 'app-marquee'].map((id) => {
        const r = document.getElementById(id)?.getBoundingClientRect();
        return r && r.height > 0 && r.width > 0 ? r.bottom : 0;
      });
      const next = Math.max(0, Math.round(Math.max(...bottoms)));
      setTop((prev) => (prev === next ? prev : next));
    };
    measure();
    // The bars slide (the update notice pushes them down, then they glide back
    // up when it goes), so one measurement can be stale a moment later. Follow
    // them for as long as the sheet is open so it always sits flush under the
    // market strip, with no page showing through above it.
    let raf = 0;
    const tick = () => {
      measure();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [active]);
  return top;
}

/** Shared by the fullScreen and contentPanel variants: header + scrollable
 *  body, closes on Escape in addition to the X button / backdrop. */
function PanelBody({
  title,
  onClose,
  children,
  belowBars = false,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** The panel starts under the top bar, so it needs no safe-area padding. */
  belowBars?: boolean;
}) {
  return (
    <>
      <div className={`flex items-center justify-between px-4 sm:px-6 ${belowBars ? 'pt-4' : 'pt-[calc(env(safe-area-inset-top)+16px)]'} pb-4 shrink-0 border-b border-line-soft`}>
        <h3 className="text-[18px] font-semibold text-ink tracking-tight">{title}</h3>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="keep-round tap-scale h-9 w-9 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 sm:px-6 py-5">{children}</div>
    </>
  );
}

/** The `contentPanel` variant: fixed to the working area (below the sticky
 *  top bar, right of the sidebar on desktop) instead of the whole viewport.
 *  The top offset is measured from the top bar's actual rendered height
 *  (via its `#app-topbar` id) rather than assumed, so it stays correct if
 *  that bar's height ever changes — re-measured on resize too. */
function ContentPanel({
  title,
  onClose,
  hideHeader,
  closing,
  flush,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  hideHeader?: boolean;
  closing?: boolean;
  flush?: boolean;
  children: ReactNode;
}) {
  const [top, setTop] = useState(0);
  // On phones, pin the real top bar to the screen while the panel is open
  // (see html[data-panel-open] in index.css) so it is always visible above
  // the panel, even if the page behind had been scrolled.
  useLayoutEffect(() => {
    const root = document.documentElement;
    const topbar = document.getElementById('app-topbar');
    if (topbar) root.style.setProperty('--topbar-h', `${topbar.getBoundingClientRect().height}px`);
    root.setAttribute('data-panel-open', '');
    return () => {
      root.removeAttribute('data-panel-open');
      root.style.removeProperty('--topbar-h');
    };
  }, []);
  useLayoutEffect(() => {
    const measure = () => {
      const topbar = document.getElementById('app-topbar');
      const vvTop = window.visualViewport?.offsetTop ?? 0;
      // Bar height (+ however far the on-screen keyboard has panned the
      // visual viewport), so the panel always starts right under the top bar.
      // On phones the bar sits below the pinned "new update" notice, if any.
      const notice =
        window.matchMedia('(max-width: 767px)').matches
          ? document.getElementById('app-update-banner')?.getBoundingClientRect().height ?? 0
          : 0;
      setTop(topbar ? topbar.getBoundingClientRect().height + notice + vvTop : vvTop);
    };
    measure();
    window.addEventListener('resize', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, []);

  return (
    <>
      {/* Backdrop: covers the full working area (same bounds the panel used
         to fill edge-to-edge) with a blur + dim, so the inset margin around
         the panel below reveals a softened version of the page instead of
         sharp content (e.g. asset rows) peeking through. */}
      {!flush && <div
        className={`fixed left-0 right-0 md:left-[var(--sb-w)] bottom-[calc(80px_+_env(safe-area-inset-bottom))] md:bottom-0 z-40 bg-slate-900/30 backdrop-blur-[3px] pointer-events-none ${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'}`}
        style={{ top }}
      />}
      <div
        className={`${closing ? 'animate-menu-out' : 'animate-dialog-in'} fixed left-0 right-0 md:left-[var(--sb-w)] bottom-[calc(80px_+_env(safe-area-inset-bottom))] md:bottom-0 z-50 bg-surface flex flex-col overflow-hidden ${flush ? '' : 'm-3 sm:m-4 rounded-2xl border border-line shadow-lg'}`}
        style={{ top }}
      >
        {hideHeader ? (
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 sm:px-6 py-5">{children}</div>
        ) : (
          <PanelBody title={title} onClose={onClose}>
            {children}
          </PanelBody>
        )}
      </div>
    </>
  );
}


/** Size of what is actually visible (the area above the on-screen keyboard).
 *  Dialogs are fitted to it so the whole box stays readable when the
 *  keyboard opens, instead of its lower part hiding behind the keys. */
function useVisibleBox(active: boolean) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    if (!vv) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      // The page already resizes with the keyboard (interactive-widget=
      // resizes-content), so the layout viewport matches what's visible and
      // no manual fitting is needed. Only fit by hand when the browser
      // instead pans/overlays (visual viewport much smaller than layout).
      const overlaid = window.innerHeight - vv.height > 80;
      const next = overlaid ? { top: Math.round(vv.offsetTop), height: Math.round(vv.height) } : null;
      setBox((prev) => {
        if (!prev && !next) return prev;
        if (prev && next && prev.top === next.top && prev.height === next.height) return prev;
        return next;
      });
    };
    // One update per frame, not one per resize tick while the keyboard animates.
    const update = () => {
      if (!raf) raf = requestAnimationFrame(apply);
    };
    apply();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    // When a field is tapped, bring it into view once the keyboard has
    // finished opening — but only if it is actually hidden. Scrolling a field
    // that is already visible (e.g. hopping between PIN boxes) made the
    // screen jump on every digit.
    let t: number | undefined;
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const r = el.getBoundingClientRect();
        const h = window.visualViewport?.height ?? window.innerHeight;
        if (r.top < 8 || r.bottom > h - 8) el.scrollIntoView({ block: 'center' });
      }, 300);
    };
    document.addEventListener('focusin', onFocus);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(t);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.removeEventListener('focusin', onFocus);
    };
  }, [active]);
  return box;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  widthClassName = 'max-w-md',
  fullScreen = false,
  contentPanel = false,
  hideHeader = false,
  footer,
  fullScreenOnMobile = false,
  flush = false,
}: ModalProps) {
  const isMobile = useIsMobile();
  const barsBottom = useBarsBottom(open && fullScreenOnMobile && isMobile);
  // Escape closes whichever variant is open, same as the phone/PWA back
  // button already does via useModalBackClose at the call site.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock the page behind from scrolling while any modal variant is open —
  // without this, touch/wheel scrolling over the backdrop (or the gap around
  // a contentPanel/fullScreen panel) scrolls the page underneath, which is
  // especially jarring for contentPanel since its blurred backdrop visibly
  // shifts as the assets list behind it scrolls.
  useBodyScrollLock(open);
  // Phone/PWA Back (and iOS edge-swipe back) closes the open modal instead of
  // leaving the page underneath it. Every variant gets this, so call sites
  // don't need to wire it up themselves.
  useModalBackClose(open, onClose);

  const { mounted, closing } = useExitPresence(open, 180);
  const visible = useVisibleBox(open);
  if (!mounted) return null;

  if (fullScreenOnMobile && isMobile) {
    return createPortal(
      <div role="dialog" aria-modal="true" className={`${closing ? 'animate-detail-out' : 'animate-detail-in'} fixed inset-x-0 ${flush ? 'bottom-[calc(80px_+_env(safe-area-inset-bottom))] z-40' : 'bottom-0 z-[80]'} bg-surface flex flex-col`} style={{ top: flush ? Math.max(0, barsBottom - 2) : barsBottom }}>
        <PanelBody title={title} onClose={onClose} belowBars>
          {children}
        </PanelBody>
        {footer && (
          <div className={`shrink-0 border-t border-line-soft bg-surface px-4 pt-3 ${flush ? 'pb-3' : 'pb-[calc(env(safe-area-inset-bottom)+12px)]'}`}>
            {footer}
          </div>
        )}
      </div>,
      document.body
    );
  }

  if (fullScreen) {
    // Portaled straight to <body>, escaping the `.app-scale` zoomed content
    // column (see index.css) that the rest of the page renders inside. Left
    // as a normal descendant, this would inherit that zoom and end up
    // smaller than the true viewport — visibly not covering the bottom nav,
    // which itself renders outside `.app-scale` at full size.
    return createPortal(
      <div role="dialog" aria-modal="true" className={`${closing ? 'animate-detail-out' : 'animate-detail-in'} fixed inset-x-0 top-0 bottom-[calc(80px_+_env(safe-area-inset-bottom))] md:bottom-0 z-50 bg-surface flex flex-col`}>
        {hideHeader ? (
          <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain">{children}</div>
        ) : (
          <PanelBody title={title} onClose={onClose}>
            {children}
          </PanelBody>
        )}
      </div>,
      document.body
    );
  }

  if (contentPanel) {
    // Same "escape .app-scale" reasoning as fullScreen above.
    return createPortal(
      <ContentPanel title={title} onClose={onClose} hideHeader={hideHeader} closing={closing} flush={flush}>
        {children}
      </ContentPanel>,
      document.body
    );
  }

  // Portaled to <body> for the same reason as fullScreen/contentPanel: left
  // inline, this overlay lives inside `.app-scale` (CSS zoom), which scales
  // the `fixed` backdrop and stops it covering the whole phone screen, so the
  // page behind showed through. Escaping it gives a true full-viewport
  // backdrop that is also dimmed and blurred enough to keep the page behind
  // from competing with the dialog.
  return createPortal(
    <div
      className={`${closing ? 'animate-backdrop-out' : 'animate-backdrop-in'} fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[3px] px-4 py-4`}
      style={visible ? { top: visible.top, bottom: 'auto', height: visible.height } : undefined}
      onClick={onClose}
    >
      <div
        className={`${closing ? 'animate-menu-out' : 'animate-dialog-in'} bg-surface border border-line shadow-xl w-full ${widthClassName} max-h-[88dvh] max-h-[88vh] flex flex-col`}
        style={{
          borderRadius: 'var(--radius-modal)',
          transformOrigin: 'center',
          ...(visible ? { maxHeight: Math.min(visible.height * 0.88, visible.height - 32) } : {}),
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header stays outside the scroll area — pinned in place, and its
           padding is never eaten by the scrollbar (see body below). */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <h3 className="text-[18px] font-semibold text-ink tracking-tight">{title}</h3>
          <button
          type="button"
          aria-label="Close"
            onClick={onClose}
            className="keep-round tap-scale h-8 w-8 flex items-center justify-center text-slate-600 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        {/* Scroll lives on its own box, and scrollbar-gutter reserves the
           scrollbar's track whether or not it's actually showing. Without
           this, the browser's scrollbar carves into the right p-6 padding
           the moment content overflows, so right-aligned controls (e.g. a
           delete button) visually jump to the very edge and look clipped. */}
        <div className="px-6 pb-6 overflow-y-auto overflow-x-hidden overscroll-contain min-w-0" style={{ scrollbarGutter: 'stable' }}>
          {children}
        </div>
        {footer && <div className="shrink-0 px-6 pb-6 pt-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
