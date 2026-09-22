import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun, Eye, EyeOff, Bell, ChevronDown, MoreVertical, Settings as SettingsIcon, Lock, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAvatarStore } from '../store/avatarStore';
import { useUiStore } from '../store/uiStore';
import { useAppLockStore } from '../store/appLockStore';
import Modal from './Modal';
import QuickAddMenu from './QuickAddMenu';
import ProfileSwitcher from './ProfileSwitcher';
import AppLogo from './AppLogo';
import GlobalSearch from './GlobalSearch';
import { Button, IconButton } from './ui';

const menuPanel =
  'animate-menu-in absolute right-0 mt-2 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-30';
const menuItem =
  'w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover text-left';

/** The sticky 56px top bar. Desktop: search · add · privacy/theme/notifications · account.
 *  Mobile: brand + profile on the left, search / privacy / overflow menu on the right. */
export default function TopHeader() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggleTheme, privacyMode, togglePrivacy } = useUiStore();
  const lockEnabled = useAppLockStore((s) => s.enabled);
  const lockNow = useAppLockStore((s) => s.lockNow);
  const navigate = useNavigate();

  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // Fades a full-screen overlay in first, then flips the real auth state —
  // so leaving the app reads as a smooth log out instead of an abrupt cut
  // to the Login screen.
  const handleLogout = () => {
    setConfirmOpen(false);
    setSigningOut(true);
    window.setTimeout(() => {
      logout();
    }, 320);
  };

  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) setMobileMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const initial = (user?.displayName ?? user?.email ?? 'A').charAt(0).toUpperCase();
  const avatarUrl = useAvatarStore((s) => s.dataUrl) ?? user?.photoURL ?? null;

  const avatar = (size: string) =>
    avatarUrl ? (
      <img src={avatarUrl} alt="" className={`keep-round ${size} rounded-full object-cover shrink-0`} referrerPolicy="no-referrer" />
    ) : (
      <div className={`keep-round ${size} rounded-full bg-brand-600 text-white flex items-center justify-center text-[13px] font-semibold shrink-0`}>
        {initial}
      </div>
    );

  return (
    <>
      <div
        id="app-topbar"
        className="sticky top-0 z-30 h-14 grid grid-cols-[1fr_auto_1fr] md:flex items-center gap-2 sm:gap-3 px-4 sm:px-6 md:px-8 bg-page md:justify-between"
      >
        {/* Mobile: brand mark, left column */}
        <span className="md:hidden flex items-center gap-2 min-w-0">
          <AppLogo className="w-6 h-6 rounded-full" />
          <span className="font-brand text-[15px] text-ink truncate">
            Aurafin<span className="text-brand-600">.</span>
          </span>
        </span>

        {/* Mobile: profile switcher, centered in its own column so it isn't
            crowded against the logo on one side while the action icons sit
            far away on the other — matches the centered-title convention
            most mobile app headers use. */}
        <span className="md:hidden flex items-center justify-center gap-2 min-w-0">
          <ProfileSwitcher compact />
          {lockEnabled && (
            <IconButton label="Lock Aurafin now" size="sm" onClick={lockNow} className="tap-scale shrink-0">
              <Lock size={15} />
            </IconButton>
          )}
        </span>

        {/* Desktop */}
        <div className="hidden md:flex flex-1 items-center min-w-0">
          <GlobalSearch variant="bar" />
        </div>

        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          <div className="shrink-0 mr-1">
            <QuickAddMenu />
          </div>

          <IconButton label={privacyMode ? 'Show amounts' : 'Hide amounts'} onClick={togglePrivacy}>
            {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
          </IconButton>

          <IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </IconButton>

          <div className="relative shrink-0" ref={notifRef}>
            <IconButton label="Notifications" onClick={() => setNotifOpen((o) => !o)}>
              <Bell size={18} />
            </IconButton>
            {notifOpen && (
              <div className={`${menuPanel} w-72 max-w-[90vw]`}>
                <div className="px-4 py-3 border-b border-line-soft">
                  <p className="text-sm font-semibold text-ink">Notifications</p>
                </div>
                <div className="px-4 py-8 text-center text-sm text-muted">You're all caught up.</div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-line mx-1.5 shrink-0" />

          <div className="relative shrink-0" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              className="flex items-center gap-2 pl-1 pr-2 h-9 rounded-lg hover:bg-surface-hover transition-colors"
            >
              {avatar('h-7 w-7')}
              <span className="text-sm font-medium text-ink-2 hidden lg:inline max-w-[9rem] truncate">
                {user?.displayName ?? user?.email}
              </span>
              <ChevronDown size={15} className="text-muted" />
            </button>

            {profileOpen && (
              <div className={`${menuPanel} w-60`}>
                <div className="px-4 py-3 border-b border-line-soft">
                  <p className="text-sm font-semibold text-ink truncate">{user?.displayName ?? 'Your account'}</p>
                  <p className="text-xs text-muted truncate">{user?.email}</p>
                </div>
                <Link to="/settings" onClick={() => setProfileOpen(false)} className={menuItem}>
                  <SettingsIcon size={16} className="text-muted" />
                  Settings
                </Link>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setConfirmOpen(true);
                  }}
                  className={`${menuItem} text-red-600 dark:text-red-400`}
                >
                  <LogOut size={16} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile toolbar, right column */}
        <div className="flex md:hidden items-center gap-0.5 shrink-0 justify-self-end">
          <GlobalSearch />

          <IconButton label={privacyMode ? 'Show amounts' : 'Hide amounts'} onClick={togglePrivacy}>
            {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
          </IconButton>

          <div className="relative" ref={mobileMenuRef}>
            <IconButton label="Menu" onClick={() => setMobileMenuOpen((o) => !o)}>
              <MoreVertical size={18} />
            </IconButton>

            {mobileMenuOpen && (
              <div className={`${menuPanel} w-64`}>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full px-4 py-3 border-b border-line-soft flex items-center gap-3 hover:bg-surface-hover text-left"
                >
                  {avatar('h-9 w-9')}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink truncate">{user?.displayName ?? 'Your account'}</p>
                    <p className="text-xs text-muted truncate">{user?.email ?? 'View profile & settings'}</p>
                  </div>
                  <SettingsIcon size={16} className="text-muted shrink-0" />
                </button>

                <button onClick={toggleTheme} className={menuItem}>
                  {theme === 'dark' ? <Sun size={17} className="text-muted" /> : <Moon size={17} className="text-muted" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>

                <button onClick={() => setNotifOpen((o) => !o)} className={menuItem}>
                  <Bell size={17} className="text-muted" />
                  Notifications
                </button>
                {notifOpen && <div className="px-4 pb-3 -mt-1 text-xs text-muted">You're all caught up.</div>}

                <div className="border-t border-line-soft" />

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                  className={`${menuItem} text-red-600 dark:text-red-400`}
                >
                  <LogOut size={17} />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Log out of Aurafin?">
        <p className="text-sm text-muted mb-6">
          You'll need to sign in again to see your dashboard. Your data stays saved in the cloud.
        </p>
        <div className="flex gap-2.5">
          <Button variant="secondary" fullWidth onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button fullWidth onClick={handleLogout}>
            Log out
          </Button>
        </div>
      </Modal>

      {signingOut && (
        <div className="animate-backdrop-in fixed inset-0 z-[200] flex flex-col items-center justify-center gap-3 bg-page">
          <img src="/logo-icon.png" alt="Aurafin" className="h-12 w-12 rounded-full object-cover" />
          <p className="text-sm font-medium text-muted">Logging out…</p>
        </div>
      )}
    </>
  );
}
