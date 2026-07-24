import { create } from 'zustand';
import type { Liability } from '../types';

interface LiabilitiesState {
  liabilities: Liability[];
  setLiabilities: (liabilities: Liability[]) => void;
  addOrUpdate: (liability: Liability) => void;
  remove: (id: string) => void;
  totalOutstanding: () => number;
}

export const useLiabilitiesStore = create<LiabilitiesState>((set, get) => ({
  liabilities: [],
  setLiabilities: (liabilities) => set({ liabilities }),
  addOrUpdate: (liability) =>
    set((state) => {
      const exists = state.liabilities.some((l) => l.id === liability.id);
      return {
        liabilities: exists
          ? state.liabilities.map((l) => (l.id === liability.id ? liability : l))
          : [...state.liabilities, liability],
      };
    }),
  remove: (id) =>
    set((state) => ({ liabilities: state.liabilities.filter((l) => l.id !== id) })),
  totalOutstanding: () => get().liabilities.reduce((sum, l) => sum + l.outstanding, 0),
}));
