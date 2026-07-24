import { create } from 'zustand';
import type { Snapshot } from '../types';

interface SnapshotsState {
  snapshots: Snapshot[];
  setSnapshots: (snapshots: Snapshot[]) => void;
  addOrUpdate: (snapshot: Snapshot) => void;
  remove: (id: string) => void;
}

export const useSnapshotsStore = create<SnapshotsState>((set) => ({
  snapshots: [],
  setSnapshots: (snapshots) => set({ snapshots }),
  addOrUpdate: (snapshot) =>
    set((state) => {
      const exists = state.snapshots.some((s) => s.id === snapshot.id);
      return {
        snapshots: exists
          ? state.snapshots.map((s) => (s.id === snapshot.id ? snapshot : s))
          : [...state.snapshots, snapshot],
      };
    }),
  remove: (id) => set((state) => ({ snapshots: state.snapshots.filter((s) => s.id !== id) })),
}));
