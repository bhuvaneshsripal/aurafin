import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Target,
  Receipt,
  Settings,
  FileUp,
  Calculator,
  Smartphone,
  Lock,
} from 'lucide-react';
import { useAppLockStore } from '../store/appLockStore';
import { usePremiumStore, selectIsPremium } from '../store/premiumStore';
import ProfileSwitcher from './ProfileSwitcher';
import AppLogo from './AppLogo';

const mainLinks = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/wealth', label: 'Wealth', icon: Wallet },
  { to: '/transactions', label: 'Money', icon: Receipt },
  { to: '/essentials', label: 'Essentials', icon: Target },
];

const toolLinks = [
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const utilityLinks = [
  { to: '/install', label: 'Install App', icon: Smartphone },
];

function NavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-150 ${
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
            : 'text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const lockNow = useAppLockStore((s) => s.lockNow);
  const isPremium = usePremiumStore(selectIsPremium);

  return (
    <aside
      className="
        hidden md:flex md:sticky top-0 left-0
        flex-col w-60 shrink-0 h-screen
        border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900
        px-4 py-5
      "
    >
      <div className="px-1 mb-7 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <AppLogo className="w-9 h-9 rounded-full shrink-0" />
          <span className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">
            Aurafin<span className="text-brand-600">.</span>
          </span>
        </span>
        {lockEnabled && (
          <button
            type="button"
            onClick={lockNow}
            title="Lock Aurafin now"
            aria-label="Lock Aurafin now"
            className="tap-scale h-8 w-8 flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 shrink-0"
          >
            <Lock size={16} />
          </button>
        )}
      </div>

      <ProfileSwitcher />

      <nav className="flex flex-col gap-0.5">
        {mainLinks.map((link) => (
          <NavItem key={link.to} {...link} />
        ))}
      </nav>

      <div className="flex-1" />

      <div className="mt-3 pt-4 border-t border-slate-100 dark:border-slate-800">
        <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
          Tools
        </p>
        <nav className="flex flex-col gap-0.5">
          {toolLinks.map((link) => (
            <NavItem key={link.to} {...link} />
          ))}
        </nav>
      </div>

      <nav className="flex flex-col gap-0.5 pt-2 mt-2 border-t border-slate-100 dark:border-slate-800">
        {utilityLinks.map((link) => (
          <NavItem key={link.to} {...link} />
        ))}
      </nav>

      <div className="px-2.5 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
        {isPremium && (
          <span className="inline-flex items-center gap-1 mb-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-brand-600 text-white">
            Pro
          </span>
        )}
        <p>
          Developed by Bhuvanesh S ·{' '}
          <a
            href="https://www.linkedin.com/in/bhuvaneshs07"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 hover:underline font-medium"
          >
            Contact us
          </a>
        </p>
      </div>
    </aside>
  );
}
