import { create } from 'zustand';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from './authStore';

// The actual PIN — and the authoritative enabled/disabled flag — live in
// Firestore at users/{uid}/meta/appLock (or, for guest/anonymous users, in a
// per-guest localStorage key, matching the rest of the app's guest-data
// fallback in useFirestoreSync.ts). Nothing sensitive is kept in
// localStorage anymore.
//
// The one thing still cached in localStorage is a non-secret "was a lock
// enabled last time" flag, purely so the lock screen can appear instantly
// on load instead of flashing the unlocked dashboard for a moment while the
// real state loads from Firestore. It carries no PIN and grants no access.
const ENABLED_CACHE_KEY = 'aurafin-lock-enabled';
const GUEST_LOCK_KEY_PREFIX = 'aurafin-guest-applock-';
// sessionStorage survives a page refresh within the same tab, but is wiped
// the moment the tab/window/installed app is actually closed — exactly the
// "stay unlocked across a refresh, but re-lock once really closed" behavior.
const SESSION_UNLOCKED_KEY = 'aurafin-unlocked-session';
// Set right before we force a sign-out for too many wrong PIN attempts, and
// consumed (cleared) the next time the lock state loads after a fresh
// sign-in — that's what lets a Google re-login skip the PIN screen once,
// the same trust level the email-OTP reset flow already grants.
const LOCKOUT_BYPASS_KEY = 'aurafin-lock-bypass-next-login';

// Auto-lock after this long in the background.
const AUTO_LOCK_MS = 60_000;
// Wrong PIN entries allowed before we sign the person out and send them
// back to Login (from which they can prove who they are with Google/email
// instead of guessing the PIN forever).
const MAX_PIN_ATTEMPTS = 3;

// authStore's `user` can be either a full Firebase `User` or the trimmed
// `CachedUser` snapshot it hydrates from localStorage before Firebase
// confirms the session — the latter doesn't carry `isAnonymous`, so this
// mirrors the same loose `any` check useFirestoreSync.ts's
// isAnonymousUser() uses rather than typing it strictly.
function isAnonymous(user: { uid: string; isAnonymous?: boolean }): boolean {
  return user.isAnonymous === true;
}

function isUnlockedThisSession() {
  return sessionStorage.getItem(SESSION_UNLOCKED_KEY) === 'true';
}

function guestLockKey(uid: string) {
  return `${GUEST_LOCK_KEY_PREFIX}${uid}`;
}

/** Read a guest (anonymous user)'s PIN lock state from localStorage. Exported
 *  so useAppLockSync (useFirestoreSync.ts) can read it on sign-in. */
