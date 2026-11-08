// Every NSE stock with today's traded volume, so the High volume page can list the whole market
// (not just the top few). Sources, merged by symbol:
//   1. NSE "NIFTY TOTAL MARKET" (about 750 stocks; falls back to NIFTY 500): price, % change, volume,
//      day / 52-week range.
//   2. NSE "most active by volume": makes sure the heaviest-traded names are present even if they sit
//      outside that index.
//   3. NSE "volume gainers": carries the 1-week average volume, so we can show how unusual today's
//      volume is.
import {
  fetchNseIndexConstituents,
  fetchNseMostActiveByVolume,
  fetchNseVolumeGainers,
} from './nse.js';

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

function normalize(row) {
  const symbol = typeof row?.symbol === 'string' ? row.symbol.trim() : undefined;
  // The index's own summary row (e.g. "NIFTY 500") comes back with the constituents: skip it.
  if (!symbol || /\s/.test(symbol) || row?.priority === 1) return null;
  const volume = num(row.totalTradedVolume ?? row.quantityTraded ?? row.volume ?? row.tradedQuantity);
  const price = num(row.lastPrice ?? row.ltp ?? row.lastTradedPrice);
  if (volume === undefined || price === undefined || price <= 0) return null;
  const avgVolume = num(row.week1AvgVolume ?? row.avgVolume);
  return {
    symbol,
    name: row.meta?.companyName ?? row.companyName ?? symbol,
    price,
    changePct: num(row.pChange) ?? 0,
    volume,
    avgVolume,
    // How many times its usual (1-week average) volume has traded today.
    volumeMultiple: avgVolume && avgVolume > 0 ? volume / avgVolume : undefined,
    // Approximate traded value in rupees (shares x last price), same basis for every row.
    value: volume * price,
    dayHigh: num(row.dayHigh),
    dayLow: num(row.dayLow),
    yearHigh: num(row.yearHigh),
    yearLow: num(row.yearLow),
  };
}

const rowsOf = (settled) =>
  settled.status === 'fulfilled' ? settled.value.map(normalize).filter(Boolean) : [];

export async function fetchVolumeLeaders() {
  const [total, active, gainers] = await Promise.allSettled([
    fetchNseIndexConstituents('NIFTY TOTAL MARKET'),
    fetchNseMostActiveByVolume(),
    fetchNseVolumeGainers(),
  ]);

  let universe = rowsOf(total);
  if (universe.length === 0) {
    // Total-market table unavailable: the 500-stock index is the next widest list.
    try {
      universe = (await fetchNseIndexConstituents('NIFTY 500')).map(normalize).filter(Boolean);
    } catch {
      /* use the active / gainers tables below */
    }
  }

  const bySymbol = new Map();
  for (const r of universe) bySymbol.set(r.symbol, r);
  // Heavy-traded names missing from the index list are added; for names already there, only fill gaps.
  for (const r of [...rowsOf(active), ...rowsOf(gainers)]) {
    const have = bySymbol.get(r.symbol);
    if (!have) {
      bySymbol.set(r.symbol, r);
    } else if (have.avgVolume === undefined && r.avgVolume !== undefined) {
      have.avgVolume = r.avgVolume;
      have.volumeMultiple = r.avgVolume > 0 ? have.volume / r.avgVolume : undefined;
    }
  }

  const rows = [...bySymbol.values()];
  if (rows.length === 0) return null;
  return rows.sort((a, b) => b.volume - a.volume);
}
