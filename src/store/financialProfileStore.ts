import { create } from 'zustand';
import type { FinancialProfile } from '../types';

interface FinancialProfileState {
  profile: FinancialProfile | null;
  /** Matches the useFirestoreCollectionSync<T> shape (setLocal(items: T[])). */
  setItems: (items: FinancialProfile[]) => void;
}

export const useFinancialProfileStore = create<FinancialProfileState>((set) => ({
  profile: null,
  setItems: (items) => set({ profile: items[0] ?? null }),
}));
