import { create } from 'zustand';
import type { BudgetItem } from '../types';

interface BudgetState {
  items: BudgetItem[];
  setItems: (items: BudgetItem[]) => void;
  addOrUpdate: (item: BudgetItem) => void;
  remove: (id: string) => void;
  forMonth: (month: string) => BudgetItem[];
  totalForMonth: (month: string) => number;
}

export const useBudgetStore = create<BudgetState>((set, get) => ({
  items: [],
  setItems: (items) => set({ items }),
  addOrUpdate: (item) =>
    set((state) => {
      const exists = state.items.some((i) => i.id === item.id);
      return {
        items: exists
          ? state.items.map((i) => (i.id === item.id ? item : i))
          : [...state.items, item],
      };
    }),
  remove: (id) => set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
  forMonth: (month) => get().items.filter((i) => i.month === month),
  totalForMonth: (month) =>
    get()
      .items.filter((i) => i.month === month)
      .reduce((sum, i) => sum + i.amount, 0),
}));
