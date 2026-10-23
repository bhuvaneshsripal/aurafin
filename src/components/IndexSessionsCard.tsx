import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAlertsStore } from '../store/alertsStore';
import { loadIndices, type IndexQuote } from '../hooks/useMarketAlerts';
import { getIstDateInfo, getIstTimeOfDay, isMarketOpen } from '../utils/marketHours';

const INDEXES = [
  { key: 'nifty', label: 'NIFTY 50' },
  { key: 'sensex', label: 'SENSEX' },
  { key: 'banknifty', label: 'BANK NIFTY' },
];

const fmt = (n?: number) =>
  n === undefined ? '—' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Today's market summary on the notifications page: for Nifty 50, Sensex and
 *  Bank Nifty — live level, plus the levels at pre-market, open and close. */
export default function IndexSessionsCard({ hasAlerts }: { hasAlerts: boolean }) {
  const sessions = useAlertsStore((s) => s.sessions);
  const hiddenCards = useAlertsStore((s) => s.hiddenCards);
  const hideCard = useAlertsStore((s) => s.hideCard);
  const removeSession = useAlertsStore((s) => s.removeSession);
  const [quotes, setQuotes] = useState<IndexQuote[]>([]);
  const { dateKey } = getIstDateInfo();
  const today = sessions[dateKey] ?? {};
  const pastDays = Object.keys(sessions)
    .filter((d) => d < dateKey)
    .sort()
    .reverse();
  const formatDay = (d: string) =>
    new Date(`${d}T12:00:00+05:30`).toLocaleDateString('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    });

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const q = await loadIndices();
      if (!stop && q.length) setQuotes(q);
    };
    void tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, []);

  const { hour, minute } = getIstTimeOfDay();
  const mins = hour * 60 + minute;
  const afterClose = !isMarketOpen() && mins >= 15 * 60 + 30;
  const afterOpen = mins >= 9 * 60 + 15;
  const visible = INDEXES.filter(({ key }) => !hiddenCards.includes(`${dateKey}:${key}`));
  const delBtn = (label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="h-7 w-7 -mr-1 shrink-0 flex items-center justify-center rounded-full text-slate-500 hover:bg-surface-hover hover:text-red-500"
    >
      <Trash2 size={14} />
    </button>
  );

  return (
    <div className="px-4 pt-4 pb-2 w-full">
      {visible.length > 0 && <p className="text-xs font-semibold tracking-wide text-muted uppercase mb-2">Today's market</p>}
      <div className="space-y-3">
        {visible.map(({ key, label }) => {
          const q = quotes.find((x) => x.key === key);
          const pct = q?.previousClose ? ((q.price - q.previousClose) / q.previousClose) * 100 : undefined;
          const tone = pct === undefined ? 'text-ink' : pct >= 0 ? 'text-emerald-600' : 'text-red-500';
          const open = today.open?.[key]?.price ?? (afterOpen ? q?.open : undefined);
          // Pre-market is only observable 9:00-9:15; if the app wasn't running
          // then, the opening level (set by the pre-open auction) stands in.
          const pre = today.pre?.[key]?.price ?? open;
          const close = today.close?.[key]?.price ?? (afterClose ? q?.price : undefined);
          return (
            <div key={key} className="rounded-xl border border-line bg-surface p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{label}</p>
                <div className="flex items-center gap-1">
                  <p className={`text-sm font-semibold ${tone}`}>
                    {fmt(q?.price)}
                    {pct !== undefined && ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`}
                  </p>
                  {delBtn(`Delete ${label}`, () => hideCard(`${dateKey}:${key}`))}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-[11px]">
                {[
                  ['Prev close', q?.previousClose],
                  ['Pre-market', pre],
                  ['Open', open],
                  ['Close', close],
                ].map(([name, val]) => (
                  <div key={name as string}>
                    <p className="text-muted">{name as string}</p>
                    <p className="font-medium text-ink-2">{fmt(val as number | undefined)}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {pastDays.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase mb-2">Earlier days</p>
          <div className="space-y-3">
            {pastDays.map((day) => (
              <div key={day} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-ink">{formatDay(day)}</p>
                  {delBtn(`Delete ${formatDay(day)}`, () => removeSession(day))}
                </div>
                <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 text-[11px]">
                  <span />
                  <span className="text-muted">Pre-market</span>
                  <span className="text-muted">Open</span>
                  <span className="text-muted">Close</span>
                  {INDEXES.map(({ key, label }) => (
                    <div key={key} className="contents">
                      <span className="font-semibold text-ink">{label}</span>
                      {(['pre', 'open', 'close'] as const).map((w) => (
                        <span key={w} className="font-medium text-ink-2">
                          {fmt(sessions[day]?.[w]?.[key]?.price)}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {hasAlerts ? (
        <p className="text-xs font-semibold tracking-wide text-muted uppercase mt-5">Alerts</p>
      ) : visible.length === 0 && pastDays.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No notifications</p>
      ) : null}
    </div>
  );
}
