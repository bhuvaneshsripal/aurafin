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
 */
interface SyncStatusState {
  assetsServerConfirmed: boolean;
  liabilitiesServerConfirmed: boolean;
  transactionsServerConfirmed: boolean;
  goalsServerConfirmed: boolean;
  setAssetsSynced: (fromCache: boolean) => void;
  setLiabilitiesSynced: (fromCache: boolean) => void;
  setTransactionsSynced: (fromCache: boolean) => void;
  setGoalsSynced: (fromCache: boolean) => void;
  /** Called on logout so a new sign-in on the same tab doesn't inherit the
   *  previous account's "already confirmed" flags before its own data has
   *  actually loaded. */
  reset: () => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  assetsServerConfirmed: false,
  liabilitiesServerConfirmed: false,
  transactionsServerConfirmed: false,
  goalsServerConfirmed: false,
  setAssetsSynced: (fromCache) =>
    set((s) => ({ assetsServerConfirmed: s.assetsServerConfirmed || !fromCache })),
  setLiabilitiesSynced: (fromCache) =>
    set((s) => ({ liabilitiesServerConfirmed: s.liabilitiesServerConfirmed || !fromCache })),
  setTransactionsSynced: (fromCache) =>
    set((s) => ({ transactionsServerConfirmed: s.transactionsServerConfirmed || !fromCache })),
  setGoalsSynced: (fromCache) =>
    set((s) => ({ goalsServerConfirmed: s.goalsServerConfirmed || !fromCache })),
  reset: () =>
    set({
      assetsServerConfirmed: false,
      liabilitiesServerConfirmed: false,
      transactionsServerConfirmed: false,
      goalsServerConfirmed: false,
    }),
}));