export function readGuestAppLock(uid: string): { pin: string; enabled: boolean } | null {
  try {
    const raw = localStorage.getItem(guestLockKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeGuestAppLock(uid: string, data: { pin: string; enabled: boolean } | null) {
  try {
    if (!data) localStorage.removeItem(guestLockKey(uid));
    else localStorage.setItem(guestLockKey(uid), JSON.stringify(data));
  } catch {
    // best-effort only — never block on it
  }
}

// In-memory only (NOT localStorage). A real page refresh/close always gets a
// brand new JS module instance, so this always starts at `null`.
let hiddenAt: number | null = null;
let listenerAttached = false;

interface AppLockState {
  enabled: boolean;
  locked: boolean;
  pinAttemptError: string | null;
  /** True once the real PIN/enabled state has been loaded from Firestore
   *  (or localStorage, for guests) at least once. Used internally so a
   *  later remote update doesn't clobber a `locked` state the user changed
   *  in-session (e.g. via unlock/lockNow/setPin). */
  pinLoaded: boolean;
  /** Wrong PIN entries in a row since the last correct one (or the last
   *  forced sign-out). Resets on a correct unlock. */
  failedAttempts: number;
  init: () => void;
  /** Called by useAppLockSync() whenever the source of truth (Firestore doc,
   *  or localStorage for guests) reports the current PIN/enabled state. */
  syncFromRemote: (pin: string | null, enabled: boolean) => void;
  setPin: (pin: string) => Promise<void>;
  disable: () => Promise<void>;
  unlock: (pin: string) => boolean;
  lockNow: () => void;
}

export const useAppLockStore = create<AppLockState & { _storedPin: string | null }>((set, get) => ({
  // Optimistic guess from the non-sensitive cache flag, just so the lock
  // screen can show immediately instead of flashing the dashboard while the
  // real PIN loads from Firestore.
  enabled: localStorage.getItem(ENABLED_CACHE_KEY) === 'true',
  locked: localStorage.getItem(ENABLED_CACHE_KEY) === 'true' && !isUnlockedThisSession(),
  pinAttemptError: null,
  pinLoaded: false,
  failedAttempts: 0,
  _storedPin: null,

  init: () => {
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
          set({ locked: true, failedAttempts: 0, pinAttemptError: null });
        }
        hiddenAt = null;
      }
    });
  },

  syncFromRemote: (pin, enabled) => {
    try {
      localStorage.setItem(ENABLED_CACHE_KEY, enabled ? 'true' : 'false');
    } catch {
      // best-effort only
    }
    // Consumed at most once: if this load follows a lockout sign-out and
    // the person just proved who they are again (Google/email re-login),
    // treat this session as already unlocked instead of asking for the PIN
    // they just got locked out of.
    const bypass = sessionStorage.getItem(LOCKOUT_BYPASS_KEY) === 'true';
    if (bypass) {
      sessionStorage.removeItem(LOCKOUT_BYPASS_KEY);
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
    }
    set((state) => ({
      _storedPin: pin,
      enabled,
      pinLoaded: true,
      failedAttempts: 0,
      // Only derive `locked` from the remote state the very first time it
      // loads (matches what the old localStorage-backed init() used to do).
      // Once loaded, later remote updates (e.g. another device changing the
      // PIN) shouldn't yank the lock screen open/shut on this device.
      locked: bypass ? false : state.pinLoaded ? state.locked : enabled && !isUnlockedThisSession(),
    }));
  },

  setPin: async (pin: string) => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    try {
      localStorage.setItem(ENABLED_CACHE_KEY, 'true');
    } catch {
      // best-effort only
    }
    if (isAnonymous(user)) {
      writeGuestAppLock(user.uid, { pin, enabled: true });
      set({ _storedPin: pin, enabled: true, pinLoaded: true, pinAttemptError: null, failedAttempts: 0 });
      return;
    }
    const ref = doc(db, 'users', user.uid, 'meta', 'appLock');
    await setDoc(ref, { pin, enabled: true }, { merge: true });
    // useAppLockSync's onSnapshot listener will also pick this up and call
    // syncFromRemote, but we update optimistically here too so the UI (e.g.
    // "App Lock is enabled") reflects it immediately rather than waiting on
    // the round-trip.
    set({ _storedPin: pin, enabled: true, pinLoaded: true, pinAttemptError: null, failedAttempts: 0 });
  },

  disable: async () => {
    const user = useAuthStore.getState().user;
    sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
    hiddenAt = null;
    try {
      localStorage.setItem(ENABLED_CACHE_KEY, 'false');
    } catch {
      // best-effort only
    }
    if (!user) {
      set({ enabled: false, locked: false, pinAttemptError: null, _storedPin: null, failedAttempts: 0 });
      return;
    }
    if (isAnonymous(user)) {
      writeGuestAppLock(user.uid, null);
      set({ enabled: false, locked: false, pinAttemptError: null, _storedPin: null, failedAttempts: 0 });
      return;
    }
    const ref = doc(db, 'users', user.uid, 'meta', 'appLock');
    await setDoc(ref, { pin: deleteField(), enabled: false }, { merge: true });
    set({ enabled: false, locked: false, pinAttemptError: null, _storedPin: null, failedAttempts: 0 });
  },

  unlock: (pin: string) => {
    const { _storedPin, failedAttempts } = get();
    if (_storedPin && pin === _storedPin) {
      sessionStorage.setItem(SESSION_UNLOCKED_KEY, 'true');
      set({ locked: false, pinAttemptError: null, failedAttempts: 0 });
      return true;
    }

    const attempts = failedAttempts + 1;
    if (attempts >= MAX_PIN_ATTEMPTS) {
      // Too many wrong guesses: sign out and send them to Login rather than
      // letting them keep guessing. Flag this session so that once they
      // prove who they are again (Google/email), the PIN screen is skipped
      // instead of immediately re-locking them out.
      set({ pinAttemptError: 'Too many incorrect attempts. Signing you out…', failedAttempts: 0 });
      sessionStorage.setItem(LOCKOUT_BYPASS_KEY, 'true');
      // Small delay so the message above is actually readable before the
      // screen switches to Login.
      window.setTimeout(() => {
        void useAuthStore.getState().logout();
      }, 900);
      return false;
    }

    set({ pinAttemptError: 'Incorrect PIN. Try again.', failedAttempts: attempts });
    return false;
  },

  lockNow: () => {
    if (get().enabled) {
      sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
      set({ locked: true, failedAttempts: 0, pinAttemptError: null });
    }
  },
}));
