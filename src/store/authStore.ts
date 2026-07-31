import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';

// Set the moment a brand-new account is created (email/password sign-up, or
// a Google sign-in Firebase reports as `isNewUser`), and cleared once the
// onboarding wizard finishes or is skipped. Namespaced per-uid so switching
// accounts on the same device doesn't leak one person's onboarding state to
// another.
function onboardingKey(uid: string) {
  return `aurafin-needs-onboarding-${uid}`;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  needsOnboarding: boolean;
  init: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => void;
}

// Firebase's own local-persistence layer writes a "firebase:authUser:..."
// key to localStorage the moment someone signs in, and only clears it on
// sign-out. Its presence means "a session should exist" — so on refresh we
// can tell apart "definitely never logged in" (safe to show Login almost
// immediately) from "was logged in, just waiting on Firebase to confirm it"
// (worth waiting longer, so a slow network doesn't flash the login screen
// for an already-signed-in person).
function hasPersistedSession(): boolean {
  try {
    return Object.keys(localStorage).some(
      (key) => key.startsWith('firebase:authUser:') && localStorage.getItem(key)
    );
  } catch {
    // localStorage can throw in some private/locked-down browser modes —
    // treat that as "unknown", not "definitely no session".
    return false;
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: true,
  needsOnboarding: false,
  init: () => {
    let resolved = false;
    onAuthStateChanged(
      auth,
      (user) => {
        resolved = true;
        set({
          user,
          loading: false,
          needsOnboarding: user ? localStorage.getItem(onboardingKey(user.uid)) === 'true' : false,
        });
      },
      (error) => {
        // The listener itself failed (rare, but possible on restricted
        // storage/network) — don't leave the app stuck on "Loading…".
        console.error('Auth state error', error);
        resolved = true;
        set({ user: null, loading: false });
      }
    );
    // Safety net: on some mobile browsers/PWAs (storage restrictions, slow
    // networks, privacy-shield extensions), Firebase's auth-state check can
    // stall and never call back at all. Rather than hang on "Loading…"
    // forever, fall through eventually — if the person is actually still
    // signed in, onAuthStateChanged will still fire whenever it does
    // resolve and log them back in automatically.
    //
    // The timeout is longer when a persisted session exists, so a slow
    // network doesn't cause an already-logged-in person to see the Login
    // screen flash up before the real auth state arrives — they just see
    // the loading spinner a little longer instead.
    const fallbackDelay = hasPersistedSession() ? 12000 : 2500;
    setTimeout(() => {
      if (!resolved) set({ loading: false });
    }, fallbackDelay);
  },
  loginWithGoogle: async () => {
    const result = await signInWithPopup(auth, googleProvider);
    if (getAdditionalUserInfo(result)?.isNewUser) {
      localStorage.setItem(onboardingKey(result.user.uid), 'true');
      set({ needsOnboarding: true });
    }
  },
  loginWithEmail: async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  },
  registerWithEmail: async (email, password) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    localStorage.setItem(onboardingKey(result.user.uid), 'true');
    set({ needsOnboarding: true });
  },
  logout: async () => {
    await signOut(auth);
  },
  completeOnboarding: () => {
    const uid = get().user?.uid;
    if (uid) localStorage.removeItem(onboardingKey(uid));
    set({ needsOnboarding: false });
  },
}));
