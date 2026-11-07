import { useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { isAnonymousUser } from './useFirestoreSync';
import { WATCHLIST_CHANGED_EVENT } from '../utils/savedStocks';
import {
  applySnapshot,
  isEmptySnapshot,
  mergeSnapshots,
  readSnapshot,
  readSyncedAt,
  sanitizeRemote,
  toPlain,
  writeSyncedAt,
} from '../utils/watchlistSync';

/**
 * Keeps the Watchlist (saved stocks, price alerts, playlists, notes) in step across devices via
 * users/{uid}/meta/watchlist. The device's localStorage stays the instant, offline copy that the
 * rest of the app reads; this hook only moves it to and from the cloud. Newest write wins, and a
 * device that already holds its own data when it first connects merges with the cloud copy rather
 * than overwriting it. Guest accounts stay device-only, like the rest of the app.
 */
export function useWatchlistSync() {
  const user = useAuthStore((s) => s.user);
  const uid = user && !isAnonymousUser(user) ? user.uid : null;

  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'meta', 'watchlist');
    let timer: number | undefined;
    let dirty = false;

    const push = () => {
      window.clearTimeout(timer);
      timer = undefined;
      dirty = false;
      const at = Date.now();
      writeSyncedAt(uid, at);
      setDoc(ref, { ...toPlain(readSnapshot()), updatedAt: at }).catch(() => {
        // Not confirmed: the cloud copy is now older than this device, so the next
        // snapshot / change / app open sends it again.
      });
    };
    const schedulePush = (delay: number) => {
      dirty = true;
      window.clearTimeout(timer);
      timer = window.setTimeout(push, delay);
    };

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const localAt = readSyncedAt(uid);
        const local = readSnapshot();
        if (!snap.exists()) {
          // An offline cache miss says nothing about the cloud; only trust a server answer.
          if (!snap.metadata.fromCache && !isEmptySnapshot(local)) schedulePush(0);
          return;
        }
        const data = snap.data();
        const remoteAt = Number(data.updatedAt) || 0;
        const remote = sanitizeRemote(data);
        if (localAt === 0) {
          // First time this device meets the cloud copy.
          if (isEmptySnapshot(local)) {
            applySnapshot(remote);
            writeSyncedAt(uid, remoteAt);
          } else {
            applySnapshot(mergeSnapshots(remote, local));
            schedulePush(0);
          }
        } else if (remoteAt > localAt) {
          applySnapshot(remote);
          writeSyncedAt(uid, remoteAt);
        } else if (remoteAt < localAt && !snap.metadata.hasPendingWrites) {
          schedulePush(0);
        }
      },
      () => {
        /* offline / permission error: keep working from the device copy */
      }
    );

    const onChange = () => schedulePush(600);
    const flush = () => {
      if (dirty) push();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener(WATCHLIST_CHANGED_EVENT, onChange);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flush();
      unsub();
      window.clearTimeout(timer);
      window.removeEventListener(WATCHLIST_CHANGED_EVENT, onChange);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [uid]);
}
