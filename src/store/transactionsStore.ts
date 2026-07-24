import { create } from 'zustand';
import type { Transaction } from '../types';

interface TransactionsState {
  transactions: Transaction[];
  setTransactions: (transactions: Transaction[]) => void;
  addOrUpdate: (transaction: Transaction) => void;
  remove: (id: string) => void;
  monthlyIncome: (month: string) => number;
  monthlyExpense: (month: string) => number;
}

export const useTransactionsStore = create<TransactionsState>((set, get) => ({
  transactions: [],
  setTransactions: (transactions) => set({ transactions }),
  addOrUpdate: (transaction) =>
    set((state) => {
      const exists = state.transactions.some((t) => t.id === transaction.id);
      return {
        transactions: exists
          ? state.transactions.map((t) => (t.id === transaction.id ? transaction : t))
          : [...state.transactions, transaction],
      };
    }),
  remove: (id) =>
    set((state) => ({ transactions: state.transactions.filter((t) => t.id !== id) })),
  monthlyIncome: (month) =>
    get()
      .transactions.filter((t) => t.type === 'income' && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0),
  monthlyExpense: (month) =>
    get()
      .transactions.filter((t) => t.type === 'expense' && t.date.startsWith(month))
      .reduce((sum, t) => sum + t.amount, 0),
}));
