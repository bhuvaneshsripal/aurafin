import { useEffect, useRef } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, deleteField, writeBatch, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useAvatarStore } from '../store/avatarStore';
import { useAppLockStore, readGuestAppLock } from '../store/appLockStore';
import { useDisplaySettingsStore, type EyePos } from '../store/displaySettingsStore';
import { useWealthFilterStore, type WealthFilterSelection } from '../store/wealthFilterStore';
import { useSyncStatusStore } from '../store/syncStatusStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useSnapshotsStore } from '../store/snapshotsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { resolveAssetValues } from '../utils/assetValues';
import { isFullySold } from '../utils/investmentPnl';
import { toIsoDate } from '../utils/date';
import { readBackup, writeBackup } from '../utils/dataBackup';
import { allPending, applyPending, confirmPending, pendingFor, pendingItem, recordPending } from '../utils/pendingWrites';
import { getNetworkQuality, useNetworkStore } from '../store/networkStore';
import { toast } from '../store/toastStore';
import type { HouseholdProfile, Snapshot } from '../types';

/** Every subcollection kept under users/{uid} that DataSync listens to.
 *  Exported so App.tsx can check that every one of them has completed its
 *  first load before it renders the real app instead of a loading screen. */
export const ALL_USER_COLLECTIONS = [
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
    if (!data) return [];
    const parsed = JSON.parse(data);
    // Corrupted/foreign JSON must never crash every page that maps over it.
    return Array.isArray(parsed) ? (parsed as T[]) : [];
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
 * A signed-in (Firestore) user's writes come back to the screen on their own:
 * the onSnapshot listener fires straight away and refills the store. A guest's
 * writes only go to localStorage, which nothing watches — so before this, a
 * guest who saved an asset, goal or transaction saw nothing change until they
 * refreshed the page. While a guest is signed in, each collection's sync hook
 * registers its store setter here, and guest writes call it with the new list.
 */
const guestStoreSetters = new Map<string, (items: any[]) => void>();

function refreshGuestStore(collectionName: string, items: unknown[]) {
  guestStoreSetters.get(collectionName)?.(items);
}

/** Guest equivalent of `deleteAllUserData`: empties every collection in localStorage and in the stores. */
function clearGuestData(uid: string) {
  for (const collectionName of ALL_USER_COLLECTIONS) {
    try {
      localStorage.removeItem(getGuestStorageKey(uid, collectionName));
    } catch {
      /* storage unavailable — nothing to clear */
    }
    refreshGuestStore(collectionName, []);
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
  const markCollectionLoaded = useSyncStatusStore((s) => s.markCollectionLoaded);
  const markCollectionServerConfirmed = useSyncStatusStore((s) => s.markCollectionServerConfirmed);

  // Depend on `uid`/`anonymous` rather than the `user` object itself.
  // Firebase can hand `onAuthStateChanged` a fresh User object for the same
  // signed-in account (not just on genuine sign-in/sign-out), and since
  // that object is stored as-is in authStore, it changes reference too.
  // Keying the effect on the object would tear the listener down and
  // re-subscribe on every such change — and the replacement listener
  // starts from nothing, so `setLocal` gets called with `[]`/cached-stale
  // data for a moment, overwriting whatever real data was already on
  // screen. Keying on the primitives that actually determine which
  // Firestore path we're listening to avoids that entirely.
  const uid = user?.uid;
  const anonymous = user ? isAnonymousUser(user) : false;

  useEffect(() => {
    if (!uid) return;

    // For guest users, load from localStorage instead of Firestore
    if (anonymous) {
      const items = loadGuestData<T>(uid, collectionName);
      setLocal(items);
      onSyncChange?.(false);
      markCollectionLoaded(collectionName);
      markCollectionServerConfirmed(collectionName);
      // Let guest writes (upsertDoc/removeDoc/...) refresh this store — see guestStoreSetters.
      guestStoreSetters.set(collectionName, setLocal as (items: any[]) => void);
      return () => {
        if (guestStoreSetters.get(collectionName) === (setLocal as unknown)) guestStoreSetters.delete(collectionName);
      };
    }

    // For regular users, sync with Firestore
    const colRef = collection(db, 'users', uid, collectionName);
    let first = true;

    // Show the last-known data right away (before Firestore answers, and
    // even if the network never does). It is replaced by real data the
    // moment a snapshot arrives; it does NOT count as server-confirmed.
    const backup = (() => {
      const b = readBackup<T>(uid, collectionName);
      return b ? applyPending(uid, collectionName, b) : b;
    })();
    if (backup && backup.length > 0) {
      setLocal(backup);
      markCollectionLoaded(collectionName);
      // Pages hold back headline numbers (and show "no assets yet") until a
      // collection is "known". Real saved data is known data -- without
      // this, offline the screen would sit on a skeleton or, worse, fall
      // through to the empty state instead of showing what you last saw.
      onSyncChange?.(false);
      markCollectionServerConfirmed(collectionName);
    }

    const unsub = onSnapshot(colRef, { includeMetadataChanges: true }, (snap) => {
      // An empty answer that came only from the local cache, while we hold
      // a saved copy with data, is a cache miss rather than "you deleted
      // everything" — keep showing the saved data. A genuinely empty
      // collection arrives from the server (fromCache === false).
      if (snap.metadata.fromCache && snap.empty && backup && backup.length > 0) {
        first = false;
        onSyncChange?.(false);
        markCollectionLoaded(collectionName);
        markCollectionServerConfirmed(collectionName);
        return;
      }
      // Metadata-only snapshots (cache -> server confirmation with identical
      // data) carry no document changes; skip rebuilding the array so every
      // subscribed screen doesn't re-render for nothing.
      const dataChanged = first || snap.docChanges().length > 0;
      first = false;
      if (dataChanged) {
        // Saves not yet confirmed by Firestore (e.g. you edited and refreshed
        // straight away) stay on top, so a stale snapshot can't revert them.
        const items = applyPending(
          uid,
          collectionName,
          snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)
        );
        setLocal(items);
        writeBackup(uid, collectionName, items);
      }
      // A server answer is always trusted. A cache-only answer is trusted
      // when it actually contains data (that is what makes offline show your
      // last-seen numbers); a cache-only *empty* answer is not, because it
      // may just mean "nothing cached yet" -- showing "no assets" for that
      // would be wrong.
      const trusted = !snap.metadata.fromCache || !snap.empty;
      onSyncChange?.(!trusted);
      markCollectionLoaded(collectionName);
      if (trusted) markCollectionServerConfirmed(collectionName);
    });
    // Re-send anything saved before the last refresh that never got confirmed.
    for (const p of pendingFor(uid, collectionName)) {
      const ref = doc(db, 'users', uid, collectionName, p.id);
      const send = p.op === 'del' ? deleteDoc(ref) : setDoc(ref, toWrite(pendingItem(p)), { merge: true });
      void send.then(() => confirmPending(uid, collectionName, p.id, p.at)).catch(() => {});
    }
    return () => unsub();
  }, [uid, anonymous, collectionName, setLocal, onSyncChange, markCollectionLoaded, markCollectionServerConfirmed]);
}

/** Shown when a save is kept on the device because the connection is weak. */
const QUEUED_MSG = 'Low network — saved on this device. It will sync when your connection is back.';
const OFFLINE_MSG = 'No network — saved on this device. It will sync when you are back online.';
const FAILED_MSG = "Couldn't save to the server right now. Your change is kept and will retry.";

/** True when a save should be queued instead of awaited. Firestore's write
 *  promises only resolve once the SERVER acknowledges, so on a weak or dead
 *  connection awaiting them would leave the Save button hanging. */
function shouldQueue(): boolean {
  return getNetworkQuality() !== 'good';
}

function announceQueued() {
  toast.bottom.info(getNetworkQuality() === 'offline' ? OFFLINE_MSG : QUEUED_MSG, 5000);
}

/** Sends a write without blocking the caller. The journal entry (see
 *  utils/pendingWrites.ts) is removed once the server confirms; if the write
 *  fails outright, the entry stays so it is retried on reconnect/startup. */
function sendInBackground(send: Promise<unknown>, onConfirmed: () => void) {
  send.then(onConfirmed).catch((err) => {
    console.warn('Queued save failed, will retry when the connection returns.', err);
    toast.bottom.error(FAILED_MSG, 5000);
  });
}

let flushing = false;

/** Re-sends every journaled save/delete for `uid`. Returns how many it sent. */
export async function flushPendingWrites(uid: string): Promise<number> {
  if (flushing) return 0;
  const list = allPending(uid);
  if (list.length === 0) return 0;
  flushing = true;
  try {
    await Promise.all(
      list.map((p) => {
        const ref = doc(db, 'users', uid, p.col, p.id);
        const send = p.op === 'del' ? deleteDoc(ref) : setDoc(ref, toWrite(pendingItem(p)), { merge: true });
        return send.then(() => confirmPending(uid, p.col, p.id, p.at));
      })
    );
    return list.length;
  } finally {
    flushing = false;
  }
}

/** When the connection comes back, pushes everything that was saved while it
 *  was weak/offline and tells the user it synced. Mount once (see DataSync). */
export function usePendingFlush() {
  const user = useAuthStore((s) => s.user);
  const quality = useNetworkStore((s) => s.quality);
  const uid = user?.uid;
  const guest = isAnonymousUser(user);

  useEffect(() => {
    if (!uid || guest || quality !== 'good') return;
    if (allPending(uid).length === 0) return;
    let cancelled = false;
    flushPendingWrites(uid)
      .then((n) => {
        if (n > 0 && !cancelled) toast.bottom.success('Back online — your saved changes are synced.', 4000);
      })
      .catch(() => {
        /* still unreachable: entries stay journaled and retry on the next change */
      });
    return () => {
      cancelled = true;
    };
  }, [uid, guest, quality]);
}

/** undefined -> deleteField() so a cleared form field is really removed. */
function toWrite(item: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) out[key] = value === undefined ? deleteField() : value;
  return out;
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
    refreshGuestStore(collectionName, updated);
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
  // Journal first (synchronous), so a refresh right after Save keeps the edit.
  const token = recordPending(uid, collectionName, item.id, 'set', item as Record<string, unknown>);
  const send = setDoc(ref, toWrite(item as Record<string, unknown>), { merge: true });
  if (shouldQueue()) {
    // Weak/no connection: the edit is already journaled (and in Firestore's
    // offline queue), so close the form now and let it sync later.
    sendInBackground(send, () => confirmPending(uid, collectionName, item.id, token));
    announceQueued();
    return;
  }
  await send;
  confirmPending(uid, collectionName, item.id, token);
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
    // Replace in place (new records go on the end) so an update doesn't
    // reshuffle the order of everything else.
    const incoming = new Map(items.map((i) => [i.id, i]));
    const replaced = existing.map((e) => incoming.get(e.id) ?? e);
    const existingIds = new Set(existing.map((e) => e.id));
    const updated = [...replaced, ...items.filter((i) => !existingIds.has(i.id))];
    saveGuestData(uid, collectionName, updated);
    refreshGuestStore(collectionName, updated);
    return;
  }

  // For regular users, save to Firestore in batches
  const chunkSize = 450;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const tokens = chunk.map((item) => recordPending(uid, collectionName, item.id, 'set', item as Record<string, unknown>));
    const batch = writeBatch(db);
    chunk.forEach((item) => {
      const ref = doc(db, 'users', uid, collectionName, item.id);
      batch.set(ref, item, { merge: true });
    });
    const commit = batch.commit();
    const confirmChunk = () => chunk.forEach((item, n) => confirmPending(uid, collectionName, item.id, tokens[n]));
    if (shouldQueue()) {
      sendInBackground(commit, confirmChunk);
      announceQueued();
      continue;
    }
    await commit;
    confirmChunk();
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
    refreshGuestStore(collectionName, filtered);
    return;
  }

  // For regular users, remove from Firestore
  const ref = doc(db, 'users', uid, collectionName, id);
  const token = recordPending(uid, collectionName, id, 'del');
  const send = deleteDoc(ref);
  if (shouldQueue()) {
    sendInBackground(send, () => confirmPending(uid, collectionName, id, token));
    announceQueued();
    return;
  }
  await send;
  confirmPending(uid, collectionName, id, token);
}

