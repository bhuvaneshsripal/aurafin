import { create } from 'zustand';
import type { Goal } from '../types';

interface GoalsState {
  goals: Goal[];
  setGoals: (goals: Goal[]) => void;
  addOrUpdate: (goal: Goal) => void;
  remove: (id: string) => void;
}

export const useGoalsStore = create<GoalsState>((set) => ({
  goals: [],
  setGoals: (goals) => set({ goals }),
  addOrUpdate: (goal) =>
    set((state) => {
      const exists = state.goals.some((g) => g.id === goal.id);
      return {
        goals: exists
          ? state.goals.map((g) => (g.id === goal.id ? goal : g))
          : [...state.goals, goal],
      };
    }),
  remove: (id) => set((state) => ({ goals: state.goals.filter((g) => g.id !== id) })),
}));
