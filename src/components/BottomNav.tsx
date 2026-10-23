import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Target,
  MoreHorizontal,
  FileUp,
  Calculator,
  Settings,
  MessageSquare,
  X,
  LineChart,
  Gem,
  Wallet,
  Scale,
} from 'lucide-react';
import { hardRefresh } from '../utils/hardRefresh';
import UpdateDot from './UpdateDot';
import QuickAddMenu from './QuickAddMenu';
import { useUiStore } from '../store/uiStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useModalBackClose } from '../hooks/useModalBackClose';
import { useExitPresence } from '../hooks/useExitPresence';

const primaryLinks = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/wealth', label: 'Wealth', icon: Gem },
  { to: '/transactions', label: 'Money', icon: Wallet },
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
  { to: '/essentials', label: 'Essentials', icon: Target },
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/valuation', label: 'Valuation', icon: Scale },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
  { to: '/settings', label: 'Settings', icon: Settings },
];

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
  // While a text field has focus the keyboard covers the bottom of the screen.
  // Native apps hide their tab bar in that state; do the same so it never sits
  // on top of the field being typed into.
  const location = useLocation();
  const isMoreActive = moreLinks.some((l) => l.to === location.pathname);
  const searchOpen = useUiStore((s) => s.searchOpen);
  const notificationsOpen = useUiStore((s) => s.notificationsOpen);
  // The bottom nav stays visible on the notifications page; only the "+" button hides.
  const hideFab = useUiStore((s) => s.hideFab) || searchOpen || notificationsOpen;
  const { mounted: moreMounted, closing: moreClosing } = useExitPresence(moreOpen, 180);
  useBodyScrollLock(moreOpen);
  useModalBackClose(moreOpen, () => setMoreOpen(false));

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
    if (location.pathname === to) {
      void hardRefresh().then((ok) => {
        if (!ok) window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  };

  return (
    <>
      {/* Floating quick-add action button, sits just above the bottom nav.
          Hidden when a page's own bottom toolbar (e.g. bulk-selection
          actions on Wealth) is occupying the same corner, and while typing. */}
      {!hideFab && (
        <div className="md:hidden fixed right-4 z-40" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 12px)' }}>
          <QuickAddMenu variant="fab" />
        </div>
      )}

      {!searchOpen && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-4 h-14">
            {primaryLinks.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/' || to === '/wealth'}
                onClick={() => onTabTap(to)}
                className={({ isActive }) =>
                  `tap-scale flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                    isActive ? 'text-primary-ink' : 'text-muted'
                  }`
                }
              >
                <Icon size={20} strokeWidth={1.75} />
                {label}
              </NavLink>
            ))}

            <button
              type="button"
              onClick={() => {
                tapFeedback();
                setMoreOpen(true);
              }}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={`tap-scale flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                isMoreActive ? 'text-primary-ink' : 'text-muted'
              }`}
            >
              <span className="relative inline-flex">
                <MoreHorizontal size={20} strokeWidth={1.75} />
                <UpdateDot />
              </span>
              More
            </button>
          </div>
        </nav>
      )}

      {moreMounted && (
        <div
          className={`${moreClosing ? 'animate-backdrop-out' : 'animate-backdrop-in'} md:hidden fixed inset-0 z-50 bg-slate-900/30 flex items-end`}
          onClick={() => setMoreOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
            className={`${moreClosing ? 'animate-sheet-out' : 'animate-sheet-in'} w-full bg-surface rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)] max-h-[75vh] overflow-y-auto overscroll-contain`}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
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
                  <span className="relative inline-flex">
                    <Icon size={20} strokeWidth={1.75} />
                    {to === '/settings' && <UpdateDot />}
                  </span>
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
