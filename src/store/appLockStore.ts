import { create } from 'zustand';

const PIN_KEY = 'aurafin-pin';
const ENABLED_KEY = 'aurafin-lock-enabled';
// sessionStorage survives a page refresh within the same tab, but is wiped
// the moment the tab/window/installed app is actually closed — exactly the
// "stay unlocked across a refresh, but re-lock once really closed" behavior.
const SESSION_UNLOCKED_KEY = 'aurafin-unlocked-session';

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

function isUnlockedThisSession() {
  return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';
}

// In-memory only (NOT localStorage). A real page refresh/close always gets a
// brand new JS module instance, so this always starts at `null`.
let hiddenAt: number | null = null;
let listenerAttached = false;

export const useAppLockStore = create<AppLockState>((set, get) => ({
  enabled: localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin(),
  // Locked whenever the lock is enabled, UNLESS this exact tab session was
  // already unlocked (i.e. this is a refresh, not a fresh open) — see init().
  locked:
    localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin() && !isUnlockedThisSession(),
  pinAttemptError: null,

  init: () => {
    const enabled = localStorage.getItem(ENABLED_KEY) === 'true' && !!getStoredPin();
    // A refresh keeps the same sessionStorage, so an already-unlocked
    // session stays unlocked. A genuinely fresh open (new tab, or the
    // installed app relaunched after being fully closed) gets a fresh
    // sessionStorage with nothing in it, so it requires the PIN again.
    set({ enabled, locked: enabled && !isUnlockedThisSession() });
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
          sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
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
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    hiddenAt = null;
    set({ enabled: false, locked: false, pinAttemptError: null });
  },

  unlock: (pin: string) => {
    const stored = getStoredPin();
    if (stored && pin === stored) {
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      set({ locked: false, pinAttemptError: null });
      return true;
    }
    set({ pinAttemptError: 'Incorrect PIN. Try again.' });
    return false;
  },

  lockNow: () => {
    if (get().enabled) {
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
      set({ locked: true });
    }
  },
}));
