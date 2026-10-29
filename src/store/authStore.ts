import { removePushSubscription } from '../hooks/usePushSubscription';
import { create } from 'zustand';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signOut,
  signInAnonymously,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import { useSyncStatusStore } from './syncStatusStore';
import { clearDataBackups } from '../utils/dataBackup';

// Set the moment a brand-new account is created (email/password sign-up, or
// a Google sign-in Firebase reports as `isNewUser`), and cleared once the
// onboarding wizard finishes or is skipped. Namespaced per-uid so switching
// accounts on the same device doesn't leak one person's onboarding state to
// another.
function onboardingKey(uid: string) {
  return `aurafin-needs-onboarding-${uid}`;
}

// A trimmed-down, non-sensitive snapshot of the signed-in user - just
// enough for every screen that reads user.uid/user.email/etc (nothing in
// this app calls Firebase-specific methods like getIdToken() on the
// store's `user`; Firestore's own SDK manages the real token internally
// via `auth.currentUser`). Safe to keep in localStorage and safe to trust
// optimistically for a frame or two, since it grants no access by itself -
// Firestore's security rules are enforced against the real Firebase ID
// token, not against anything read from here.
//
// `isAnonymous` is kept too: a guest's data lives in localStorage while a signed-in
// user's lives in Firestore, so the very first render (before Firebase confirms the
// session) must already know which kind of account this is. Without it, a guest
// was briefly treated as a normal user on every reload — their saved data was
// looked up in Firestore, found nothing, and showed an empty account for a moment.
type CachedUser = Pick<User, 'uid' | 'email' | 'displayName' | 'photoURL'> & { isAnonymous?: boolean };

const CACHED_USER_KEY = 'aurafin-cached-user';

// localStorage can throw (private/locked-down browser modes, quota). These
// wrappers keep a storage hiccup from turning a successful sign-in/sign-up
// into a visible error.
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* worst case: onboarding isn't remembered across reloads */
  }
}
function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to clean up */
  }
}

function readCachedUser(): CachedUser | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.uid === 'string') return parsed as CachedUser;
    return null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (!user) {
      localStorage.removeItem(CACHED_USER_KEY);
      return;
    }
    const cached: CachedUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      isAnonymous: user.isAnonymous,
    };
    localStorage.setItem(CACHED_USER_KEY, JSON.stringify(cached));
  } catch {
    // localStorage can throw in some private/locked-down browser modes -
    // worst case we just lose the optimistic-render fast path next time.
  }
}

interface AuthState {
  user: User | CachedUser | null;
  loading: boolean;
  // True while we're showing a cached user optimistically and Firebase
  // hasn't confirmed (or refuted) that session yet. Unlike `loading`, this
  // never blocks rendering - it's only there for UI that wants to show a
  // subtle "syncing" indicator instead of a blocking spinner.
  verifying: boolean;
  needsOnboarding: boolean;
  init: () => void;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string) => Promise<void>;
  loginAsGuest: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  completeOnboarding: () => void;
}

const cachedUser = readCachedUser();

// Guards against re-subscribing onAuthStateChanged multiple times - e.g.
// React StrictMode's mount/unmount/remount of effects in development, or
// any component that ends up calling init() more than once. Without this,
// every extra call opened a second listener, which meant every downstream
// Firestore sync effect that depends on `user` (see DataSync in App.tsx)
// re-ran and re-rendered redundantly.
let authInitialized = false;

export const useAuthStore = create<AuthState>((set, get) => ({
  // Hydrate synchronously from the last known session so the very first
  // render already has a user (when one exists) instead of starting blank
  // and waiting on Firebase's async callback.
  user: cachedUser,
  loading: !cachedUser,
  verifying: !!cachedUser,
  needsOnboarding: cachedUser ? safeGet(onboardingKey(cachedUser.uid)) === 'true' : false,
  init: () => {
    if (authInitialized) return;
    authInitialized = true;

    let resolved = false;
    onAuthStateChanged(
      auth,
      (user) => {
        resolved = true;
        writeCachedUser(user);
        set({
          user,
          loading: false,
          verifying: false,
          needsOnboarding: user ? safeGet(onboardingKey(user.uid)) === 'true' : false,
        });
      },
      (error) => {
        // The listener itself failed (rare, but possible on restricted
        // storage/network) - don't leave the app stuck on "Loading...", and
        // don't keep trusting a cached user we can no longer verify.
        console.error('Auth state error', error);
        resolved = true;
        writeCachedUser(null);
        set({ user: null, loading: false, verifying: false });
      }
    );
    // Safety net: on some mobile browsers/PWAs (storage restrictions, slow
    // networks, privacy-shield extensions), Firebase's auth-state check can
    // stall and never call back at all. Rather than hang forever, fall
    // through eventually:
    //  - if we have a cached user, we're already rendering the app, so this
    //    only clears the "verifying" flag - nothing the person sees changes;
    //  - if we don't, this is what lets a genuinely-logged-out visitor reach
    //    the Login screen instead of staring at a spinner indefinitely.
    const fallbackDelay = cachedUser ? 6000 : 2500;
    setTimeout(() => {
      if (!resolved) set({ loading: false, verifying: false });
    }, fallbackDelay);
  },
  loginWithGoogle: async () => {
    const result = await signInWithPopup(auth, googleProvider);
    if (getAdditionalUserInfo(result)?.isNewUser) {
      safeSet(onboardingKey(result.user.uid), 'true');
      set({ needsOnboarding: true });
    }
  },
  loginWithEmail: async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  },
  registerWithEmail: async (email, password) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    safeSet(onboardingKey(result.user.uid), 'true');
    set({ needsOnboarding: true });
  },
  resetPassword: async (email) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (e) {
      // Don't reveal whether an address has an account (account enumeration):
      // an unknown email looks exactly like a successful send.
      if ((e as { code?: string })?.code === 'auth/user-not-found') return;
      throw e;
    }
  },
  loginAsGuest: async () => {
    const result = await signInAnonymously(auth);
    // Guests need to see onboarding/intro questions just like new sign-ups
    safeSet(onboardingKey(result.user.uid), 'true');
    set({ needsOnboarding: true });
  },
  logout: async () => {
    const currentUser = get().user;
    // Clear all guest localStorage data when logging out
    if (currentUser && (currentUser as any).isAnonymous === true) {
      const guestCollections = ['assets', 'liabilities', 'goals', 'transactions', 'snapshots', 'budgets', 'financialProfile', 'profiles'];
      guestCollections.forEach((collection) => {
        safeRemove(`aurafin-guest-${currentUser.uid}-${collection}`);
      });
    }
    // Stop server alerts for this account on this device (needs the session, so before signOut).
    if (currentUser && (currentUser as any).isAnonymous !== true) await removePushSubscription(currentUser.uid);
    await signOut(auth);
    writeCachedUser(null);
    clearDataBackups(); // don't leave this account's last-known data on the device
    // So the next sign-in on this tab (a different account, or the same one
    // fresh) doesn't inherit stale "server already confirmed" flags from
    // before its own data has actually loaded — that would suppress the
    // loading skeletons and briefly show the previous/wrong totals as if
    // they were confirmed.
    useSyncStatusStore.getState().reset();
  },
  completeOnboarding: () => {
    const uid = get().user?.uid;
    if (uid) safeRemove(onboardingKey(uid));
    set({ needsOnboarding: false });
  },
}));