/**
 * Keeps the custom profile-picture store (avatarStore) in sync with the
 * single doc at users/{uid}/meta/avatar. Call once near the app root
 * (alongside the other useFirestoreCollectionSync calls in DataSync).
 */
const avatarCacheKey = (uid: string) => `aurafin-avatar:${uid}`;

function readAvatarCache(uid: string): string | null {
  try {
    return localStorage.getItem(avatarCacheKey(uid));
  } catch {
    return null;
  }
}

function writeAvatarCache(uid: string, dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(avatarCacheKey(uid), dataUrl);
    else localStorage.removeItem(avatarCacheKey(uid));
  } catch {
    // Storage full or blocked: the Firestore copy is still the source of truth.
  }
}

export function useAvatarSync() {
  // Depend on the uid, not the user object: the store swaps the cached user
  // for the real Firebase user on startup, and re-subscribing on that swap
  // briefly dropped the photo back to the default one.
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const setDataUrl = useAvatarStore((s) => s.setDataUrl);

  useEffect(() => {
    if (!uid) {
      setDataUrl(null);
      return;
    }
    // Show the last known photo straight away (and while offline) instead of
    // flashing the default one until Firestore answers.
    setDataUrl(readAvatarCache(uid));

    const ref = doc(db, 'users', uid, 'meta', 'avatar');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        // A cache-only "doesn't exist" answer isn't trustworthy: wait for the server.
        if (!snap.exists() && snap.metadata.fromCache) return;
        const url = (snap.data()?.dataUrl as string | undefined) ?? null;
        setDataUrl(url);
        writeAvatarCache(uid, url);
      },
      // On a listener error keep whatever photo we already have.
      (err) => console.error('Avatar sync error', err)
    );
    return () => unsub();
  }, [uid, setDataUrl]);
}

