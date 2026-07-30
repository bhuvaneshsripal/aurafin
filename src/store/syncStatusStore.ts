import { create } from 'zustand';

/**
 * Tracks whether the collections that feed the headline Net Worth figure
 * (assets, liabilities) have been confirmed by the server at least once
 * this session — as opposed to only reflecting the local offline cache,
 * which can be briefly stale right after a refresh. Screens can use
 * `netWorthReady` to hold off rendering the number until it's guaranteed
 * correct, instead of flashing a stale value and then correcting it.
 */
interface SyncStatusState {
  assetsServerConfirmed: boolean;
  liabilitiesServerConfirmed: boolean;
  setAssetsSynced: (fromCache: boolean) => void;
  setLiabilitiesSynced: (fromCache: boolean) => void;
}

export const useSyncStatusStore = create<SyncStatusState>((set) => ({
  assetsServerConfirmed: false,
  liabilitiesServerConfirmed: false,
  setAssetsSynced: (fromCache) =>
    set((s) => ({ assetsServerConfirmed: s.assetsServerConfirmed || !fromCache })),
  setLiabilitiesSynced: (fromCache) =>
    set((s) => ({ liabilitiesServerConfirmed: s.liabilitiesServerConfirmed || !fromCache })),
}));
