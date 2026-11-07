import { stockKey } from './savedStocks';

/** Playlist-style lists layered over the saved stocks ("All"), plus a private note per stock.
 *  A stock can sit in several lists. Lives on this device (localStorage), every access guarded. */

export interface WatchList {
  id: string;
  name: string;
  emoji: string;
  /** stockKey() values, in the user's manual order */
  keys: string[];
}
interface Store {
  lists: WatchList[];
  notes: Record<string, string>;
}

const KEY = 'aurafin.watchlist.lists';
export const MAX_LISTS = 12;
export const LIST_EMOJIS = ['⭐', '🚀', '💰', '🏦', '💻', '🛢️', '🌱', '🔥', '🎯', '🧪', '🏭', '🌍'];

function load(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    const lists = Array.isArray(v.lists)
      ? v.lists.filter((l: WatchList) => l && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.keys))
      : [];
    return { lists, notes: v.notes && typeof v.notes === 'object' ? v.notes : {} };
  } catch {
    return { lists: [], notes: {} };
  }
}
function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — the change just won't persist */
  }
}

export const readLists = (): WatchList[] => load().lists;
export const readNotes = (): Record<string, string> => load().notes;

export function createList(name: string, emoji: string): WatchList | null {
  const s = load();
  const n = name.trim().slice(0, 30);
  if (!n || s.lists.length >= MAX_LISTS) return null;
  const list: WatchList = { id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: n, emoji, keys: [] };
  save({ ...s, lists: [...s.lists, list] });
  return list;
}

export function updateList(id: string, patch: Partial<Pick<WatchList, 'name' | 'emoji'>>) {
  const s = load();
  save({
    ...s,
    lists: s.lists.map((l) => (l.id === id ? { ...l, ...patch, name: (patch.name ?? l.name).trim().slice(0, 30) || l.name } : l)),
  });
}

export function deleteList(id: string) {
  const s = load();
  save({ ...s, lists: s.lists.filter((l) => l.id !== id) });
}

export function duplicateList(id: string): WatchList | null {
  const s = load();
  const src = s.lists.find((l) => l.id === id);
  if (!src || s.lists.length >= MAX_LISTS) return null;
  const copy: WatchList = { ...src, id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, name: `${src.name} copy`.slice(0, 30), keys: [...src.keys] };
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
