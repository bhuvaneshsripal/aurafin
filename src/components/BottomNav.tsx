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
  Sparkles,
  Settings,
  Smartphone,
  MessageSquarePlus,
  X,
} from 'lucide-react';
import QuickAddMenu from './QuickAddMenu';

const primaryLinks = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/wealth', label: 'Wealth', icon: Wallet },
  { to: '/transactions', label: 'Money', icon: Receipt },
];

const moreLinks = [
  { to: '/essentials', label: 'Essentials', icon: Target },
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
  { to: '/whats-new', label: "What's New", icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/install', label: 'Install App', icon: Smartphone },
  { to: '/feedback', label: 'Feedback', icon: MessageSquarePlus },
];

export default function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const isMoreActive = moreLinks.some((l) => l.to === location.pathname);

  return (
    <>
      {/* Floating quick-add action button, sits just above the bottom nav */}
      <div className="md:hidden fixed right-4 z-40" style={{ bottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)' }}>
        <QuickAddMenu variant="fab" />
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4">
          {primaryLinks.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `tap-scale flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}

          <button
            onClick={() => setMoreOpen(true)}
            className={`tap-scale flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
              isMoreActive
                ? 'text-brand-600 dark:text-brand-300'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <MoreHorizontal size={20} />
            More
          </button>
        </div>
      </nav>

      {moreOpen && (
        <div
          className="animate-backdrop-in md:hidden fixed inset-0 z-50 bg-slate-900/40 flex items-end"
          onClick={() => setMoreOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-in w-full bg-white dark:bg-slate-900 rounded-t-2xl pb-[env(safe-area-inset-bottom)] max-h-[75vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">More</h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-5 pb-2 pt-2">
              {moreLinks.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMoreOpen(false)}
                  className={({ isActive }) =>
                    `tap-scale flex flex-col items-center justify-center gap-2 rounded-xl px-2 py-4 text-xs font-medium text-center transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
                        : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`
                  }
                >
                  <Icon size={20} />
                  {label}
                </NavLink>
              ))}
            </div>
            <div className="px-5 pb-6 pt-2 text-center text-xs text-slate-400 dark:text-slate-500">
              Developed by Bhuvanesh S ·{' '}
              <a
                href="https://www.linkedin.com/in/bhuvaneshs07"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
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
