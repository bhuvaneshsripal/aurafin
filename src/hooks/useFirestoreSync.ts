import { useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';

/** Every subcollection kept under users/{uid} that DataSync listens to. */
const ALL_USER_COLLECTIONS = ['assets', 'liabilities', 'goals', 'transactions', 'snapshots'] as const;

/**
 * Generic two-way sync between a Firestore subcollection at
 * users/{uid}/{collectionName} and a local Zustand store slice.
 *
 * setLocal replaces the in-memory list whenever the remote data changes.
 */
export function useFirestoreCollectionSync<T extends { id: string }>(
  collectionName: string,
  setLocal: (items: T[]) => void
) {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) return;
    const colRef = collection(db, 'users', user.uid, collectionName);
    const unsub = onSnapshot(colRef, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      setLocal(items);
    });
    return () => unsub();
  }, [user, collectionName, setLocal]);
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
