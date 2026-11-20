import { create } from 'zustand';

export type ToastTone = 'error' | 'success' | 'info';

export type ToastPlacement = 'top' | 'bottom';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  placement: ToastPlacement;
  /** Optional button on the right of the toast, e.g. { label: 'Undo', onClick }. */
  action?: { label: string; onClick: () => void };
  /** How long the toast stays up (ms); the Undo countdown ring runs for exactly this long. */
  lifetimeMs: number;
}

const TOAST_LIFETIME_MS = 4500;
const MAX_VISIBLE = 3;
const MAX_QUEUED_BOTTOM = 6;

interface ToastState {
  toasts: Toast[];
  push: (message: string, tone: ToastTone, placement?: ToastPlacement, lifetimeMs?: number, action?: Toast['action']) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone, placement = 'top', lifetimeMs = TOAST_LIFETIME_MS, action) => {
    // Don't stack identical notices (e.g. several saves in a row).
    if (get().toasts.some((t) => t.message === message && t.placement === placement)) return;
    const id = nextId++;
    set((s) => {
      const next = [...s.toasts, { id, message, tone, placement, action, lifetimeMs }];
      // Top toasts stack (newest 3). Bottom toasts queue and show one at a time,
      // so keep a longer backlog of those.
      const keep = (p: ToastPlacement, max: number) => {
        const mine = next.filter((t) => t.placement === p);
        return new Set(mine.slice(-max).map((t) => t.id));
      };
      const topKeep = keep('top', MAX_VISIBLE);
      const botKeep = keep('bottom', MAX_QUEUED_BOTTOM);
      return { toasts: next.filter((t) => (t.placement === 'top' ? topKeep : botKeep).has(t.id)) };
    });
    // Bottom toasts start their timer when they actually appear (see Toaster).
    if (placement === 'top') {
      window.setTimeout(() => {
        if (get().toasts.some((t) => t.id === id)) get().dismiss(id);
      }, lifetimeMs);
    }
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
  /** "Holding deleted · UNDO" — 4 seconds, with a circular seconds countdown. Sits above the nav bar. */
  undo: (message: string, onUndo: () => void, ms = 4000) =>
    useToastStore.getState().push(message, 'info', 'bottom', ms, { label: 'Undo', onClick: onUndo }),
};
