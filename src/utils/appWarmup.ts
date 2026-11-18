/**
 * Loads each screen's data in the background right after the app opens, so by
 * the time a page is visited its numbers are already there instead of showing
 * grey placeholders while they download.
 *
 * Pages read from the module-level caches here (and from the localStorage
 * caches in fetchCache) for their first paint, then refresh as usual.
 */
import { fetchLiveQuotes, type LiveQuoteDetail } from './marketPrices';
import { readSavedStocks, type SavedStock } from './savedStocks';
import { fetchStockHistory, type Exchange } from './stockDetail';
import { stockKey } from './watchlistLists';
import { writeCache } from './fetchCache';
import { getNetworkQuality } from '../store/networkStore';

// ---- Watchlist helpers (shared with pages/Watchlist.tsx) ----------------------
export const bare = (s: string) => s.replace(/\.(NS|BO)$/i, '');
export const isBse = (s: SavedStock) => s.market === 'IN' && (s.exchange === 'BSE' || /\.BO$/i.test(s.symbol));
export const quoteKey = (s: SavedStock) => (isBse(s) ? `${bare(s.symbol).toUpperCase()}.BO` : bare(s.symbol).toUpperCase());
export const skey = (s: SavedStock) => stockKey(s.market, s.symbol);
export const exchangeOf = (s: SavedStock): Exchange => (isBse(s) ? 'BSE' : 'NSE');

/** Latest quote per watchlist stock (key = quoteKey). */
export const watchlistQuoteCache = new Map<string, LiveQuoteDetail>();

/** Trend + 52-week range per stock. */
export interface Shape {
  closes: number[];
  low: number;
  high: number;
}
export const shapeCache = new Map<string, { at: number; shape: Shape | null }>();
export const SHAPE_TTL = 30 * 60 * 1000;
export const SHAPE_RETRY = 2 * 60 * 1000;

export async function loadShape(s: SavedStock): Promise<Shape | null> {
  let shape: Shape | null = null;
  try {
    const h = await fetchStockHistory(bare(s.symbol), s.market, exchangeOf(s), '1Y');
    const pts = h.points.filter((p) => Number.isFinite(p[4]));
    if (pts.length > 2) {
      shape = {
        closes: pts.slice(-14).map((p) => p[4]),
        low: Math.min(...pts.map((p) => (Number.isFinite(p[3]) ? p[3] : p[4]))),
        high: Math.max(...pts.map((p) => (Number.isFinite(p[2]) ? p[2] : p[4]))),
      };
    }
  } catch {
    /* leave this row without a trend */
  }
  shapeCache.set(skey(s), { at: Date.now(), shape });
  return shape;
}

let quotesRunning = false;
/** Fetches quotes for every saved stock into watchlistQuoteCache. */
export async function warmWatchlistQuotes(): Promise<void> {
  if (quotesRunning || getNetworkQuality() === 'offline') return;
  const items = readSavedStocks();
  if (items.length === 0) return;
  quotesRunning = true;
  try {
    const got = await fetchLiveQuotes(items.map((s) => ({ key: quoteKey(s), market: s.market })));
    got.forEach((v, k) => watchlistQuoteCache.set(k, v));
  } catch {
    /* the page will try again when opened */
  } finally {
    quotesRunning = false;
  }
}

let shapesRunning = false;
/** Fetches the trend / 52-week range for saved stocks that don't have a fresh one (3 at a time). */
export async function warmWatchlistShapes(): Promise<void> {
  if (shapesRunning || getNetworkQuality() === 'offline') return;
  const now = Date.now();
  const todo = readSavedStocks().filter((s) => {
    const c = shapeCache.get(skey(s));
    return !(c && now - c.at < (c.shape ? SHAPE_TTL : SHAPE_RETRY));
  });
  if (todo.length === 0) return;
  shapesRunning = true;
  try {
    const worker = async () => {
      while (todo.length) await loadShape(todo.shift()!);
    };
    await Promise.all([worker(), worker(), worker()]);
  } finally {
    shapesRunning = false;
  }
}

// ---- Other screens: save their data into the same caches their pages read ------
async function warmHighVolume(): Promise<void> {
  if (getNetworkQuality() === 'offline') return;
  try {
    const res = await fetch('/api/market/volume', { cache: 'no-store' });
    const json = await res.json();
    if (res.ok && Array.isArray(json?.stocks)) writeCache('high-volume-all', json.stocks);
  } catch {
    /* keep the previous saved copy */
  }
}

export const warmEverything = async (): Promise<void> => {
  await warmWatchlistQuotes();
  await warmWatchlistShapes();
};
export { warmHighVolume };
