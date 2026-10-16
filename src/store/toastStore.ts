import { create } from 'zustand';

export type ToastTone = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_LIFETIME_MS = 4500;
const MAX_VISIBLE = 3;

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-MAX_VISIBLE) }));
    window.setTimeout(() => {
      if (get().toasts.some((t) => t.id === id)) get().dismiss(id);
    }, TOAST_LIFETIME_MS);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Short, non-blocking notices. Use instead of window.alert(). */
export const toast = {
  error: (message: string) => useToastStore.getState().push(message, 'error'),
  success: (message: string) => useToastStore.getState().push(message, 'success'),
  info: (message: string) => useToastStore.getState().push(message, 'info'),
};
