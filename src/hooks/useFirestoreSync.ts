import { useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';

/** Every subcollection kept under users/{uid} that DataSync listens to. */
const ALL_USER_COLLECTIONS = [
  'assets',
  'liabilities',
  'goals',
  'transactions',
  'snapshots',
  'budgets',
  'financialProfile',
  'profiles',
] as const;

/**
 * Generic two-way sync between a Firestore subcollection at
 * users/{uid}/{collectionName} and a local Zustand store slice.
 *
 * setLocal replaces the in-memory list whenever the remote data changes.
 *
 * With offline persistence enabled (see firebase/config.ts), onSnapshot
 * fires immediately with whatever is in the local IndexedDB cache — which
 * can be a few seconds stale right after a refresh (e.g. an edit made just
 * before reloading hasn't finished writing to the cache yet). It then fires
 * again moments later once the server confirms. `onSyncChange`, if passed,
 * reports whether the *current* data is cache-only or server-confirmed, so
 * screens that show a computed total (like Net Worth) can hold off on
 * rendering a number until it's guaranteed correct instead of flashing a
 * stale one and then correcting it.
 */
export function useFirestoreCollectionSync<T extends { id: string }>(
  collectionName: string,
  setLocal: (items: T[]) => void,
  onSyncChange?: (fromCache: boolean) => void
) {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, 'users', user.uid, collectionName);
    const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      setLocal(items);
      onSyncChange?.(snap.metadata.fromCache);
    });
    return () => unsub();
  }, [user, collectionName, setLocal, onSyncChange]);
}

export async function upsertDoc<T extends { id: string }>(
  uid: string,
  collectionName: string,
  item: T
) {
  const ref = doc(db, 'users', uid, collectionName, item.id);
  await setDoc(ref, item, { merge: true });
}

/**
 * Write many items in one Firestore batch (max 500 per Firestore's
 * own limit, chunked automatically here). Used for CSV/Excel imports.
 */
export async function bulkUpsertDocs<T extends { id: string }>(
  uid: string,
  collectionName: string,
  items: T[]
) {
  const chunkSize = 450;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const ref = doc(db, 'users', uid, collectionName, item.id);
      batch.set(ref, item, { merge: true });
    });
    await batch.commit();
  }
}

export async function removeDoc(uid: string, collectionName: string, id: string) {
  const ref = doc(db, 'users', uid, collectionName, id);
  await deleteDoc(ref);
}

/**
 * Backfill a missing `profileId` on legacy records (assets, liabilities,
 * goals, transactions created before household profiles existed). Only
 * called when there's exactly one profile, since that's the only case
 * where "whose data is this" is unambiguous — once a second profile
 * exists, unassigned data is left alone rather than guessed at.
 */
export async function assignOrphanDataToProfile<T extends { id: string; profileId?: string }>(
  uid: string,
  collectionName: string,
  items: T[],
  profileId: string
) {
  const orphans = items.filter((item) => !item.profileId);
  if (!orphans.length) return;
  await bulkUpsertDocs(
    uid,
    collectionName,
    orphans.map((item) => ({ ...item, profileId }))
  );
}

/**
 * Move every record currently tagged with `fromProfileId` over to
 * `toProfileId` — used to correct a mis-assignment (e.g. data claimed
 * under the wrong profile).
 */
export async function reassignProfileData<T extends { id: string; profileId?: string }>(
  uid: string,
  collectionName: string,
  items: T[],
  fromProfileId: string,
  toProfileId: string
) {
  const matching = items.filter((item) => item.profileId === fromProfileId);
  if (!matching.length) return;
  await bulkUpsertDocs(
    uid,
    collectionName,
    matching.map((item) => ({ ...item, profileId: toProfileId }))
  );
}

/**
 * Wipes every asset, liability, goal, transaction, and snapshot doc under
 * users/{uid}. Used by Settings > Data > "Delete all data". The live
 * onSnapshot listeners in DataSync pick up the deletions automatically and
 * clear out the local stores, so there's nothing else to reset by hand.
 */
export async function deleteAllUserData(uid: string) {
  for (const collectionName of ALL_USER_COLLECTIONS) {
    const colRef = collection(db, 'users', uid, collectionName);
    const snap = await getDocs(colRef);
    if (snap.empty) continue;

    const chunkSize = 450;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += chunkSize) {
      const batch = writeBatch(db);
      docs.slice(i, i + chunkSize).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}
