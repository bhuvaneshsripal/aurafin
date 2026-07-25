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
// brand new JS module instance, so this always starts at `null` — a reload
// can never read a stale "was hidden" timestamp from a previous session and
// falsely trigger the lock. It only tracks time spent hidden *within the
// same still-running tab/app instance* (e.g. switching apps briefly on
// mobile, or minimizing the browser), which is the actual "left the app and
// came back" case we want to guard.
let hiddenAt: number | null = null;
let listenerAttached = false;

export const useAppLockStore = create<AppLockState>((set, get) => ({
  enabled: localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin(),
  // Never locked on a fresh page load/refresh — only re-locks after being
  // backgrounded for longer than AUTO_LOCK_MS while the app instance stayed
  // alive. See init().
  locked: false,
  pinAttemptError: null,

  init: () => {
    const enabled = localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin();
    set({ enabled, locked: false });
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
