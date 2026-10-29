import { create } from 'zustand';

export type ToastTone = 'error' | 'success' | 'info';

export type ToastPlacement = 'top' | 'bottom';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  placement: ToastPlacement;
}

const TOAST_LIFETIME_MS = 4500;
const MAX_VISIBLE = 3;

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone: ToastTone, placement?: ToastPlacement, lifetimeMs?: number) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone, placement = 'top', lifetimeMs = TOAST_LIFETIME_MS) => {
    // Don't stack identical notices (e.g. several saves in a row).
    if (get().toasts.some((t) => t.message === message && t.placement === placement)) return;
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone, placement }].slice(-MAX_VISIBLE) }));
    window.setTimeout(() => {
      if (get().toasts.some((t) => t.id === id)) get().dismiss(id);
    }, lifetimeMs);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Short, non-blocking notices. Use instead of window.alert(). */
export const toast = {
  error: (message: string) => useToastStore.getState().push(message, 'error'),
  success: (message: string) => useToastStore.getState().push(message, 'success'),
  info: (message: string) => useToastStore.getState().push(message, 'info'),
  /** Same tones, but shown at the bottom of the screen (above the nav bar). */
  bottom: {
    error: (message: string, ms?: number) => useToastStore.getState().push(message, 'error', 'bottom', ms),
    success: (message: string, ms?: number) => useToastStore.getState().push(message, 'success', 'bottom', ms),
    info: (message: string, ms?: number) => useToastStore.getState().push(message, 'info', 'bottom', ms),
  },
};
