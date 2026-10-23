import { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { useInstallPromptStore, triggerInstallPrompt } from '../store/installPromptStore';

const SEEN_KEY = 'aurafin_install_banner_seen';

function hasSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* storage unavailable: banner may show again next visit, which is harmless */
  }
}

const isIos = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Bottom "Install app" prompt for the login page. Shown once, on the first visit,
 * and never again after the person installs or taps the close button.
 * Captures `beforeinstallprompt` itself because the app-wide listener only mounts after login.
 */
export default function InstallBanner() {
  const installed = useInstallPromptStore((s) => s.installed);
  const setDeferredPrompt = useInstallPromptStore((s) => s.setDeferredPrompt);
  const setInstalled = useInstallPromptStore((s) => s.setInstalled);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      markSeen();
      setVisible(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    let timer: number | undefined;
    if (!installed && !hasSeen()) {
      timer = window.setTimeout(() => setVisible(true), 2500);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [installed, setDeferredPrompt, setInstalled]);

  if (!visible || installed) return null;

  const close = () => {
    markSeen();
    setVisible(false);
  };

  const install = async () => {
    markSeen();
    setVisible(false);
    await triggerInstallPrompt();
  };

  const ios = isIos();

  return (
    <div
      role="dialog"
      aria-label="Install Aurafin"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pointer-events-none"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto relative flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-3 pr-10 shadow-xl animate-page-in">
        <img src="/logo-icon.png" alt="" className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">
            Install <span className="font-brand">Aurafin</span>
          </p>
          <p className="text-xs text-muted">
            {ios ? (
              <>
                Tap <Share size={12} className="inline -mt-0.5" /> then “Add to Home Screen”
              </>
            ) : (
              'Add to your home screen for quick access'
            )}
          </p>
        </div>
        {!ios && (
          <button
            type="button"
            onClick={install}
            className="btn-press flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Download size={14} /> Install
          </button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
