import { stockKey, WATCHLIST_CHANGED_EVENT } from './savedStocks';

/** Playlist-style lists layered over the saved stocks ("All"), plus a private note per stock.
 *  A stock can sit in several lists. Lives on this device (localStorage), every access guarded. */

export interface WatchList {
  id: string;
  name: string;
  emoji: string;
  /** stockKey() values, in the user's manual order */
  keys: string[];
  /** Pinned lists show as tabs at the top of the Watchlist page. Off unless the user pins it. */
  pinned?: boolean;
  /** When it was pinned (a counter, not a clock): pinned lists show in the order they were pinned, first pinned first. */
  pinnedAt?: number;
}
interface Store {
  lists: WatchList[];
  notes: Record<string, string>;
}

export const LISTS_KEY = 'aurafin.watchlist.lists';
const KEY = LISTS_KEY;
export const MAX_LISTS = 12;
export const LIST_EMOJIS = ['⭐', '🚀', '💰', '🏦', '💻', '🛢️', '🌱', '🔥', '🎯', '🧪', '🏭', '🌍'];

function load(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    const lists = Array.isArray(v.lists)
      ? v.lists.filter((l: WatchList) => l && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.keys)).map((l: WatchList) => ({ ...l, name: l.name.toUpperCase() }))
      : [];
    return { lists, notes: v.notes && typeof v.notes === 'object' ? v.notes : {} };
  } catch {
    return { lists: [], notes: {} };
  }
}
function save(s: Store) {
  try {
    const next = JSON.stringify(s);
    if (localStorage.getItem(KEY) === next) return;
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new Event(WATCHLIST_CHANGED_EVENT));
  } catch {
    /* storage unavailable — the change just won't persist */
  }
}

export const readLists = (): WatchList[] => load().lists;
export const readNotes = (): Record<string, string> => load().notes;

export function createList(name: string, emoji: string): WatchList | null {
  const s = load();
  const n = name.trim().toUpperCase().slice(0, 30);
  if (!n || s.lists.length >= MAX_LISTS) return null;
  const list: WatchList = { id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: n, emoji, keys: [] };
  save({ ...s, lists: [...s.lists, list] });
  return list;
}

/** Puts back a list that was just deleted (same id, name and stocks). */
export function restoreList(list: WatchList) {
  const s = load();
  if (s.lists.some((l) => l.id === list.id) || s.lists.length >= MAX_LISTS) return;
  save({ ...s, lists: [...s.lists, list] });
}

export function updateList(id: string, patch: Partial<Pick<WatchList, 'name' | 'emoji'>>) {
  const s = load();
  save({
    ...s,
    lists: s.lists.map((l) => (l.id === id ? { ...l, ...patch, name: (patch.name ?? l.name).trim().toUpperCase().slice(0, 30) || l.name } : l)),
  });
}

export function togglePinList(id: string): boolean {
  const s = load();
  let now = false;
  // Next pin number: always after every list that is already pinned, so the list pinned
  // first stays first and the one pinned last goes last.
  const nextPin = s.lists.reduce((m, l) => Math.max(m, l.pinnedAt ?? 0), 0) + 1;
  save({
    ...s,
    lists: s.lists.map((l) => {
      if (l.id !== id) return l;
      now = !l.pinned;
      if (now) return { ...l, pinned: true, pinnedAt: nextPin };
      const { pinnedAt: _drop, ...rest } = l;
      void _drop;
      return { ...rest, pinned: false };
    }),
  });
  return now;
}

/** Pinned lists first, in the order they were pinned (lists pinned before this existed keep
 *  their old order, ahead of newer pins); then the rest in their usual order. */
export function orderLists(lists: WatchList[]): WatchList[] {
  const pinned = lists
    .map((l, i) => ({ l, i }))
    .filter((x) => x.l.pinned)
    .sort((a, b) => (a.l.pinnedAt ?? 0) - (b.l.pinnedAt ?? 0) || a.i - b.i)
    .map((x) => x.l);
  return [...pinned, ...lists.filter((l) => !l.pinned)];
}

export function deleteList(id: string) {
  const s = load();
  save({ ...s, lists: s.lists.filter((l) => l.id !== id) });
}

export function duplicateList(id: string): WatchList | null {
  const s = load();
  const src = s.lists.find((l) => l.id === id);
  if (!src || s.lists.length >= MAX_LISTS) return null;
  const copy: WatchList = { ...src, id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: `${src.name} COPY`.slice(0, 30), keys: [...src.keys] };
  save({ ...s, lists: [...s.lists, copy] });
  return copy;
}

export function toggleInList(listId: string, key: string): boolean {
  const s = load();
  let now = false;
  save({
    ...s,
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      now = !l.keys.includes(key);
      return { ...l, keys: now ? [...l.keys, key] : l.keys.filter((k) => k !== key) };
    }),
  });
  return now;
}

export function removeFromList(listId: string, key: string) {
  const s = load();
  save({ ...s, lists: s.lists.map((l) => (l.id === listId ? { ...l, keys: l.keys.filter((k) => k !== key) } : l)) });
}

/** Move a stock one step up/down inside a list (manual ordering). */
export function moveInList(listId: string, key: string, dir: -1 | 1) {
  const s = load();
  save({
    ...s,
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const i = l.keys.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.keys.length) return l;
      const keys = [...l.keys];
      [keys[i], keys[j]] = [keys[j], keys[i]];
      return { ...l, keys };
    }),
  });
}

export function setNote(key: string, text: string) {
  const s = load();
  const notes = { ...s.notes };
  const t = text.trim().slice(0, 280);
  if (t) notes[key] = t;
  else delete notes[key];
  save({ ...s, notes });
}

/** Drop references to stocks no longer saved. */
export function pruneTo(savedKeys: Set<string>) {
  const s = load();
  const lists = s.lists.map((l) => ({ ...l, keys: l.keys.filter((k) => savedKeys.has(k)) }));
  const notes = Object.fromEntries(Object.entries(s.notes).filter(([k]) => savedKeys.has(k)));
  save({ lists, notes });
}

export { stockKey };

/** Drag-reorder: put `key` where `targetKey` currently sits inside a list. */
export function moveKeyTo(listId: string, key: string, targetKey: string) {
  const s = load();
  save({
    ...s,
    lists: s.lists.map((l) => {
      if (l.id !== listId) return l;
      const i = l.keys.indexOf(key);
      const j = l.keys.indexOf(targetKey);
      if (i < 0 || j < 0 || i === j) return l;
      const keys = [...l.keys];
      keys.splice(i, 1);
      keys.splice(j, 0, key);
      return { ...l, keys };
    }),
  });
}
