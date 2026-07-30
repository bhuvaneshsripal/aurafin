import { create } from 'zustand';

interface AvatarState {
  /** A small square JPEG data URL saved by the user via Settings > Personal
   *  info, or null if they haven't set one (fall back to their Google
   *  photo, then initials). Kept separate from Firebase Auth's own
   *  photoURL field since that field is capped at ~2KB and can't hold an
   *  actual uploaded image — this is synced instead via a Firestore doc
   *  at users/{uid}/meta/avatar (see useAvatarSync in useFirestoreSync.ts). */
  dataUrl: string | null;
  setDataUrl: (dataUrl: string | null) => void;
}

export const useAvatarStore = create<AvatarState>((set) => ({
  dataUrl: null,
  setDataUrl: (dataUrl) => set({ dataUrl }),
}));
