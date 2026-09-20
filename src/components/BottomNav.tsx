import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Receipt,
  Target,
  MoreHorizontal,
  FileUp,
  Calculator,
  Settings,
  Smartphone,
  X,
  LineChart,
} from 'lucide-react';
import QuickAddMenu from './QuickAddMenu';
import { useUiStore } from '../store/uiStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const primaryLinks = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/wealth', label: 'Wealth', icon: Wallet },
  { to: '/transactions', label: 'Money', icon: Receipt },
];

interface MoreLink {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const moreLinks: MoreLink[] = [
  { to: '/wealth/performance', label: 'Performance', icon: LineChart },
  { to: '/essentials', label: 'Essentials', icon: Target },
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/install', label: 'Install App', icon: Smartphone },
];

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const isMoreActive = moreLinks.some((l) => l.to === location.pathname);
  const hideFab = useUiStore((s) => s.hideFab);
  useBodyScrollLock(moreOpen);

  return (
    <>
      {/* Floating quick-add action button, sits just above the bottom nav.
          Hidden when a page's own bottom toolbar (e.g. bulk-selection
          actions on Wealth) is occupying the same corner. */}
      {!hideFab && (
        <div className="md:hidden fixed right-4 z-40" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom) + 12px)' }}>
          <QuickAddMenu variant="fab" />
        </div>
      )}

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-14">
          {primaryLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMoreOpen(false)}
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
            onClick={() => setMoreOpen(true)}
            className={`tap-scale flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
              isMoreActive ? 'text-primary-ink' : 'text-muted'
            }`}
          >
            <MoreHorizontal size={20} strokeWidth={1.75} />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div
          className="animate-backdrop-in md:hidden fixed inset-0 z-50 bg-slate-900/30 flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-in w-full bg-surface rounded-t-2xl border-t border-line pb-[env(safe-area-inset-bottom)] max-h-[75vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-base font-semibold text-ink">More</h3>
              <button
                onClick={() => setMoreOpen(false)}
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
