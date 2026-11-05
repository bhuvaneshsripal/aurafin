// Stocks with the highest traded volume today on NSE.
// Primary source: NSE "most active securities by volume". If that table is
// unavailable, fall back to the "volume gainers" table, which also carries the
// 1-week average volume (so we can show how unusual today's volume is).
import { fetchNseMostActiveByVolume, fetchNseVolumeGainers } from './nse.js';

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

function normalize(row) {
  const symbol = typeof row?.symbol === 'string' ? row.symbol : undefined;
  if (!symbol) return null;
  const volume = num(row.quantityTraded ?? row.totalTradedVolume ?? row.volume ?? row.tradedQuantity);
  const price = num(row.lastPrice ?? row.ltp ?? row.lastTradedPrice);
  if (volume === undefined || price === undefined) return null;
  const avgVolume = num(row.week1AvgVolume ?? row.avgVolume);
  return {
    symbol,
    name: row.companyName ?? row.meta?.companyName ?? symbol,
    price,
    changePct: num(row.pChange) ?? 0,
    volume,
    avgVolume,
    // How many times its usual (1-week average) volume has traded today.
    volumeMultiple: avgVolume && avgVolume > 0 ? volume / avgVolume : undefined,
  };
}

export async function fetchVolumeLeaders() {
  let rows = [];
  try {
    rows = (await fetchNseMostActiveByVolume()).map(normalize).filter(Boolean);
  } catch {
    /* fall through to the second table */
  }
  if (rows.length === 0) {
    rows = (await fetchNseVolumeGainers()).map(normalize).filter(Boolean);
  }
  if (rows.length === 0) return null;
  return rows.sort((a, b) => b.volume - a.volume).slice(0, 50);
}
