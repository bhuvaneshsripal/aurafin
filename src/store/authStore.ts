import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';

interface AuthState {
  user: User | null;
  loading: boolean;
  init: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
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

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  init: () => {
    let resolved = false;
    onAuthStateChanged(
      auth,
      (user) => {
        resolved = true;
        set({ user, loading: false });
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
    await signInWithPopup(auth, googleProvider);
  },
  loginWithEmail: async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  },
  registerWithEmail: async (email, password) => {
    await createUserWithEmailAndPassword(auth, email, password);
  },
  logout: async () => {
    await signOut(auth);
  },
}));
