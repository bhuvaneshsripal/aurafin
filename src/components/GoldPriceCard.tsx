import { Coins, RefreshCw } from 'lucide-react';
import { useLivePricesStore } from '../store/livePricesStore';
import { goldPricePerGram22k } from '../utils/goldPrice';
import { formatCurrency } from '../utils/currency';

/** "3 min ago" / "just now" style relative time for the price timestamp. */
function timeAgo(ts: number | null): string {
  if (!ts) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr ago`;
}

function RateBlock({
  label,
  perGram,
  accent,
}: {
  label: string;
  perGram: number;
  accent: string;
}) {
  return (
    <div className="flex-1 rounded-xl border border-slate-100 dark:border-slate-800 p-4">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${accent}`} />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="font-numeric text-2xl font-bold text-slate-900 dark:text-white mt-1.5">
        {formatCurrency(perGram, 'INR', { fractionDigits: 2 })}
        <span className="text-xs font-medium text-slate-400 ml-1">/ gram</span>
      </p>
      <p className="font-numeric text-sm text-slate-500 dark:text-slate-400 mt-0.5">
        {formatCurrency(perGram * 10, 'INR', { fractionDigits: 0 })}
        <span className="text-xs text-slate-400 ml-1">/ 10g</span>
      </p>
    </div>
  );
}

/**
 * Live 24K + 22K gold rate ticker, styled like the price header on a
 * digital-gold app (e.g. "Digi Gold"). 24K comes straight from the live
 * spot feed (api/market/gold.js); 22K is derived from it at the standard
 * 22/24 purity ratio — see src/utils/goldPrice.ts.
 *
 * This is a GLOBAL SPOT estimate, not an exact local jeweller quote —
 * Indian retail gold runs higher due to import duty, GST, and dealer
 * margin, and there's no free API for that. Settings > Preferences has a
 * "Gold rate adjustment %" for calibrating this toward a trusted source.
 */
export default function GoldPriceCard() {
  const price24k = useLivePricesStore((s) => s.goldPricePerGram);
  const asOf = useLivePricesStore((s) => s.goldPriceAsOf);
  const loading = useLivePricesStore((s) => s.goldPriceLoading);
  const error = useLivePricesStore((s) => s.goldPriceError);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber-500 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-2 flex items-center justify-center">
            <Coins className="w-4 h-4" />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Live Gold Price</p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500">India · per gram, calibrated live estimate</p>
          </div>
        </div>
        {price24k !== null && !loading && (
          <span className="flex items-center gap-1 text-[11px] font-medium text-brand-600 dark:text-brand-300">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {price24k === null && loading && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-3">
          <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          <span className="text-xs text-slate-400 dark:text-slate-500">Fetching live gold rate…</span>
        </div>
      )}

      {price24k === null && !loading && error && (
        <p className="mt-4 text-sm text-slate-400">Couldn't fetch a live gold rate right now. Try again shortly.</p>
      )}

      {price24k !== null && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <RateBlock label="24K (999)" perGram={price24k} accent="bg-amber-500" />
            <RateBlock label="22K (916)" perGram={goldPricePerGram22k(price24k)} accent="bg-amber-300" />
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-3">
            {error ? 'Showing last known rate · ' : ''}Updated {timeAgo(asOf)}
          </p>
        </>
      )}
    </div>
  );
}
