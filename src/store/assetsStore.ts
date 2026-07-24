import { create } from 'zustand';
import type { Asset } from '../types';

interface AssetsState {
  assets: Asset[];
  setAssets: (assets: Asset[]) => void;
  addOrUpdate: (asset: Asset) => void;
  remove: (id: string) => void;
  totalValue: () => number;
}

export const useAssetsStore = create<AssetsState>((set, get) => ({
  assets: [],
  setAssets: (assets) => set({ assets }),
  addOrUpdate: (asset) =>
    set((state) => {
      const exists = state.assets.some((a) => a.id === asset.id);
      return {
        assets: exists
          ? state.assets.map((a) => (a.id === asset.id ? asset : a))
          : [...state.assets, asset],
      };
    }),
  remove: (id) => set((state) => ({ assets: state.assets.filter((a) => a.id !== id) })),
  totalValue: () => get().assets.reduce((sum, a) => sum + a.value, 0),
}));
