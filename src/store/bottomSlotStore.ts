import { create } from 'zustand';
import { useEffect } from 'react';

/** The bottom of the screen has room for ONE notification at a time (bottom
 *  toasts, the "Amounts are hidden" nudge, the network banner). Each asks for
 *  the slot; the one with the highest priority wins, ties go first-come
 *  first-served, and the rest wait their turn instead of overlapping. */
interface Entry {
  id: string;
  priority: number;
  seq: number;
}

interface BottomSlotState {
  queue: Entry[];
  request: (id: string, priority: number) => void;
  release: (id: string) => void;
}

let seq = 0;

export const useBottomSlotStore = create<BottomSlotState>((set) => ({
  queue: [],
  request: (id, priority) =>
    set((s) => (s.queue.some((e) => e.id === id) ? s : { queue: [...s.queue, { id, priority, seq: seq++ }] })),
  release: (id) => set((s) => (s.queue.some((e) => e.id === id) ? { queue: s.queue.filter((e) => e.id !== id) } : s)),
}));

function activeId(queue: Entry[]): string | null {
  let best: Entry | null = null;
  for (const e of queue) {
    if (!best || e.priority > best.priority || (e.priority === best.priority && e.seq < best.seq)) best = e;
  }
  return best ? best.id : null;
}

/** Ask for the bottom slot while `wanted`. Returns true only while it is this
 *  notification's turn to be on screen. Timed notices should start their timer
 *  when this turns true, not when they were requested. */
export function useBottomSlot(id: string, wanted: boolean, priority = 1): boolean {
  useEffect(() => {
    if (!wanted) return;
    useBottomSlotStore.getState().request(id, priority);
    return () => useBottomSlotStore.getState().release(id);
  }, [id, wanted, priority]);
  return useBottomSlotStore((s) => activeId(s.queue) === id);
}
