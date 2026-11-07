import type { Market } from './stockDetail';

/** Stocks saved with the bookmark on the stock page, and the price alerts set with its bell.
 *  Both live on this device (localStorage); storage can be blocked, so every access is guarded. */

export interface SavedStock {
  symbol: string;
  name: string;
  market: Market;
  exchange: string;
}

export interface StockPriceAlert {
  symbol: string;
  name: string;
  market: Market;
  target: number;
  dir: 'above' | 'below';
}

const SAVED_KEY = 'aurafin.stock.saved';
const ALERTS_KEY = 'aurafin.stock.alerts';
export const MAX_SAVED = 50;

export const stockKey = (market: Market, symbol: string) => `${market}:${symbol.toUpperCase().replace(/\.(NS|BO)$/i, '')}`;

function read<T>(key: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the change just won't persist */
  }
}

export const readSavedStocks = (): SavedStock[] =>
  read<SavedStock>(SAVED_KEY).filter((s) => s && typeof s.symbol === 'string' && (s.market === 'IN' || s.market === 'US'));

export const isStockSaved = (market: Market, symbol: string) =>
  readSavedStocks().some((s) => stockKey(s.market, s.symbol) === stockKey(market, symbol));

/** Adds the stock if it is not saved, removes it if it is. Returns true when it is now saved. */
export function toggleSavedStock(stock: SavedStock): boolean {
  const list = readSavedStocks();
  const k = stockKey(stock.market, stock.symbol);
  if (list.some((s) => stockKey(s.market, s.symbol) === k)) {
    write(SAVED_KEY, list.filter((s) => stockKey(s.market, s.symbol) !== k));
    return false;
  }
  write(SAVED_KEY, [stock, ...list].slice(0, MAX_SAVED));
  return true;
}

export const readStockAlerts = (): StockPriceAlert[] =>
  read<StockPriceAlert>(ALERTS_KEY).filter(
    (a) => a && typeof a.symbol === 'string' && typeof a.target === 'number' && (a.dir === 'above' || a.dir === 'below')
  );

export const alertFor = (market: Market, symbol: string) =>
  readStockAlerts().find((a) => stockKey(a.market, a.symbol) === stockKey(market, symbol)) ?? null;

/** One alert per stock: setting a new one replaces the old. */
export function setStockAlert(alert: StockPriceAlert) {
  const k = stockKey(alert.market, alert.symbol);
  write(ALERTS_KEY, [alert, ...readStockAlerts().filter((a) => stockKey(a.market, a.symbol) !== k)]);
}

export function clearStockAlert(market: Market, symbol: string) {
  const k = stockKey(market, symbol);
  write(ALERTS_KEY, readStockAlerts().filter((a) => stockKey(a.market, a.symbol) !== k));
}