/** Save (or overwrite) the user's custom profile picture. */
export async function saveAvatar(uid: string, dataUrl: string) {
  const ref = doc(db, 'users', uid, 'meta', 'avatar');
  writeAvatarCache(uid, dataUrl);
  await setDoc(ref, { dataUrl }, { merge: true });
}

/** Remove the custom profile picture, falling back to the Google photo (if
 *  any) or initials. */
export async function removeAvatar(uid: string) {
  const ref = doc(db, 'users', uid, 'meta', 'avatar');
  writeAvatarCache(uid, null);
  await deleteDoc(ref);
}

/**
 * Automatically records today's net worth as a real historical data point
 * whenever the user's assets/liabilities change — so the "Net worth over
 * time" chart on the Dashboard builds a genuine day-by-day history without
 * requiring the user to remember to hit "Take Snapshot" first.
 *
 * Writes to the same `users/{uid}/snapshots` collection (and local
 * `snapshotsStore`) the manual snapshot flow already uses — same
 * {id, date, netWorth, totalAssets, totalLiabilities} shape, same
 * one-entry-per-day rule — this just keeps that entry current
 * automatically. Nothing here is fake or interpolated: every point this
 * produces reflects the real assets/liabilities totals at the moment it
 * was written.
 */
export function useAutoNetWorthHistory() {
  const user = useAuthStore((s) => s.user);
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const assetsServerConfirmed = useSyncStatusStore((s) => s.assetsServerConfirmed);
  const liabilitiesServerConfirmed = useSyncStatusStore((s) => s.liabilitiesServerConfirmed);
  const snapshots = useSnapshotsStore((s) => s.snapshots);
  const addOrUpdate = useSnapshotsStore((s) => s.addOrUpdate);
  // Live market inputs — the same ones the Overview "Net worth" card uses.
  // Recording the *stored* asset.value here made the graph flat while the
  // headline number moved with the market; using live values makes today's
  // point (and so the whole line) follow real price volatility.
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const goldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const pricesAttempted = useLivePricesStore((s) => s.pricesAttempted);
  const lastWriteRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    if (!assetsServerConfirmed || !liabilitiesServerConfirmed) return;
    if (assets.length === 0 && liabilities.length === 0) return;
    // Don't record a stale (pre-live-price) number as today's value if
    // the app holds live-priced assets and the first price fetch hasn't
    // finished — it would be corrected seconds later and leave a blip.
    const hasLivePriced = assets.some((a) => a.symbol && a.quantity && a.quantity > 0);
    if (hasLivePriced && !pricesAttempted) return;

    const totalAssets = assets
      .filter((a) => !isFullySold(a))
      .reduce((sum, a) => sum + resolveAssetValues(a, livePrices, sipValues, goldPricePerGram).value, 0);
    const totalLiabilities = liabilities.reduce((sum, l) => sum + l.outstanding, 0);
    const netWorth = totalAssets - totalLiabilities;

    const today = toIsoDate();
    const existing = snapshots.find((s) => s.date === today);

    // Round to whole paise so float noise never triggers a write.
    const same = (a: number, b: number) => Math.abs(a - b) < 0.5;
    if (
      existing &&
      same(existing.netWorth, netWorth) &&
      same(existing.totalAssets, totalAssets) &&
      same(existing.totalLiabilities, totalLiabilities)
    ) {
      return;
    }

    // Prices tick every few seconds — throttle Firestore writes for
    // pure market movement to one per minute (the local store still
    // updates every tick, so the chart moves live). Structural changes
    // (new today entry, liabilities changed) are written immediately.
    const structural = !existing || !same(existing.totalLiabilities, totalLiabilities);
    const now = Date.now();
    const entry: Snapshot = {
      id: existing?.id ?? crypto.randomUUID(),
      date: today,
      netWorth,
      totalAssets,
      totalLiabilities,
    };
    addOrUpdate(entry);
    if (structural || now - lastWriteRef.current >= 60_000) {
      lastWriteRef.current = now;
      upsertDoc(user, 'snapshots', entry);
    }
  }, [
    user,
    assets,
    liabilities,
    assetsServerConfirmed,
    liabilitiesServerConfirmed,
    snapshots,
    addOrUpdate,
    livePrices,
    sipValues,
    goldPricePerGram,
    pricesAttempted,
  ]);
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

