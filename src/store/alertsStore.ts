import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AlertKind = 'pre-open' | 'open' | 'close' | 'market' | 'up' | 'down';

/** Kinds shown in the bell list. Holding moves (up/down) are pop-up only. */
export const LIST_KINDS: AlertKind[] = ['pre-open', 'open', 'close', 'market'];

export interface AlertItem {
  id: string;
  kind: AlertKind;
  title: string;
  body: string;
  at: number;
  read: boolean;
}

const MAX_ITEMS = 60;

export type SessionName = 'pre' | 'open' | 'close';
/** Index levels captured at one session point: { nifty: {price, prev}, ... } */
export type SessionSnapshot = Record<string, { price: number; prev?: number }>;

interface AlertsState {
  items: AlertItem[];
  /** Master switch for market / price-move alerts. */
  enabled: boolean;
  /** Keys of alerts already raised (e.g. "2026-10-23:open", "2026-10-23:TCS:up3")
   *  so each one fires once per day. Pruned to the current day on write. */
  fired: Record<string, true>;
  /** Per-day pre-market / open / close index levels (last few days kept). */
  sessions: Record<string, Partial<Record<SessionName, SessionSnapshot>>>;
  /** Dismissed market-summary cards: "<day>:<indexKey>" for today's cards. */
  hiddenCards: string[];
  hideCard: (key: string) => void;
  /** Removes an earlier day's saved levels. */
  removeSession: (dayKey: string) => void;
  setSession: (dayKey: string, which: SessionName, snap: SessionSnapshot) => void;
  add: (item: Omit<AlertItem, 'id' | 'at' | 'read'>) => void;
  markAllRead: () => void;
  /** Clears every alert and the past days' history (today's snapshots are kept). */
  clear: (todayKey?: string) => void;
  remove: (id: string) => void;
  setEnabled: (enabled: boolean) => void;
  markFired: (key: string, dayKey: string) => void;
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set) => ({
      items: [],
      enabled: true,
      fired: {},
      sessions: {},
      hiddenCards: [],
      hideCard: (key) => set((s) => ({ hiddenCards: s.hiddenCards.includes(key) ? s.hiddenCards : [...s.hiddenCards, key].slice(-90) })),
      removeSession: (dayKey) =>
        set((s) => {
          const { [dayKey]: _gone, ...rest } = s.sessions;
          return { sessions: rest };
        }),
      setSession: (dayKey, which, snap) =>
        set((s) => {
          const days = Object.keys({ ...s.sessions, [dayKey]: 1 }).sort().slice(-30);
          const sessions: AlertsState['sessions'] = {};
          for (const d of days) sessions[d] = d === dayKey ? { ...s.sessions[d], [which]: snap } : s.sessions[d];
          return { sessions };
        }),
      add: (item) =>
        set((s) => ({
          items: [{ ...item, id: crypto.randomUUID(), at: Date.now(), read: false }, ...s.items].slice(0, MAX_ITEMS),
        })),
      markAllRead: () => set((s) => ({ items: s.items.map((i) => ({ ...i, read: true })) })),
      clear: (todayKey) =>
        set((s) => ({
          items: [],
          sessions: todayKey && s.sessions[todayKey] ? { [todayKey]: s.sessions[todayKey] } : {},
        })),
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      setEnabled: (enabled) => set({ enabled }),
      markFired: (key, dayKey) =>
        set((s) => {
          const fired: Record<string, true> = {};
          for (const k of Object.keys(s.fired)) if (k.startsWith(dayKey)) fired[k] = true;
          fired[key] = true;
          return { fired };
        }),
    }),
    { name: 'aurafin-alerts' }
  )
);
