import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun, Eye, EyeOff, Bell, ChevronDown, MoreVertical, Settings as SettingsIcon, Lock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAvatarStore } from '../store/avatarStore';
import { useUiStore } from '../store/uiStore';
import { useAppLockStore } from '../store/appLockStore';
import Modal from './Modal';
import QuickAddMenu from './QuickAddMenu';
import ProfileSwitcher from './ProfileSwitcher';
import AppLogo from './AppLogo';

export default function Topbar() {
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

  return (
    <>
      <div className="flex items-center justify-between gap-2 sm:gap-3 px-4 sm:px-6 md:px-8 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {/* Left: logo + app name (mobile only — desktop shows it in the Sidebar) */}
        <span className="md:hidden flex items-center gap-1.5 min-w-0">
          <AppLogo className="w-6 h-6 rounded-full shrink-0" />
          <span className="font-luxury text-lg font-semibold text-brand-800 dark:text-brand-200 tracking-tight truncate">
            Aurafin<span className="text-brand-500">.</span>
          </span>
          <ProfileSwitcher compact />
          {lockEnabled && (
            <button
              type="button"
              onClick={lockNow}
              title="Lock Aurafin now"
              aria-label="Lock Aurafin now"
              className="tap-scale h-8 w-8 flex items-center justify-center rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 shrink-0 ml-1"
            >
              <Lock size={16} />
            </button>
          )}
        </span>

        {/* Desktop toolbar — unchanged */}
        <div className="hidden md:flex items-center gap-1 sm:gap-3 ml-auto">
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="tap-scale h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <button
            onClick={togglePrivacy}
            title={privacyMode ? 'Show amounts' : 'Hide amounts'}
            className="tap-scale h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>

          <div className="relative shrink-0" ref={notifRef}>
            <button
              onClick={() => setNotifOpen((o) => !o)}
              className="tap-scale h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Bell size={20} />
            </button>
            {notifOpen && (
              <div className="animate-menu-in absolute right-0 mt-2 w-72 max-w-[90vw] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-20">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Notifications</p>
                </div>
                <div className="px-4 py-8 text-center text-sm text-slate-400">You're all caught up.</div>
              </div>
            )}
          </div>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />

          <div className="shrink-0">
            <QuickAddMenu />
          </div>

          <div className="relative shrink-0" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="tap-scale flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="keep-round h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="keep-round h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold">
                  {initial}
                </div>
              )}
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200 hidden sm:inline">
                {user?.displayName ?? user?.email}
              </span>
              <ChevronDown size={16} className="text-slate-400" />
            </button>

            {profileOpen && (
              <div className="animate-menu-in absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-20">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {user?.displayName ?? 'Your Account'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                </div>
                <Link
                  to="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <SettingsIcon size={16} className="text-slate-400" />
                  Settings
                </Link>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile toolbar — eye toggle restored here, plus a second copy floats bottom-right */}
        <div className="flex md:hidden items-center gap-1 shrink-0">
          <button
            onClick={togglePrivacy}
            title={privacyMode ? 'Show amounts' : 'Hide amounts'}
            className="tap-scale h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>

          <div className="relative" ref={mobileMenuRef}>
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              title="Menu"
              className="tap-scale h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <MoreVertical size={20} />
            </button>

            {mobileMenuOpen && (
              <div className="animate-menu-in absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-30">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/settings');
                  }}
                  className="w-full px-4 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 dark:active:bg-slate-600 text-left"
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="keep-round h-9 w-9 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="keep-round h-9 w-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
                      {initial}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {user?.displayName ?? 'Your Account'}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{user?.email ?? 'View profile & settings'}</p>
                  </div>
                  <SettingsIcon size={16} className="text-slate-400 shrink-0" />
                </button>

                <button
                  onClick={toggleTheme}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {theme === 'dark' ? <Sun size={18} className="text-slate-400" /> : <Moon size={18} className="text-slate-400" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>

                <button
                  onClick={() => setNotifOpen((o) => !o)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <Bell size={18} className="text-slate-400" />
                  Notifications
                </button>
                {notifOpen && (
                  <div className="px-4 pb-3 -mt-1 text-xs text-slate-400">You're all caught up.</div>
                )}

                <div className="border-t border-slate-100 dark:border-slate-700" />

                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setConfirmOpen(true);
                  }}
                  className="w-full text-left px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Sign Out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={<>Sign out of <span className="font-luxury">Aurafin</span>?</>}
      >
        <p className="text-sm text-slate-500 mb-6">
          You'll need to sign in again to see your dashboard. Your data stays saved in the cloud.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmOpen(false)}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => logout()}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Sign Out
          </button>
        </div>
      </Modal>
    </>
  );
}
