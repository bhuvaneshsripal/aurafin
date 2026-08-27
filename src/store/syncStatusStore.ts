import { create } from 'zustand';

/**
 * Tracks whether each collection that feeds a headline number (Net Worth,
 * this month's Cashflow, the Goals count, etc.) has been confirmed by the
 * server at least once this session — as opposed to only reflecting the
 * local offline cache, which right after a refresh can briefly still be
 * empty/stale while IndexedDB and the network round-trip catch up. That
 * window is usually imperceptible on a fast laptop connection, but can be
 * long enough to visibly flash a wrong `0` on a slower mobile connection.
 *
 * Screens combine these flags with "do we already have non-empty local
 * data" (in which case there's no need to wait — see Dashboard.tsx's
 * `wealthDataKnown`/`cashflowDataKnown`/`goalsDataKnown`) to decide whether
 * a computed total can be trusted yet, or should show a loading state
 * instead of a real-looking-but-possibly-wrong number.
 *
 * `loadedCollections` is a separate, coarser concept: whether a collection
 * has received its very first snapshot at all this session — from the
 * cache or the server, either is fine. This is what App.tsx uses to decide
 * whether it's safe to render the app's normal screens yet at all. Cache
 * data is trusted here (unlike *ServerConfirmed above) because the goal
 * isn't "is this number provably correct", it's just "do we have something
 * real to show instead of every store's blank initial []" — showing
 * cached data immediately, then reconciling in the background, is exactly
 * persistentLocalCache's offline-first point. Without this, every page
 * briefly rendered its own "no data yet" empty state on refresh (no
 * goals/assets/transactions/etc.) even when Firestore had plenty, because
 * each store starts as `[]` and only fills in once onSnapshot fires.
 */
interface SyncStatusState {
  assetsServerConfirmed: boolean;
  liabilitiesServerConfirmed: boolean;
  transactionsServerConfirmed: boolean;
  goalsServerConfirmed: boolean;
  loadedCollections: Record<string, boolean>;
  setAssetsSynced: (fromCache: boolean) => void;
  setLiabilitiesSynced: (fromCache: boolean) => void;
  setTransactionsSynced: (fromCache: boolean) => void;
  setGoalsSynced: (fromCache: boolean) => void;
  /** Marks a collection (by its Firestore subcollection name, e.g. 'assets')
   *  as having received its first snapshot. Idempotent — safe to call on
   *  every subsequent snapshot too. */
  markCollectionLoaded: (collectionName: string) => void;
  /** Force-marks every collection in the list as loaded, without waiting
   *  for a real snapshot. Used as an offline safety net so a genuinely
   *  unreachable Firestore (no cache, no network) doesn't leave the app
   *  stuck on a loading screen forever. */
  forceMarkAllLoaded: (collectionNames: readonly string[]) => void;
  /** Called on logout so a new sign-in on the same tab doesn't inherit the
   *  previous account's "already confirmed"/"already loaded" flags before
   *  its own data has actually loaded. */
  reset: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  assetsServerConfirmed: false,
  liabilitiesServerConfirmed: false,
  transactionsServerConfirmed: false,
  goalsServerConfirmed: false,
  loadedCollections: {},
  setAssetsSynced: (fromCache) =>
    set((s) => ({ assetsServerConfirmed: s.assetsServerConfirmed || !fromCache })),
  setLiabilitiesSynced: (fromCache) =>
    set((s) => ({ liabilitiesServerConfirmed: s.liabilitiesServerConfirmed || !fromCache })),
  setTransactionsSynced: (fromCache) =>
    set((s) => ({ transactionsServerConfirmed: s.transactionsServerConfirmed || !fromCache })),
  setGoalsSynced: (fromCache) =>
    set((s) => ({ goalsServerConfirmed: s.goalsServerConfirmed || !fromCache })),
  markCollectionLoaded: (collectionName) =>
    set((s) =>
      s.loadedCollections[collectionName]
        ? s
        : { loadedCollections: { ...s.loadedCollections, [collectionName]: true } }
    ),
  forceMarkAllLoaded: (collectionNames) =>
    set((s) => ({
      loadedCollections: {
        ...s.loadedCollections,
        ...Object.fromEntries(collectionNames.map((c) => [c, true])),
      },
    })),
  reset: () =>
    set({
      assetsServerConfirmed: false,
      liabilitiesServerConfirmed: false,
      transactionsServerConfirmed: false,
      goalsServerConfirmed: false,
      loadedCollections: {},
    }),
}));
