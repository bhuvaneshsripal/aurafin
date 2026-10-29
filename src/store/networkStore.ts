import { create } from 'zustand';
import type { NetworkQuality } from '../hooks/useNetworkQuality';

/** Latest connection quality, readable from non-React code (e.g. the save
 *  functions in useFirestoreSync) as well as components. The single writer is
 *  useNetworkQuality(), which NetworkBanner keeps mounted for the whole app. */
interface NetworkState {
  quality: NetworkQuality;
  setQuality: (q: NetworkQuality) => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  quality: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'good',
  setQuality: (quality) => set((s) => (s.quality === quality ? s : { quality })),
}));

export const getNetworkQuality = (): NetworkQuality => useNetworkStore.getState().quality;