function guestWealthFilterKey(uid: string): string {
  return `aurafin-guest-${uid}-wealthFilters`;
}

/** Read a guest (anonymous user)'s saved Wealth filter selection from
 *  localStorage, mirroring readGuestAppLock's guest fallback pattern. */
function readGuestWealthFilters(uid: string): WealthFilterSelection | null {
  try {
    const raw = localStorage.getItem(guestWealthFilterKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return {
      categories: Array.isArray(parsed?.categories) ? parsed.categories : [],
      types: Array.isArray(parsed?.types) ? parsed.types : [],
      currencies: Array.isArray(parsed?.currencies) ? parsed.currencies : [],
    };
  } catch {
    return null;
  }
}

function writeGuestWealthFilters(uid: string, value: WealthFilterSelection) {
  try {
    localStorage.setItem(guestWealthFilterKey(uid), JSON.stringify(value));
  } catch {
    // localStorage unavailable — filter just won't survive a refresh.
  }
}

/**
 * Keeps the Wealth ▸ Assets tab's Category/Type/Currency filter selection
 * (wealthFilterStore) in sync with users/{uid}/meta/wealthFilters — same
 * singleton-doc pattern as the avatar and App Lock PIN above. This is what
 * makes a filter chosen on one device (say, the desktop) show up already
 * applied on another (say, the phone) instead of resetting per-device.
 * Guests get a per-device localStorage fallback, like everywhere else,
 * since a guest account doesn't follow you to another device anyway.
 */
export function useWealthFilterSync() {
  const user = useAuthStore((s) => s.user);
  const syncFromRemote = useWealthFilterStore((s) => s.syncFromRemote);

  useEffect(() => {
    if (!user) {
      syncFromRemote(null);
      return;
    }

    if (isAnonymousUser(user)) {
      syncFromRemote(readGuestWealthFilters(user.uid));
      return;
    }

    const ref = doc(db, 'users', user.uid, 'meta', 'wealthFilters');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        syncFromRemote(
          data
            ? {
                categories: Array.isArray(data.categories) ? data.categories : [],
                types: Array.isArray(data.types) ? data.types : [],
                currencies: Array.isArray(data.currencies) ? data.currencies : [],
              }
            : null
        );
      },
      () => syncFromRemote(null)
    );
    return () => unsub();
  }, [user, syncFromRemote]);
}

