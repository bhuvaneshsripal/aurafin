import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Modal from './Modal';
import CountryFlag from './CountryFlag';
import { cn } from './ui/cn';

interface Row {
  key: string;
  name: string;
  region: string;
  price: number;
  previousClose?: number;
  high?: number;
  low?: number;
  open?: number;
  updatedAt?: number;
}

const POLL_MS = 30_000;
const fmt = (n: number | undefined) =>
  n === undefined ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "12 Oct, 11:59 AM" in India time, like the reference table. */
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

const th = 'px-4 py-3 text-right font-medium text-muted whitespace-nowrap';
const td = 'px-4 py-4 text-right tabular-nums text-ink-2 whitespace-nowrap';

/** Global indices table (opened from the globe button in the top bar):
 *  Index name · Last traded · Day change · High · Low · Open · Prev. close. */
export default function GlobalIndicesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null | undefined>(undefined); // undefined = loading
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/market/global-indices');
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
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(id);
  }, [open, load]);

  return (
    <Modal open={open} onClose={onClose} title="Global indices" contentPanel>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted">
          {asOf ? `Updated ${asOf.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every 30s` : 'Live index levels from around the world'}
        </p>
        <button
          onClick={load}
          aria-label="Refresh"
          className="shrink-0 h-9 w-9 flex items-center justify-center rounded-lg border border-line hover:bg-surface-hover text-ink-2"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="rounded-xl border border-line bg-surface overflow-x-auto">
        <table className="w-full text-sm min-w-[780px]">
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
                    <div className="h-5 rounded bg-slate-200/70 dark:bg-slate-700/50 animate-pulse" />
                  </td>
                </tr>
              ))}

            {rows === null && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  Couldn't load global indices.{' '}
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
                        <CountryFlag code={r.region} />
                        <div className="leading-tight">
                          <p className="font-medium text-ink whitespace-nowrap">{r.name}</p>
                          <p className="text-xs text-muted whitespace-nowrap mt-0.5">{stamp(r.updatedAt)}</p>
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

      <p className="mt-4 text-xs text-muted leading-relaxed">
        Index levels come from Yahoo Finance and may be delayed. Futures and some overseas indices are indicative and can
        differ from the exchange's official prices. The time under each name is when that index last traded (IST).
      </p>
    </Modal>
  );
}
