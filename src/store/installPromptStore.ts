import { create } from 'zustand';

interface InstallPromptState {
  /** The captured `beforeinstallprompt` event, if the browser has offered one
   *  this session. Null if unavailable (already installed, unsupported
   *  browser, or the event hasn't fired yet). */
  deferredPrompt: any;
  /** Whether the app is already running in standalone/installed mode. */
  installed: boolean;
  /** Whether the manual "how to install" popup is open. */
  showManualPrompt: boolean;
  setDeferredPrompt: (e: any) => void;
  setInstalled: (v: boolean) => void;
  setShowManualPrompt: (v: boolean) => void;
}

export const useInstallPromptStore = create<InstallPromptState>((set) => ({
  deferredPrompt: null,
  installed: typeof window !== 'undefined' ? (window.matchMedia?.('(display-mode: standalone)').matches ?? false) : false,
  showManualPrompt: false,
  setDeferredPrompt: (e) => set({ deferredPrompt: e }),
  setInstalled: (v) => set({ installed: v }),
  setShowManualPrompt: (v) => set({ showManualPrompt: v }),
}));

/** Attempts the real browser install prompt if one has been captured;
 *  otherwise falls back to the manual instructions popup. Shared by every
 *  "Install App" entry point (Settings card, Install App page) so they all
 *  behave identically. */
export async function triggerInstallPrompt() {
  const { deferredPrompt, setDeferredPrompt, setInstalled, setShowManualPrompt } =
    useInstallPromptStore.getState();

  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  } else {
    setShowManualPrompt(true);
  }
}