/** Save (or overwrite) the Wealth ▸ Assets filter selection. Guests persist
 *  to a per-device localStorage key instead of Firestore (see
 *  useWealthFilterSync above for why). */
export async function saveWealthFilters(
  uidOrUser: string | { uid: string; isAnonymous?: boolean },
  value: WealthFilterSelection
) {
  const uid = typeof uidOrUser === 'string' ? uidOrUser : uidOrUser.uid;
  const isGuest = typeof uidOrUser === 'object' && isAnonymousUser(uidOrUser);

  if (isGuest) {
    writeGuestWealthFilters(uid, value);
    return;
  }

  const ref = doc(db, 'users', uid, 'meta', 'wealthFilters');
  await setDoc(ref, value, { merge: true });
}

/**
 * Marks one profile as the account's default (the one a fresh login on a
 * new device should open to) and un-marks every other profile, in a single
 * batch. This is what makes "Set default" in Settings apply everywhere the
 * account is signed in, not just on the device that set it.
 */
export async function setDefaultProfile(
  uidOrUser: string | { uid: string; isAnonymous?: boolean },
  allProfileIds: string[],
  defaultId: string
) {
  const uid = typeof uidOrUser === 'string' ? uidOrUser : uidOrUser.uid;
  // A guest's profiles live in localStorage, not Firestore.
  if (typeof uidOrUser === 'object' && isAnonymousUser(uidOrUser)) {
    const updated = loadGuestData<HouseholdProfile>(uid, 'profiles').map((p) => ({ ...p, isDefault: p.id === defaultId }));
    saveGuestData(uid, 'profiles', updated);
    refreshGuestStore('profiles', updated);
    return;
  }
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
  uidOrUser: string | { uid: string; isAnonymous?: boolean },
  collectionName: string,
  items: T[],
  profileId: string
) {
  const orphans = items.filter((item) => !item.profileId);
  if (!orphans.length) return;
  await bulkUpsertDocs(
    uidOrUser,
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
  uidOrUser: string | { uid: string; isAnonymous?: boolean },
  collectionName: string,
  items: T[],
  fromProfileId: string,
  toProfileId: string
) {
  const matching = items.filter((item) => item.profileId === fromProfileId);
  if (!matching.length) return;
  await bulkUpsertDocs(
    uidOrUser,
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
export async function deleteAllUserData(uidOrUser: string | { uid: string; isAnonymous?: boolean }) {
  const uid = typeof uidOrUser === 'string' ? uidOrUser : uidOrUser.uid;
  // A guest's data lives in localStorage — there is nothing in Firestore to delete.
  if (typeof uidOrUser === 'object' && isAnonymousUser(uidOrUser)) {
    clearGuestData(uid);
    return;
  }
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

/** Valuation page "Recent searches", stored per account so the list follows
 *  the person across devices (desktop ↔ phone) instead of living only in one
 *  browser's localStorage. Guests stay device-local. */
export interface ValuationHistoryItem {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
}

export function subscribeValuationHistory(
  user: { uid: string; isAnonymous?: boolean },
  onChange: (items: ValuationHistoryItem[] | null) => void
): () => void {
  if (isAnonymousUser(user)) return () => {};
  const ref = doc(db, 'users', user.uid, 'meta', 'valuationHistory');
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.data()?.items;
      onChange(Array.isArray(items) ? items : snap.exists() ? [] : null);
    },
    () => onChange(null)
  );
}

export async function saveValuationHistory(
  user: { uid: string; isAnonymous?: boolean },
  items: ValuationHistoryItem[]
) {
  if (isAnonymousUser(user)) return;
  await setDoc(doc(db, 'users', user.uid, 'meta', 'valuationHistory'), { items }, { merge: false });
}

/** Global search "Recent searches", stored per account (users/{uid}/meta/
 *  searchHistory) so a search made on the laptop shows up on the phone too.
 *  Guests stay device-local (localStorage handled by the caller). */
export function subscribeSearchHistory(
  user: { uid: string; isAnonymous?: boolean },
  onChange: (items: string[] | null) => void
): () => void {
  if (isAnonymousUser(user)) return () => {};
  const ref = doc(db, 'users', user.uid, 'meta', 'searchHistory');
  return onSnapshot(
    ref,
    (snap) => {
      const items = snap.data()?.items;
      onChange(
        Array.isArray(items)
          ? items.filter((x: unknown) => typeof x === 'string')
          : snap.exists()
            ? []
            : null
      );
    },
    () => onChange(null)
  );
}

export async function saveSearchHistory(user: { uid: string; isAnonymous?: boolean }, items: string[]) {
  if (isAnonymousUser(user)) return;
  await setDoc(doc(db, 'users', user.uid, 'meta', 'searchHistory'), { items }, { merge: false });
}


function sameEyePos(a: EyePos | null, b: EyePos | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && (a.anchor ?? '') === (b.anchor ?? '');
}

/**
 * Keeps the floating eye's position in users/{uid}/meta/floatingEye so it sits
 * in the same place everywhere the account is signed in. Without this the spot
 * lived only in each browser's own localStorage, and the installed app and
 * Chrome (separate storage) each remembered a different one.
 * Guests have no cross-device account, so they keep the local-only behaviour.
 */
export function useFloatingEyeSync() {
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user || isAnonymousUser(user)) return;
    const ref = doc(db, 'users', user.uid, 'meta', 'floatingEye');
    const store = useDisplaySettingsStore;
    let remote: EyePos | null | undefined; // undefined = nothing heard from the account yet
    const writeRemote = (pos: EyePos) =>
      setDoc(ref, { x: pos.x, y: pos.y, anchor: pos.anchor ?? null, at: pos.at ?? 0 }).catch(() => {});

    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.data();
        const next: EyePos | null =
          d && Number.isFinite(d.x) && Number.isFinite(d.y)
            ? {
                x: d.x,
                y: d.y,
                ...(d.anchor === 'bottom' ? { anchor: 'bottom' as const } : {}),
                ...(Number.isFinite(d.at) ? { at: d.at as number } : {}),
              }
            : null;
        const first = remote === undefined;
        remote = next;
        const local = store.getState().eyePos;
        if (next) {
          // First contact: the spot that was dragged most recently wins, so the
          // place you last put it is where every device ends up. (A device
          // that has only an old save with no move time never overrides the account.)
          if (first && local && (local.at ?? 0) > (next.at ?? 0) && !sameEyePos(local, next)) {
            remote = local;
            writeRemote(local);
          } else if (!sameEyePos(local, next)) {
            store.getState().syncEyePosFromRemote(next);
          }
        } else if (first && local) {
          // Account has no saved spot yet: this device's spot becomes the shared one.
          writeRemote(local);
        } else if (!first && local) {
          store.getState().syncEyePosFromRemote(null); // reset on another device
        }
      },
      () => { /* offline / permission: keep the local spot */ }
    );

    // Push this device's moves/resets up to the account.
    const unsubStore = store.subscribe((state, prev) => {
      if (state.eyePos === prev.eyePos || remote === undefined) return;
      if (sameEyePos(state.eyePos, remote)) return;
      remote = state.eyePos;
      const pos = state.eyePos;
      if (pos) writeRemote(pos);
      else deleteDoc(ref).catch(() => {});
    });

    return () => { unsub(); unsubStore(); };
  }, [user]);
}
