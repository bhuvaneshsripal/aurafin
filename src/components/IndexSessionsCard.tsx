import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
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

/** Today's market summary at the top of the notifications page: one card per
 *  index (Nifty 50, Sensex, Bank Nifty) with the live level and the levels at
 *  prev close / pre-market / open / close, plus a collapsible list of earlier days. */
export default function IndexSessionsCard() {
  const sessions = useAlertsStore((s) => s.sessions);
  const hiddenCards = useAlertsStore((s) => s.hiddenCards);
  const hideCard = useAlertsStore((s) => s.hideCard);
  const removeSession = useAlertsStore((s) => s.removeSession);
  const [quotes, setQuotes] = useState<IndexQuote[]>([]);
  const [showPast, setShowPast] = useState(false);
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
  const live = isMarketOpen();
  const afterClose = !live && mins >= 15 * 60 + 30;
  const afterOpen = mins >= 9 * 60 + 15;
  const visible = INDEXES.filter(({ key }) => !hiddenCards.includes(`${dateKey}:${key}`));

  if (visible.length === 0 && pastDays.length === 0) return null;

  return (
    <section className="px-4 pt-4 pb-1">
      {visible.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[15px] font-semibold text-ink">Today&apos;s market</h3>
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5 ${
                live ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-muted'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-500 animate-notif-live' : 'bg-slate-400'}`} />
              {live ? 'Live' : 'Closed'}
            </span>
          </div>

          <div className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visible.map(({ key, label }, idx) => {
              const q = quotes.find((x) => x.key === key);
              const pct = q?.previousClose ? ((q.price - q.previousClose) / q.previousClose) * 100 : undefined;
              const up = (pct ?? 0) >= 0;
              const open = today.open?.[key]?.price ?? (afterOpen ? q?.open : undefined);
              // Pre-market is only observable 9:00-9:15; if the app wasn't running
              // then, the opening level (set by the pre-open auction) stands in.
              const pre = today.pre?.[key]?.price ?? open;
              const close = today.close?.[key]?.price ?? (afterClose ? q?.price : undefined);
              return (
                <div
                  key={key}
                  style={{ animationDelay: `${idx * 50}ms` }}
                  className="animate-notif-row snap-start shrink-0 w-[78%] sm:w-[250px] md:flex-1 md:w-auto md:min-w-[200px] rounded-2xl border border-line bg-surface p-3.5 relative group"
                >
                  <button
                    type="button"
                    onClick={() => hideCard(`${dateKey}:${key}`)}
                    aria-label={`Hide ${label}`}
                    className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded-full text-muted opacity-60 hover:opacity-100 hover:bg-surface-hover"
                  >
                    <X size={13} />
                  </button>
                  <p className="text-[11px] font-semibold tracking-wide text-muted">{label}</p>
                  {q ? (
                    <>
                      <p className="mt-1 text-xl font-semibold text-ink tabular-nums">{fmt(q.price)}</p>
                      {pct !== undefined && (
                        <span
                          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                            up ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'
                          }`}
                        >
                          {up ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%
                        </span>
                      )}
                    </>
                  ) : (
                    <div className="mt-2 space-y-2 animate-pulse">
                      <div className="h-6 w-28 rounded bg-surface-hover" />
                      <div className="h-4 w-16 rounded-full bg-surface-hover" />
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-line-soft grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                    {(
                      [
                        ['Prev close', q?.previousClose],
                        ['Pre-market', pre],
                        ['Open', open],
                        ['Close', close],
                      ] as const
                    ).map(([name, val]) => (
                      <div key={name}>
                        <p className="text-muted">{name}</p>
                        <p className="font-medium text-ink-2 tabular-nums">{fmt(val)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pastDays.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowPast((v) => !v)}
            aria-expanded={showPast}
            className="tap-scale w-full flex items-center justify-between py-2 text-sm font-medium text-ink-2"
          >
            <span>Earlier sessions · {pastDays.length}</span>
            <ChevronDown size={16} className={`text-muted transition-transform duration-200 ${showPast ? 'rotate-180' : ''}`} />
          </button>
          {showPast && (
            <div className="rounded-2xl border border-line bg-surface divide-y divide-line-soft overflow-hidden">
              {pastDays.map((day) => (
                <div key={day} className="p-3 animate-notif-row">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-ink">{formatDay(day)}</p>
                    <button
                      type="button"
                      onClick={() => removeSession(day)}
                      aria-label={`Delete ${formatDay(day)}`}
                      className="h-6 w-6 flex items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-red-500"
                    >
                      <X size={13} />
                    </button>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-x-3 gap-y-1 text-[11px] tabular-nums">
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
          )}
        </div>
      )}
    </section>
  );
}
