import { useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useNotificationPreferencesStore } from '../store/notificationPreferencesStore';
import { isAnonymousUser } from './useFirestoreSync';

/**
 * Keeps the Settings > Notifications switches (weekly digest, budget alerts and the Advanced options)
 * the same on every device, through users/{uid}/meta/notificationPrefs.
 *
 * localStorage stays the instant, offline copy the rest of the app reads. A change made on any device is
 * saved to the cloud within a moment and shows up on the other devices live (no refresh). If two devices
 * disagree, the most recent change wins. Guests are device-only, like the rest of the app.
 *
 * `hydrated` in the store turns true only after this account's saved settings have been read, so the
 * digest hook never writes a device's default "on" over a switch that was turned off somewhere else.
 */
const PUSH_DELAY_MS = 400;

export function useNotificationPrefsSync() {
  const user = useAuthStore((s) => s.user);
  const uid = user && !isAnonymousUser(user) ? user.uid : null;

  useEffect(() => {
    const store = useNotificationPreferencesStore;
    if (!uid) {
      store.getState().setHydrated(false);
      return;
    }
    store.getState().resetForAccount(uid);

    const ref = doc(db, 'users', uid, 'meta', 'notificationPrefs');
    let timer: number | undefined;
    // updatedAt of the copy that came from the cloud, so applying it is not mistaken for a local change.
    let remoteAt = -1;

    const push = () => {
      window.clearTimeout(timer);
      timer = undefined;
      const { prefs, advanced, updatedAt } = store.getState();
      // Not confirmed => still newer here than in the cloud; the next snapshot / change / app open retries.
      setDoc(ref, { prefs, advanced, updatedAt }).catch(() => {});
    };

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const s = store.getState();
        if (!snap.exists()) {
          // An offline cache miss says nothing about the cloud; only trust a server answer.
          if (snap.metadata.fromCache) return;
          if (s.updatedAt > 0) push(); // first device: save what it already has
          s.setHydrated(true);
          return;
        }
        const data = snap.data();
        const at = Number(data.updatedAt) || 0;
        if (at > s.updatedAt) {
          window.clearTimeout(timer);
          timer = undefined;
          remoteAt = at;
          s.applyRemote(data.prefs ?? {}, data.advanced ?? {}, at);
        } else if (at < s.updatedAt && !snap.metadata.hasPendingWrites) {
          push();
        }
        s.setHydrated(true);
      },
      () => {}
    );

    const unsubStore = store.subscribe((s, prev) => {
      if (s.updatedAt === prev.updatedAt || s.updatedAt === remoteAt) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(push, PUSH_DELAY_MS);
    });

    return () => {
      window.clearTimeout(timer);
      unsub();
      unsubStore();
      store.getState().setHydrated(false);
    };
  }, [uid]);
}
