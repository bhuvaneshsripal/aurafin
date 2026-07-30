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
  MessageSquarePlus,
  Lock,
} from 'lucide-react';
import { useAppLockStore } from '../store/appLockStore';
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
  { to: '/feedback', label: 'Feedback', icon: MessageSquarePlus },
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
        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const lockNow = useAppLockStore((s) => s.lockNow);

  return (
    <aside
      className="
        hidden md:flex md:sticky top-0 left-0
        flex-col w-56 shrink-0 h-screen
        border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900
        px-3 py-4
      "
    >
      <div className="px-1.5 mb-6 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <AppLogo className="w-9 h-9 rounded-lg shrink-0" />
          <span className="font-luxury text-2xl font-semibold text-brand-800 dark:text-brand-200 tracking-tight">
            Aurafin<span className="text-brand-500">.</span>
          </span>
        </span>
        {lockEnabled && (
          <button
            type="button"
            onClick={lockNow}
            title="Lock Aurafin now"
            aria-label="Lock Aurafin now"
            className="icon-outline-green tap-scale h-8 w-8 flex items-center justify-center shrink-0"
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

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
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
