import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore';
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
// This is what was making every page look stuck on "Loading..." after a
// refresh.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
});
export const googleProvider = new GoogleAuthProvider();

// Analytics only works in a browser that supports it (and is a no-op
// during SSR or in unsupported environments), so it's initialized
// lazily and exported as a promise that resolves to null if unavailable.
export const analyticsPromise: Promise<Analytics | null> = isSupported()
  .then((supported) => (supported && firebaseConfig.measurementId ? getAnalytics(app) : null))
  .catch(() => null);
