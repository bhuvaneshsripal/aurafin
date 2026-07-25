import { create } from 'zustand';

const PIN_KEY = 'aurafin-pin';
const ENABLED_KEY = 'aurafin-lock-enabled';
const HIDDEN_AT_KEY = 'aurafin-lock-hidden-at';

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

export const useAppLockStore = create<AppLockState>((set, get) => ({
  enabled: localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin(),
  // Not locked on a fresh page load/refresh — only re-locks after being
  // backgrounded (tab hidden) for longer than AUTO_LOCK_MS. See init().
  locked: false,
  pinAttemptError: null,

  init: () => {
    const enabled = localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin();
    set({ enabled, locked: false });

    document.addEventListener('visibilitychange', () => {
      const { enabled } = get();
      if (!enabled) return;
      if (document.visibilityState === 'hidden') {
        localStorage.setItem(HIDDEN_AT_KEY, String(Date.now()));
      } else {
        const hiddenAt = Number(localStorage.getItem(HIDDEN_AT_KEY) ?? 0);
        if (hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) {
          set({ locked: true });
        }
        localStorage.removeItem(HIDDEN_AT_KEY);
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
    localStorage.removeItem(HIDDEN_AT_KEY);
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
