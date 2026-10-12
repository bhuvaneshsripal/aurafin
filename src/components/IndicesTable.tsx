import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import CountryFlag from './CountryFlag';
import IndexIcon from './IndexIcon';
import { cn } from './ui/cn';
import { isMarketOpen } from '../utils/marketHours';

export type IndicesVariant = 'indian' | 'global';

interface Row {
  key: string;
  name: string;
  /** Global only: country code for the flag. */
  region?: string;
  /** Indian only: NSE or BSE. */
  exchange?: string;
  price: number;
  previousClose?: number;
  high?: number;
  low?: number;
  open?: number;
  updatedAt?: number;
}

const ENDPOINT: Record<IndicesVariant, string> = {
  indian: '/api/market/indian-indices',
  global: '/api/market/global-indices',
};
const POLL_MS = 30_000;
// Indian indices refresh every few seconds while the market is open.
const LIVE_POLL_MS = 5_000;

const fmt = (n: number | undefined) =>
  n === undefined ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "12 Oct, 11:59 AM" in India time. */
function stamp(ms: number | undefined) {
  if (!ms) return '';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value])
  );
  return `${p.day} ${p.month}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
}

const th = 'px-4 py-4 text-right font-medium text-muted whitespace-nowrap';
const td = 'px-4 py-4 text-right tabular-nums text-ink-2 whitespace-nowrap';

/** Index table: Index name · Last traded · Day change · High · Low · Open · Prev. Close. */
export default function IndicesTable({ variant }: { variant: IndicesVariant }) {
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined); // undefined = loading
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT[variant]);
      if (!res.ok) throw new Error(String(res.status));
      const json = await res.json();
      if (!Array.isArray(json?.indices)) throw new Error('bad payload');
      setRows(json.indices);
      setAsOf(new Date());
    } catch {
      // Keep the last good table on a failed refresh.
      setRows((prev) => (Array.isArray(prev) ? prev : null));
    } finally {
      setLoading(false);
    }
  }, [variant]);

  useEffect(() => {
    setRows(undefined);
    setAsOf(null);
    load();
    let timer: number;
    const schedule = () => {
      timer = window.setTimeout(async () => {
        if (document.visibilityState === 'visible') await load();
        schedule();
      }, variant === 'indian' && isMarketOpen() ? LIVE_POLL_MS : POLL_MS);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-4">
        <p className="text-xs text-muted">
          {asOf
            ? `Updated ${asOf.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${variant === 'indian' && isMarketOpen() ? 'live' : 'refreshes every 30s'}`
            : 'Live index levels'}
        </p>
        <button
          onClick={load}
          aria-label="Refresh"
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg border border-line hover:bg-surface-hover text-ink-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead>
            <tr className="border-b border-line-soft">
              <th className={cn(th, 'text-left')}>Index name</th>
              <th className={th}>Last traded</th>
              <th className={th}>Day change</th>
              <th className={th}>High</th>
              <th className={th}>Low</th>
              <th className={th}>Open</th>
              <th className={th}>Prev. Close</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows === undefined &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-4">
                    <div className="h-6 rounded bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" />
                  </td>
                </tr>
              ))}

            {rows === null && (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-sm text-muted">
                  Couldn't load the indices.{' '}
                  <button onClick={load} className="font-medium text-brand-700 dark:text-brand-300 underline underline-offset-2">
                    Try again
                  </button>
                </td>
              </tr>
            )}

            {Array.isArray(rows) &&
              rows.map((r) => {
                const change = r.previousClose !== undefined ? r.price - r.previousClose : undefined;
                const pct = change !== undefined && r.previousClose ? (change / r.previousClose) * 100 : undefined;
                const up = (change ?? 0) >= 0;
                return (
                  <tr key={r.key} className="hover:bg-surface-hover/60">
                    <td className="px-4 py-4 text-left">
                      <div className="flex items-center gap-3">
                        {variant === 'global' ? <CountryFlag code={r.region ?? ''} /> : <IndexIcon indexKey={r.key} exchange={r.exchange} />}
                        <div className="leading-tight">
                          <p className="font-medium text-ink whitespace-nowrap">{r.name}</p>
                          {variant === 'global' && r.updatedAt && (
                            <p className="text-xs text-muted whitespace-nowrap mt-0.5">{stamp(r.updatedAt)}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className={cn(td, 'font-medium text-ink')}>{fmt(r.price)}</td>
                    <td className={cn(td, 'font-medium', change === undefined ? '' : change === 0 ? 'text-ink-2' : up ? 'text-positive' : 'text-negative')}>
                      {change === undefined || pct === undefined
                        ? '—'
                        : `${change > 0 ? '+' : change < 0 ? '-' : ''}${fmt(Math.abs(change))} (${Math.abs(pct).toFixed(2)}%)`}
                    </td>
                    <td className={td}>{fmt(r.high)}</td>
                    <td className={td}>{fmt(r.low)}</td>
                    <td className={td}>{fmt(r.open)}</td>
                    <td className={td}>{fmt(r.previousClose)}</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <p className="px-4 sm:px-5 py-4 text-xs text-muted leading-relaxed border-t border-line-soft">
        {variant === 'indian'
          ? 'NSE indices come from NSE India and BSE indices from Yahoo Finance; levels can be slightly delayed.'
          : "Index levels come from Yahoo Finance and may be delayed. Futures and some overseas indices are indicative and can differ from the exchange's official prices. The time under each name is when that index last traded (IST)."}
      </p>
    </div>
  );
}
