import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Target,
  Settings,
  FileUp,
  Calculator,
  Smartphone,
  Lock,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import WealthIcon from './icons/WealthIcon';
import MoneyIcon from './icons/MoneyIcon';
import { useAppLockStore } from '../store/appLockStore';
import { useAuthStore } from '../store/authStore';
import { useAvatarStore } from '../store/avatarStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { useUiStore } from '../store/uiStore';
import ProfileSwitcher from './ProfileSwitcher';
import AppLogo from './AppLogo';

type NavLinkDef = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };

// Grouped by what the person is doing, not by how the app is built.
const groups: { label: string; links: NavLinkDef[] }[] = [
  {
    label: 'Portfolio',
    links: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/wealth', label: 'Wealth', icon: WealthIcon, end: true },
      { to: '/wealth/performance', label: 'Performance', icon: LineChart },
    ],
  },
  {
    label: 'Money & planning',
    links: [
      { to: '/transactions', label: 'Money', icon: MoneyIcon },
      { to: '/essentials', label: 'Essentials', icon: Target },
    ],
  },
  {
    label: 'Tools',
    links: [
      { to: '/import', label: 'Import', icon: FileUp },
      { to: '/calculators', label: 'Calculators', icon: Calculator },
    ],
  },
];

const accountLinks: NavLinkDef[] = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/install', label: 'Install app', icon: Smartphone },
];

function NavItem({ to, label, icon: Icon, end }: NavLinkDef) {
  return (
    <NavLink
      to={to}
      end={end ?? to === '/'}
      title={label}
      className={({ isActive }) =>
        `sb-item flex items-center gap-2.5 h-9 px-2.5 rounded-lg text-[14px] font-medium transition-colors duration-150 ${
          isActive
            ? 'bg-primary-soft text-primary-ink'
            : 'text-slate-600 hover:bg-surface-hover hover:text-ink'
        }`
      }
    >
      <Icon size={18} strokeWidth={1.75} className="shrink-0" />
      <span className="sb-label truncate">{label}</span>
    </NavLink>
  );
}

/** Shown under the logo when the account has no household profiles yet. */
function AccountChip() {
  const user = useAuthStore((s) => s.user);
  const avatarUrl = useAvatarStore((s) => s.dataUrl) ?? user?.photoURL ?? null;
  const navigate = useNavigate();
  const name = user?.displayName ?? user?.email ?? 'Your account';
  const initial = name.charAt(0).toUpperCase();
  return (
    <button
      type="button"
      onClick={() => navigate('/settings')}
      title={name}
      className="sb-chip w-full h-10 flex items-center gap-2.5 px-2.5 rounded-lg border border-line bg-surface text-sm font-medium text-ink hover:bg-surface-hover transition-colors"
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-5 w-5 rounded-md object-cover shrink-0" referrerPolicy="no-referrer" />
      ) : (
        <span className="h-5 w-5 rounded-md shrink-0 flex items-center justify-center text-[11px] font-semibold text-white bg-brand-600">
          {initial}
        </span>
      )}
      <span className="sb-label truncate flex-1 text-left">{name}</span>
    </button>
  );
}

export default function Sidebar() {
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const lockNow = useAppLockStore((s) => s.lockNow);
  const hasProfiles = useHouseholdProfilesStore((s) => s.profiles.length > 0);
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <aside
      style={{ width: 'var(--sb-w)' }}
      className="hidden md:flex md:sticky top-0 left-0 flex-col shrink-0 h-screen border-r border-line bg-surface px-3 py-4 transition-[width] duration-200"
    >
      {/* Brand */}
      <div className="h-9 mb-4 px-1 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2.5 min-w-0">
          <AppLogo className="w-7 h-7 rounded-full" />
          <span className="sb-label font-luxury text-[17px] text-ink truncate">
            Aurafin<span className="text-brand-600">.</span>
          </span>
        </span>
        {lockEnabled && (
          <button
            type="button"
            onClick={lockNow}
            title="Lock Aurafin now"
            aria-label="Lock Aurafin now"
            className="sb-label tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink shrink-0"
          >
            <Lock size={16} />
          </button>
        )}
      </div>

      {/* Profile / account selector */}
      <div className="mb-5">{hasProfiles ? <ProfileSwitcher /> : <AccountChip />}</div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto no-scrollbar -mx-1 px-1 space-y-4">
        {groups.map((g) => (
          <nav key={g.label} aria-label={g.label}>
            <p className="sb-label px-2.5 mb-1 text-xs font-medium text-faint">{g.label}</p>
            <div className="sb-rail-only h-px bg-line-soft mx-2 mb-2" />
            <div className="flex flex-col gap-0.5">
              {g.links.map((link) => (
                <NavItem key={link.to} {...link} />
              ))}
            </div>
          </nav>
        ))}
      </div>

      {/* Account */}
      <div className="pt-3 mt-3 border-t border-line-soft">
        <nav aria-label="Account" className="flex flex-col gap-0.5">
          {accountLinks.map((link) => (
            <NavItem key={link.to} {...link} />
          ))}
        </nav>

        <button
          type="button"
          onClick={toggleSidebar}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="sb-item hidden lg:flex mt-1 w-full items-center gap-2.5 h-9 px-2.5 rounded-lg text-[14px] font-medium text-muted hover:bg-surface-hover hover:text-ink transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} /> : <PanelLeftClose size={18} strokeWidth={1.75} />}
          <span className="sb-label">Collapse</span>
        </button>

        <p className="sb-label px-2.5 pt-3 text-xs text-faint leading-relaxed">
          Developed by Bhuvanesh S ·{' '}
          <a
            href="https://www.linkedin.com/in/bhuvaneshs07"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-ink hover:underline font-medium"
          >
            Contact
          </a>
        </p>
      </div>
    </aside>
  );
}
