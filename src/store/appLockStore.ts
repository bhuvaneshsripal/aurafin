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
  // Locked as soon as the app boots, if a PIN is set — matches "opening the app" requiring the PIN.
  locked: localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin(),
  pinAttemptError: null,

  init: () => {
    const enabled = localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin();
    set({ enabled, locked: enabled });

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
