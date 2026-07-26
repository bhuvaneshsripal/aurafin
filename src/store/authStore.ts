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
    // forever, fall through to the Login screen after a few seconds — if
    // the person is actually still signed in, onAuthStateChanged will still
    // fire whenever it does resolve and log them back in automatically.
    setTimeout(() => {
      if (!resolved) set({ loading: false });
    }, 2500);
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
