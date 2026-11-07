import { useEffect, useRef, useState } from 'react';
import { Coins } from 'lucide-react';
import { cn } from '../ui';
import { fetchDividends, summarizeDividends, type DividendData } from '../../utils/dividends';
import { currencySymbol, fmtNum, type Exchange, type Market } from '../../utils/stockDetail';
import { inToast } from '../../utils/toastGuard';

const fmtDate = (ms: number, market: Market) =>
  new Date(ms).toLocaleDateString(market === 'US' ? 'en-US' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Dividend" button for the stock page header: says at a glance whether the stock pays one,
 *  and opens the recent payments. Sits right after the Valuation button. */
export default function DividendChip({
  symbol,
  market,
  exchange,
  price,
}: {
  symbol: string;
  market: Market;
  exchange: Exchange;
  price: number | null;
}) {
  const [data, setData] = useState<DividendData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setData(null);
    setOpen(false);
    fetchDividends(symbol, market, exchange)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setState('ready');
      })
      .catch(() => !cancelled && setState('failed'));
    return () => {
      cancelled = true;
    };
  }, [symbol, market, exchange]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (inToast(e.target)) return;
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (state === 'failed') return null;
  if (state === 'loading' || !data) {
    return <span className="inline-flex h-10 w-32 shrink-0 animate-pulse rounded-lg border border-line bg-surface-muted" aria-hidden />;
  }

  const sum = summarizeDividends(data, price);
  const cur = currencySymbol(market);
  const label = sum.paysNow ? `${cur}${fmtNum(sum.ttmPerShare, market)}` : sum.everPaid ? 'None this year' : 'No dividend';

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Dividends paid by this company"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink-2 transition-colors hover:bg-surface-hover"
      >
        <Coins size={18} />
        Dividend
        <span
          className={cn(
            'rounded-md px-1.5 py-0.5 text-xs font-semibold font-numeric',
            sum.paysNow ? 'bg-positive-soft text-positive' : 'bg-surface-muted text-muted'
          )}
        >
          {label}
          {sum.paysNow && sum.yieldPct !== null && ` · ${sum.yieldPct.toFixed(1)}%`}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-12 z-30 w-[300px] rounded-2xl border border-line bg-surface p-4 shadow-lg">
          {sum.everPaid ? (
            <>
              <p className="text-xs text-muted">Last 12 months, per share</p>
              <p className="mt-0.5 text-xl font-semibold text-ink font-numeric">
                {cur}
                {fmtNum(sum.ttmPerShare, market)}
                {sum.yieldPct !== null && <span className="ml-2 text-sm font-medium text-positive">{sum.yieldPct.toFixed(2)}% yield</span>}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {sum.paymentsTtm} {sum.paymentsTtm === 1 ? 'payment' : 'payments'} in the last year
              </p>
              <div className="mt-3 border-t border-line pt-2">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Recent payments (ex-date)</p>
                <ul className="divide-y divide-line-soft">
                  {data.dividends.slice(0, 6).map((d) => (
                    <li key={d.date} className="flex items-center justify-between py-1.5 text-sm">
                      <span className="text-muted">{fmtDate(d.date, market)}</span>
                      <span className="font-medium text-ink font-numeric">
                        {cur}
                        {fmtNum(d.amount, market)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink">This company hasn’t paid a dividend in the last 10 years of data.</p>
          )}
          <p className="mt-2 text-[11px] text-faint">Source: Yahoo Finance. Past payments don’t guarantee future ones.</p>
        </div>
      )}
    </div>
  );
}
