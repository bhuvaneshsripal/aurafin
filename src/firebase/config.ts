import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence, signInAnonymously } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { isSupported, getAnalytics, type Analytics } from 'firebase/analytics';

// Fill these in with your own Firebase project credentials.
// Create a project at https://console.firebase.google.com, enable
// Authentication (Email/Password + Google) and Firestore, then paste
// the config values below or into a .env file (see .env.example).
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Explicit, rather than relying on the SDK's implicit default: keeps the
// signed-in session in IndexedDB/localStorage indefinitely, surviving both
// a page refresh and fully closing/reopening the browser or installed PWA.
void setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('Could not set Firebase Auth persistence, falling back to default.', err);
});
// ignoreUndefinedProperties is important here: every asset/liability form
// (e.g. optional fields like interest rate, invested value, maturity date)
// saves with several fields set to `undefined` when left blank. Firestore's
// default setDoc() throws on `undefined` values, which made "Save" silently
// fail (the promise rejected before setModalOpen(false) ran) whenever any
// optional field was empty.
//
// localCache: persistentLocalCache turns on IndexedDB-backed offline
// persistence — on a refresh, onSnapshot() listeners resolve instantly from
// the local cache (no more waiting on a fresh network round-trip before the
// screen shows data) and then reconcile with the server in the background.
//
// persistentMultipleTabManager (not persistentSingleTabManager) is required
// here: with a single-tab manager, only the *first* tab/window of the site
// gets the cache lock — every other tab or window opened afterwards (e.g.
// leaving the app open while also checking the Vercel dashboard, or simply
// having two windows open) sits there waiting on a lock that never frees up,
// which looks exactly like being stuck on "Loading...".
//
// initializeFirestore() itself can also throw synchronously in browsers/modes
// that restrict IndexedDB (private windows, some browsers' strict shields),
// so this falls back to a plain in-memory Firestore instance rather than
// crashing the whole app before React even renders.
function createFirestore() {
  try {
    return initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (err) {
    console.warn('Firestore offline persistence unavailable, falling back to memory cache.', err);
    return initializeFirestore(app, { ignoreUndefinedProperties: true });
  }
}

export const db = createFirestore();
export const googleProvider = new GoogleAuthProvider();

// Analytics only works in a browser that supports it (and is a no-op
// during SSR or in unsupported environments), so it's initialized
// lazily and exported as a promise that resolves to null if unavailable.
export const analyticsPromise: Promise<Analytics | null> = isSupported()
  .then((supported) => (supported && firebaseConfig.measurementId ? getAnalytics(app) : null))
  .catch(() => null);
