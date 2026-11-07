import {
  ALERTS_KEY,
  MAX_SAVED,
  SAVED_KEY,
  readSavedStocks,
  readStockAlerts,
  stockKey,
  type SavedStock,
  type StockPriceAlert,
} from './savedStocks';
import { LISTS_KEY, MAX_LISTS, readLists, readNotes, type WatchList } from './watchlistLists';

/** Everything the Watchlist page keeps: saved stocks, price alerts, playlists and notes. */
export interface WatchlistSnapshot {
  saved: SavedStock[];
  alerts: StockPriceAlert[];
  lists: WatchList[];
  notes: Record<string, string>;
}

/** Fired on window after a cloud copy has been written into this device's storage, so open pages re-read it. */
export const WATCHLIST_REMOTE_EVENT = 'aurafin:watchlist-remote';

const META_KEY = 'aurafin.watchlist.syncMeta';

export const readSnapshot = (): WatchlistSnapshot => ({
  saved: readSavedStocks(),
  alerts: readStockAlerts(),
  lists: readLists(),
  notes: readNotes(),
});

export const isEmptySnapshot = (s: WatchlistSnapshot) =>
  s.saved.length === 0 && s.alerts.length === 0 && s.lists.length === 0 && Object.keys(s.notes).length === 0;

/** Firestore rejects `undefined`; this also drops anything non-JSON. */
export const toPlain = (s: WatchlistSnapshot): WatchlistSnapshot => JSON.parse(JSON.stringify(s));

/** Validates whatever came from the cloud before it is trusted. */
export function sanitizeRemote(data: Record<string, unknown> | undefined): WatchlistSnapshot {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const saved = arr(data?.saved).filter(
    (s): s is SavedStock => !!s && typeof s.symbol === 'string' && (s.market === 'IN' || s.market === 'US')
  );
  const alerts = arr(data?.alerts).filter(
    (a): a is StockPriceAlert =>
      !!a && typeof a.symbol === 'string' && typeof a.target === 'number' && (a.dir === 'above' || a.dir === 'below')
  );
  const lists = arr(data?.lists).filter(
    (l): l is WatchList => !!l && typeof l.id === 'string' && typeof l.name === 'string' && Array.isArray(l.keys)
  );
  const notes = data?.notes && typeof data.notes === 'object' ? (data.notes as Record<string, string>) : {};
  return { saved, alerts, lists, notes };
}

/** First sync on a device that already has its own data: keep both sides, cloud order first. */
export function mergeSnapshots(remote: WatchlistSnapshot, local: WatchlistSnapshot): WatchlistSnapshot {
  const seen = new Set<string>();
  const saved: SavedStock[] = [];
  for (const s of [...remote.saved, ...local.saved]) {
    const k = stockKey(s.market, s.symbol);
    if (!seen.has(k)) {
      seen.add(k);
      saved.push(s);
    }
  }
  const alertSeen = new Set<string>();
  const alerts: StockPriceAlert[] = [];
  for (const a of [...remote.alerts, ...local.alerts]) {
    const k = stockKey(a.market, a.symbol);
    if (!alertSeen.has(k)) {
      alertSeen.add(k);
      alerts.push(a);
    }
  }
  const lists: WatchList[] = remote.lists.map((l) => {
    const mine = local.lists.find((x) => x.id === l.id || x.name.toLowerCase() === l.name.toLowerCase());
    return mine ? { ...l, keys: [...new Set([...l.keys, ...mine.keys])] } : l;
  });
  for (const l of local.lists) {
    const dup = lists.some((x) => x.id === l.id || x.name.toLowerCase() === l.name.toLowerCase());
    if (!dup && lists.length < MAX_LISTS) lists.push(l);
  }
  return { saved: saved.slice(0, MAX_SAVED), alerts, lists, notes: { ...local.notes, ...remote.notes } };
}

/** Writes a snapshot straight into this device's storage (no change event, so it is not echoed back). */
export function applySnapshot(s: WatchlistSnapshot) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(s.saved));
    localStorage.setItem(ALERTS_KEY, JSON.stringify(s.alerts));
    localStorage.setItem(LISTS_KEY, JSON.stringify({ lists: s.lists, notes: s.notes }));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(WATCHLIST_REMOTE_EVENT));
}

/** Time (ms) of the last cloud copy this device has seen or sent, per signed-in user. 0 = never synced. */
export function readSyncedAt(uid: string): number {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY) || '{}');
    return m && m.uid === uid && typeof m.at === 'number' ? m.at : 0;
  } catch {
    return 0;
  }
}
export function writeSyncedAt(uid: string, at: number) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify({ uid, at }));
  } catch {
    /* ignore */
  }
}
