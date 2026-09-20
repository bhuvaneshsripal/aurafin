import { useState } from 'react';
import { Coins, RefreshCw, ChevronDown } from 'lucide-react';
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
    <div className="flex-1 rounded-xl border border-line-soft p-4">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${accent}`} />
        <span className="text-[13px] font-medium text-muted">{label}</span>
      </div>
      <p className="font-numeric text-xl font-semibold text-ink mt-1.5">
        {formatCurrency(perGram, 'INR', { fractionDigits: 2 })}
        <span className="text-xs font-medium text-slate-600 ml-1">/ gram</span>
      </p>
      <p className="font-numeric text-sm text-muted mt-0.5">
        {formatCurrency(perGram * 10, 'INR', { fractionDigits: 0 })}
        <span className="text-xs text-slate-600 ml-1">/ 10g</span>
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

  // Starts collapsed every time — it only opens when the person taps the
  // chevron to expand it themselves, never automatically.
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-surface border border-line rounded-2xl shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-2 text-left px-5 py-4"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 flex items-center justify-center shrink-0">
            <Coins className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Live gold price</p>
            <p className="text-xs text-muted">India · per gram, calibrated live estimate</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {price24k !== null && !loading && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary-ink">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
              Live
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-muted transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5">
          {price24k === null && loading && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-3">
              <RefreshCw className="w-3.5 h-3.5 text-slate-600 animate-spin" />
              <span className="text-xs text-muted">Fetching live gold rate…</span>
            </div>
          )}

          {price24k === null && !loading && error && (
            <p className="text-sm text-slate-600">Couldn't fetch a live gold rate right now. Try again shortly.</p>
          )}

          {price24k !== null && (
            <>
              <div className="flex flex-col sm:flex-row gap-3">
                <RateBlock label="24K (999)" perGram={price24k} accent="bg-amber-500" />
                <RateBlock label="22K (916)" perGram={goldPricePerGram22k(price24k)} accent="bg-amber-300" />
              </div>
              <p className="text-[11px] text-muted mt-3">
                {error ? 'Showing last known rate · ' : ''}Updated {timeAgo(asOf)}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
