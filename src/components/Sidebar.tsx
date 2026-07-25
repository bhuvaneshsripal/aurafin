import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  Target,
  Receipt,
  Settings,
  FileUp,
  Calculator,
  Sparkles,
  Smartphone,
  MessageSquarePlus,
} from 'lucide-react';

const mainLinks = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/wealth', label: 'Wealth', icon: Wallet },
  { to: '/transactions', label: 'Money', icon: Receipt },
  { to: '/essentials', label: 'Essentials', icon: Target },
];

const toolLinks = [
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/calculators', label: 'Calculators', icon: Calculator },
  { to: '/whats-new', label: "What's New", icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const bottomLinks = [
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
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium transition-colors ${
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300'
            : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`
      }
    >
      <Icon size={20} />
      {label}
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside
      className="
        hidden md:flex md:sticky top-0 left-0
        flex-col w-72 shrink-0 h-screen
        border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900
        px-4 py-6
      "
    >
      <div className="px-2 mb-8 flex items-center gap-2.5">
        <img src="/logo-icon.png" alt="Aurafin" className="w-8 h-8 rounded-lg shrink-0" />
        <span className="font-display text-2xl font-semibold text-brand-800 dark:text-brand-200 tracking-tight">
          Aurafin<span className="text-brand-500">.</span>
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        {mainLinks.map((link) => (
          <NavItem key={link.to} {...link} />
        ))}
      </nav>

      <div className="mt-6">
        <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
          Tools
        </p>
        <nav className="flex flex-col gap-1">
          {toolLinks.map((link) => (
            <NavItem key={link.to} {...link} />
          ))}
        </nav>
      </div>

      <div className="flex-1" />

      <nav className="flex flex-col gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
        {bottomLinks.map((link) => (
          <NavItem key={link.to} {...link} />
        ))}
      </nav>

      <div className="px-3 pt-3 mt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 dark:text-slate-500">
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
