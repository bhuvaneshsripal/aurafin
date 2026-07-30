import { useRef, useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
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
  Layers,
  Check,
  ChevronDown,
} from 'lucide-react';
import { useAppLockStore } from '../store/appLockStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';

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

function ProfileSwitcher() {
  const profiles = useHouseholdProfilesStore((s) => s.profiles);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const setActiveProfileId = useHouseholdProfilesStore((s) => s.setActiveProfileId);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? null;
  const activeLabel = activeProfile ? activeProfile.name : 'All Profiles';
  const activeColour = activeProfile ? activeProfile.colour : '#94a3b8';

  // Only worth showing once there's actually more than one profile to
  // switch between — otherwise it's just an inert label.
  if (profiles.length === 0) return null;

  return (
    <div className="relative mb-4 px-1.5" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: activeColour }} />
        <span className="truncate flex-1 text-left">{activeLabel}</span>
        <ChevronDown size={15} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="animate-menu-in absolute left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-30">
          <button
            onClick={() => {
              setActiveProfileId(null);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Layers size={15} className="text-slate-400 shrink-0" />
            <span className="flex-1 text-left">All Profiles</span>
            {activeProfileId === null && <Check size={15} className="text-brand-600 shrink-0" />}
          </button>

          <div className="border-t border-slate-100 dark:border-slate-700" />

          {profiles.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setActiveProfileId(p.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: p.colour }} />
              <span className="flex-1 text-left truncate">{p.name}</span>
              {activeProfileId === p.id && <Check size={15} className="text-brand-600 shrink-0" />}
            </button>
          ))}

          <div className="border-t border-slate-100 dark:border-slate-700" />

          <button
            onClick={() => {
              setOpen(false);
              navigate('/settings', { state: { tab: 'profiles' } });
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Settings size={15} className="text-slate-400 shrink-0" />
            Manage Profiles
          </button>
        </div>
      )}
    </div>
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
        <span className="flex items-center gap-2 min-w-0">
          <img src="/logo-icon.png" alt="Aurafin" className="w-6 h-6 rounded-lg shrink-0" />
          <span className="font-luxury text-lg font-semibold text-brand-800 dark:text-brand-200 tracking-tight">
            Aurafin<span className="text-brand-500">.</span>
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
