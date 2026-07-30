import { create } from 'zustand';
import type { PremiumStatus } from '../types';

interface PremiumState {
  status: PremiumStatus | null;
  /** Matches the useFirestoreCollectionSync<T> shape (setLocal(items: T[])). */
  setItems: (items: PremiumStatus[]) => void;
}

export const usePremiumStore = create<PremiumState>((set) => ({
  status: null,
  setItems: (items) => set({ status: items[0] ?? null }),
}));

/** Convenience selector: is this account Premium right now? Automatically
 *  treats an expired monthly/quarterly plan as no longer Premium — no
 *  separate "downgrade" step needed, it just stops being true once
 *  expiresAt has passed. */
export function selectIsPremium(state: PremiumState): boolean {
  const status = state.status;
  if (!status?.isPremium) return false;
  if (status.expiresAt && status.expiresAt < Date.now()) return false;
  return true;
}
