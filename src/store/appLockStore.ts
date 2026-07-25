import { create } from 'zustand';

const PIN_KEY = 'aurafin-pin';
const ENABLED_KEY = 'aurafin-lock-enabled';

// Auto-lock after this long in the background.
const AUTO_LOCK_MS = 60_000;

interface AppLockState {
  enabled: boolean;
  locked: boolean;
  pinAttemptError: string | null;
  init: () => void;
  setPin: (pin: string) => void;
  disable: () => void;
  unlock: (pin: string) => boolean;
  lockNow: () => void;
}

function getStoredPin() {
  return localStorage.getItem(PIN_KEY);
}

// In-memory only (NOT localStorage). A real page refresh/close always gets a
// brand new JS module instance, so this always starts at `null`.
let hiddenAt: number | null = null;
let listenerAttached = false;

export const useAppLockStore = create<AppLockState>((set, get) => ({
  enabled: localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin(),
  // Locked by default whenever the lock is enabled, so a fresh page load —
  // including fully closing and reopening an installed PWA — always requires
  // the PIN. See init().
  locked: localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin(),
  pinAttemptError: null,

  init: () => {
    const enabled = localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin();
    // Every fresh mount of the app (including reopening a closed installed
    // PWA, which always re-runs this module from scratch) should require
    // the PIN again if lock is enabled.
    set({ enabled, locked: enabled });
    hiddenAt = null;

    if (listenerAttached) return;
    listenerAttached = true;

    document.addEventListener('visibilitychange', () => {
      const { enabled } = get();
      if (!enabled) return;
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else {
        if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) {
          set({ locked: true });
        }
        hiddenAt = null;
      }
    });
  },

  setPin: (pin: string) => {
    localStorage.setItem(PIN_KEY, pin);
    localStorage.setItem(ENABLED_KEY, 'true');
    set({ enabled: true, pinAttemptError: null });
  },

  disable: () => {
    localStorage.removeItem(PIN_KEY);
    localStorage.removeItem(ENABLED_KEY);
    hiddenAt = null;
    set({ enabled: false, locked: false, pinAttemptError: null });
  },

  unlock: (pin: string) => {
    const stored = getStoredPin();
    if (stored && pin === stored) {
      set({ locked: false, pinAttemptError: null });
      return true;
    }
    set({ pinAttemptError: 'Incorrect PIN. Try again.' });
    return false;
  },

  lockNow: () => {
    if (get().enabled) set({ locked: true });
  },
}));
