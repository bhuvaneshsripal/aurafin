import { useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, deleteField, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useAvatarStore } from '../store/avatarStore';
import { useAppLockStore, readGuestAppLock } from '../store/appLockStore';

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
 * Check if a user is anonymous (guest)
 */
export function isAnonymousUser(user: any): boolean {
  return user?.isAnonymous === true;
}

/**
 * Get localStorage key for guest collection
 */
function getGuestStorageKey(uid: string, collectionName: string): string {
  return `aurafin-guest-${uid}-${collectionName}`;
}

/**
 * Load guest data from localStorage if available
 */
function loadGuestData<T extends { id: string }>(uid: string, collectionName: string): T[] {
  try {
    const key = getGuestStorageKey(uid, collectionName);
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

/**
 * Save guest data to localStorage
 */
export function saveGuestData<T>(uid: string, collectionName: string, items: T[]): void {
  try {
    const key = getGuestStorageKey(uid, collectionName);
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

/**
 * Generic two-way sync between a Firestore subcollection at
 * users/{uid}/{collectionName} and a local Zustand store slice.
 *
 * For guests (anonymous users), data is persisted to localStorage instead of Firestore.
 * For regular users, data syncs with Firestore in real-time.
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

    // For guest users, load from localStorage instead of Firestore
    if (isAnonymousUser(user)) {
      const items = loadGuestData<T>(user.uid, collectionName);
      setLocal(items);
      onSyncChange?.(false);
      return;
    }

    // For regular users, sync with Firestore
    const colRef = collection(db, 'users', user.uid, collectionName);
    const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
      setLocal(items);
      onSyncChange?.(snap.metadata.fromCache);
    });
    return () => unsub();
  }, [user, collectionName, setLocal, onSyncChange]);
}

/** Merges `incoming` on top of `existing`, but treats any key in `incoming`
 *  that's explicitly `undefined` as "clear this field" rather than "leave it
 *  alone" — matching what setDoc(..., {merge:true}) + deleteField() does for
 *  Firestore users (see upsertDoc below). Used for guest (localStorage)
 *  users so both storage paths behave identically. */
function mergeWithDeletes<T extends { id: string }>(existing: T, incoming: T): T {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    if (value === undefined) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged as T;
}

export async function upsertDoc<T extends { id: string }>(
  uidOrUser: string | { uid: string; isAnonymous?: boolean },
  collectionName: string,
  item: T
) {
  const uid = typeof uidOrUser === 'string' ? uidOrUser : uidOrUser.uid;
  const isGuest = typeof uidOrUser === 'object' && isAnonymousUser(uidOrUser);

  // For guests, save to localStorage.
  if (isGuest) {
    const items = loadGuestData<T>(uid, collectionName);
    const existing = items.find((i) => i.id === item.id);
    const updated = existing
      ? items.map((i) => (i.id === item.id ? mergeWithDeletes(existing, item) : i))
      : [...items, item];
    saveGuestData(uid, collectionName, updated);
    return;
  }

  // For regular users, save to Firestore with a field-level merge.
  //
  // Every save here goes through `merge: true` because callers only ever
  // send the fields *they* manage — e.g. the Edit Asset form doesn't know
  // about (and never sends) `colour`/`icon`/`accountType` from the Accounts
  // tab, or which household `profileId` the asset belongs to. A full
  // overwrite would silently wipe those out on every edit — which looks
  // exactly like the asset "disappearing" if the wiped `profileId` no
  // longer matches whichever household profile is currently active.
  //
  // But a plain merge has its own problem: with `ignoreUndefinedProperties:
  // true` (see firebase/config.ts), a field a form DOES manage but has
  // explicitly cleared — or that no longer applies after switching type
  // (e.g. dropping Symbol/quantity/shareLots when switching a Stock to Real
  // Estate) — comes through as `undefined` in `item`, which Firestore then
  // just omits from the write entirely rather than clearing it. Merged with
  // the old document, the stale value silently survives and can reappear
  // later, making Save look like it isn't applying the new values.
  //
  // The fix is to tell the two cases apart before writing: a key that's
  // simply absent from `item` (never touched by this form) is left alone by
  // `merge: true` as normal, while a key that IS present but `undefined`
  // (this form manages it and just cleared it) is converted to Firestore's
  // `deleteField()` sentinel so it's actually removed, merge or not.
  const ref = doc(db, 'users', uid, collectionName, item.id);
  const withDeletes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    withDeletes[key] = value === undefined ? deleteField() : value;
  }
  await setDoc(ref, withDeletes, { merge: true });
}

/**
 * Write many items in one Firestore batch (max 500 per Firestore's
 * own limit, chunked automatically here). Used for CSV/Excel imports.
 * For guests, items are saved to localStorage.
 */
export async function bulkUpsertDocs<T extends { id: string }>(
  uidOrUser: string | { uid: string; isAnonymous?: boolean },
  collectionName: string,
  items: T[]
) {
  const uid = typeof uidOrUser === 'string' ? uidOrUser : uidOrUser.uid;
  const isGuest = typeof uidOrUser === 'object' && isAnonymousUser(uidOrUser);

  // For guests, save all items to localStorage
  if (isGuest) {
    const existing = loadGuestData<T>(uid, collectionName);
    const merged = existing.filter((e) => !items.some((i) => i.id === e.id));
    saveGuestData(uid, collectionName, [...merged, ...items]);
    return;
  }

  // For regular users, save to Firestore in batches
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

export async function removeDoc(uidOrUser: string | { uid: string; isAnonymous?: boolean }, collectionName: string, id: string) {
  const uid = typeof uidOrUser === 'string' ? uidOrUser : uidOrUser.uid;
  const isGuest = typeof uidOrUser === 'object' && isAnonymousUser(uidOrUser);

  // For guests, remove from localStorage
  if (isGuest) {
    const items = loadGuestData<any>(uid, collectionName);
    const filtered = items.filter((i) => i.id !== id);
    saveGuestData(uid, collectionName, filtered);
    return;
  }

  // For regular users, remove from Firestore
  const ref = doc(db, 'users', uid, collectionName, id);
  await deleteDoc(ref);
}

/**
 * Keeps the custom profile-picture store (avatarStore) in sync with the
 * single doc at users/{uid}/meta/avatar. Call once near the app root
 * (alongside the other useFirestoreCollectionSync calls in DataSync).
 */
export function useAvatarSync() {
  const user = useAuthStore((s) => s.user);
  const setDataUrl = useAvatarStore((s) => s.setDataUrl);

  useEffect(() => {
    if (!user) {
      setDataUrl(null);
      return;
    }
    const ref = doc(db, 'users', user.uid, 'meta', 'avatar');
    const unsub = onSnapshot(
      ref,
      (snap) => setDataUrl((snap.data()?.dataUrl as string | undefined) ?? null),
      () => setDataUrl(null)
    );
    return () => unsub();
  }, [user, setDataUrl]);
}

/** Save (or overwrite) the user's custom profile picture. */
export async function saveAvatar(uid: string, dataUrl: string) {
  const ref = doc(db, 'users', uid, 'meta', 'avatar');
  await setDoc(ref, { dataUrl }, { merge: true });
}

/** Remove the custom profile picture, falling back to the Google photo (if
 *  any) or initials. */
export async function removeAvatar(uid: string) {
  const ref = doc(db, 'users', uid, 'meta', 'avatar');
  await deleteDoc(ref);
}

/**
 * Keeps the App Lock PIN (appLockStore) in sync with its source of truth:
 * the doc at users/{uid}/meta/appLock for regular users, or a per-guest
 * localStorage key for anonymous users — same split every other synced
 * collection in this file uses. This is what makes the PIN live in data
 * storage instead of localStorage: only the guest fallback (and a
 * non-secret "was a lock enabled" cache flag inside appLockStore itself)
 * ever touch localStorage.
 */
export function useAppLockSync() {
  const user = useAuthStore((s) => s.user);
  const syncFromRemote = useAppLockStore((s) => s.syncFromRemote);

  useEffect(() => {
    if (!user) {
      syncFromRemote(null, false);
      return;
    }

    if (isAnonymousUser(user)) {
      const guest = readGuestAppLock(user.uid);
      syncFromRemote(guest?.pin ?? null, !!guest?.enabled);
      return;
    }

    const ref = doc(db, 'users', user.uid, 'meta', 'appLock');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        syncFromRemote((data?.pin as string | undefined) ?? null, !!data?.enabled);
      },
      () => syncFromRemote(null, false)
    );
    return () => unsub();
  }, [user, syncFromRemote]);
}

/**
 * Marks one profile as the account's default (the one a fresh login on a
 * new device should open to) and un-marks every other profile, in a single
 * batch. This is what makes "Set default" in Settings apply everywhere the
 * account is signed in, not just on the device that set it.
 */
export async function setDefaultProfile(uid: string, allProfileIds: string[], defaultId: string) {
  const batch = writeBatch(db);
  allProfileIds.forEach((id) => {
    const ref = doc(db, 'users', uid, 'profiles', id);
    batch.set(ref, { isDefault: id === defaultId }, { merge: true });
  });
  await batch.commit();
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
