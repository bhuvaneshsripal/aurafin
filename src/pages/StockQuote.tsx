import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Bell, BellRing, Bookmark, ChevronsUpDown, Link2, Maximize2, Scale, Search, X } from 'lucide-react';
import { Button, Card, Skeleton, cn } from '../components/ui';
import CompanyLogo from '../components/CompanyLogo';
import StockChart, { STOCK_DOWN, STOCK_UP } from '../components/stock/StockChart';
import {
  AboutSection,
  FinancialSection,
  FundamentalsSection,
  PerformanceSection,
  Pill,
  ShareholdingSection,
} from '../components/stock/StockSections';
import { fetchLiveQuotes, type LiveQuoteDetail } from '../utils/marketPrices';
import {
  RANGE_KEYS,
  RANGE_LABEL,
  fetchStockDetail,
  fetchStockHistory,
  fmtNum,
  fmtPrice,
  type Exchange,
  type Market,
  type RangeKey,
  type StockDetail,
  type StockHistory,
} from '../utils/stockDetail';
import {
  alertFor,
  clearStockAlert,
  isStockSaved,
  setStockAlert,
  toggleSavedStock,
  type StockPriceAlert,
} from '../utils/savedStocks';
import { useToastStore } from '../store/toastStore';
import { useAlertsStore } from '../store/alertsStore';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useMediaQuery } from '../hooks/useMediaQuery';

const QUOTE_REFRESH_MS = 15_000;
const HISTORY_REFRESH_MS = 60_000;

/** Two little candles — the "candles / line" switch and the Terminal button. */
function CandlesIcon({ size = 18, muted }: { size?: number; muted?: boolean }) {
  const up = muted ? 'currentColor' : STOCK_UP;
  const down = muted ? 'currentColor' : STOCK_DOWN;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M6 2v3M6 13v4M14 4v2M14 14v3" stroke={up} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="3.5" y="5" width="5" height="8" rx="1" fill={up} />
      <rect x="11.5" y="6" width="5" height="8" rx="1" fill={down} />
      <path d="M14 4v2M14 14v3" stroke={down} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const circleBtn =
  'keep-round inline-flex h-11 w-11 shrink-0 items-center justify-center border border-line bg-surface text-ink-2 transition-colors hover:bg-surface-hover sm:h-[50px] sm:w-[50px]';

/**
 * Full-page view of any listed stock, opened from the global search
 * ("/stock?symbol=ITC&market=IN&name=ITC%20LTD&ex=NSE"): live price, a range chart,
 * today's performance, fundamentals, quarterly / yearly financials, shareholding and
 * a short company profile.
 */
export default function StockQuote() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToastStore((s) => s.push);
  const symbolParam = (params.get('symbol') ?? '').trim();
  const market: Market = params.get('market') === 'US' ? 'US' : 'IN';
  const bare = symbolParam.replace(/\.(NS|BO)$/i, '');
  const exchange: Exchange =
    market === 'US' ? 'NSE' : (params.get('ex') ?? '').toUpperCase() === 'BSE' || /\.BO$/i.test(symbolParam) ? 'BSE' : 'NSE';
  const quoteKey = market === 'IN' && exchange === 'BSE' ? `${bare.toUpperCase()}.BO` : bare.toUpperCase();
  const exchLabel = market === 'US' ? 'US' : exchange;

  const [range, setRange] = useState<RangeKey>('1D');
  const [mode, setMode] = useState<'line' | 'candle'>('line');
  const [terminal, setTerminal] = useState(false);
  const [quote, setQuote] = useState<LiveQuoteDetail | null>(null);
  const [history, setHistory] = useState<StockHistory | null>(null);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [detail, setDetail] = useState<StockDetail | null>(null);
  const [detailState, setDetailState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [saved, setSaved] = useState(() => isStockSaved(market, bare));
  const [alertOpen, setAlertOpen] = useState(false);
  const [alert, setAlert] = useState<StockPriceAlert | null>(() => alertFor(market, bare));
  const alive = useRef(true);
  const phone = useMediaQuery('(max-width: 639px)');

  useBodyScrollLock(terminal);

  // A different stock (or exchange) starts from scratch.
  useEffect(() => {
    setRange('1D');
    setQuote(null);
    setHistory(null);
    setHistoryState('loading');
    setDetail(null);
    setDetailState('loading');
    setQuoteFailed(false);
    setSaved(isStockSaved(market, bare));
    setAlert(alertFor(market, bare));
    setAlertOpen(false);
  }, [market, bare, exchange]);

  // ---- live price
  const loadQuote = useCallback(async () => {
    if (!bare) return;
    try {
      const got = await fetchLiveQuotes([{ key: quoteKey, market }]);
      if (!alive.current) return;
      const q = got.get(quoteKey);
      if (q) {
        setQuote(q);
        setQuoteFailed(false);
      } else setQuoteFailed(true);
    } catch {
      if (alive.current) setQuoteFailed(true);
    }
  }, [bare, quoteKey, market]);

  useEffect(() => {
    alive.current = true;
    void loadQuote();
    const id = window.setInterval(() => void loadQuote(), QUOTE_REFRESH_MS);
    return () => {
      alive.current = false;
      window.clearInterval(id);
    };
  }, [loadQuote]);

  // ---- chart
  const loadHistory = useCallback(
    async (quiet: boolean) => {
      if (!bare) return;
      if (!quiet) setHistoryState('loading');
      try {
        const h = await fetchStockHistory(bare, market, exchange, range);
        if (!alive.current) return;
        setHistory(h);
        setHistoryState('ready');
      } catch {
        if (alive.current && !quiet) setHistoryState('failed');
      }
    },
    [bare, market, exchange, range]
  );

  useEffect(() => {
    void loadHistory(false);
    if (range !== '1D' && range !== '1W') return;
    const id = window.setInterval(() => void loadHistory(true), HISTORY_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadHistory, range]);

  // ---- company details (performance, fundamentals, financials, shareholding, about)
  const loadDetail = useCallback(
    async (quiet: boolean) => {
      if (!bare) return;
      if (!quiet) setDetailState('loading');
      try {
        const d = await fetchStockDetail(bare, market, exchange);
        if (!alive.current) return;
        setDetail(d);
        setDetailState('ready');
      } catch {
        if (alive.current && !quiet) setDetailState('failed');
      }
    },
    [bare, market, exchange]
  );

  useEffect(() => {
    void loadDetail(false);
    const id = window.setInterval(() => void loadDetail(true), HISTORY_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [loadDetail]);

  // ---- numbers shown in the header
  const points = history?.points ?? [];
  const lastPoint = points.length ? points[points.length - 1][4] : null;
  const price = quote?.price ?? lastPoint;
  const prevClose = quote?.previousClose ?? history?.previousClose ?? detail?.performance.previousClose ?? null;
  // 1D compares with yesterday's close; longer ranges with the first price of the range.
  const baseline = range === '1D' ? (history?.range === '1D' ? history.previousClose : null) ?? prevClose : points.length ? points[0][4] : null;
  const change = price !== null && baseline !== null && baseline > 0 ? price - baseline : null;
  const changePct = change !== null && baseline ? (change / baseline) * 100 : null;
  const up = (change ?? 0) >= 0;
  const name = detail?.name || params.get('name')?.trim() || bare;
  const timezone = history?.timezone ?? (market === 'US' ? 'America/New_York' : 'Asia/Kolkata');

  // ---- price alert: fires (once) while this page is open
  useEffect(() => {
    if (!alert || price === null) return;
    const hit = alert.dir === 'above' ? price >= alert.target : price <= alert.target;
    if (!hit) return;
    clearStockAlert(market, bare);
    setAlert(null);
    const msg = `${name} is ${alert.dir === 'above' ? 'above' : 'below'} ${fmtPrice(alert.target, market)} — now ${fmtPrice(price, market)}`;
    useAlertsStore.getState().add({ kind: alert.dir === 'above' ? 'up' : 'down', title: 'Price alert', body: msg });
    toast(msg, 'info', 'top', 8000);
  }, [price, alert, market, bare, name, toast]);

  // Esc leaves the full-screen chart.
  useEffect(() => {
    if (!terminal) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTerminal(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [terminal]);

  const chartHeight = terminal ? Math.max(320, Math.round(window.innerHeight * 0.62)) : 300;

  const setExchange = (ex: Exchange) => {
    const next = new URLSearchParams(params);
    next.set('ex', ex);
    next.set('symbol', bare);
    setParams(next, { replace: true });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Link copied', 'success');
    } catch {
      toast('Couldn’t copy the link', 'error');
    }
  };

  const toggleSave = () => {
    const now = toggleSavedStock({ symbol: bare, name, market, exchange: exchLabel });
    setSaved(now);
    toast(now ? `${name} saved — find it in Search` : `${name} removed from saved`, 'success');
  };

  if (!symbolParam) {
    return (
      <div>
        <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink">
          <ArrowLeft size={14} /> Back
        </button>
        <Card>
          <p className="text-sm text-muted">No stock selected. Use the search to find one.</p>
        </Card>
      </div>
    );
  }

  const alertPopover = (
    <AlertPopover
      market={market}
      price={price}
      current={alert}
      onClose={() => setAlertOpen(false)}
      onSave={(target) => {
        const a: StockPriceAlert = { symbol: bare, name, market, target, dir: price !== null && target < price ? 'below' : 'above' };
        setStockAlert(a);
        setAlert(a);
        setAlertOpen(false);
        toast(`Alert set for ${fmtPrice(target, market)} — it fires while Aurafin is open on this page`, 'success');
      }}
      onClear={() => {
        clearStockAlert(market, bare);
        setAlert(null);
        setAlertOpen(false);
      }}
    />
  );

  const noPriceAtAll = quoteFailed && !quote && historyState === 'failed';

  return (
    <div className="mx-auto max-w-[1100px]">
      <button type="button" onClick={() => navigate(-1)} className="mb-3 hidden items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink sm:inline-flex">
        <ArrowLeft size={14} /> Back
      </button>

      {/* Phone: a bare top bar — back on the left; alert, save and search on the right. */}
      {!noPriceAtAll && (
        <div className="relative -mt-1 mb-4 flex items-center justify-between sm:hidden">
          <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="-ml-2 inline-flex h-10 w-10 items-center justify-center text-ink-2">
            <ArrowLeft size={24} />
          </button>
          <div className="flex items-center">
            <button type="button" onClick={() => setAlertOpen((o) => !o)} aria-label="Price alert" aria-expanded={alertOpen} className="inline-flex h-10 w-11 items-center justify-center text-ink-2">
              {alert ? <BellRing size={23} /> : <Bell size={23} />}
            </button>
            <button type="button" onClick={toggleSave} aria-label={saved ? 'Remove from saved' : 'Save stock'} aria-pressed={saved} className="inline-flex h-10 w-11 items-center justify-center text-ink-2">
              <Bookmark size={23} fill={saved ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              aria-label="Search stocks"
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }))}
              className="-mr-2 inline-flex h-10 w-11 items-center justify-center text-ink-2"
            >
              <Search size={23} />
            </button>
          </div>
          {phone && alertOpen && alertPopover}
        </div>
      )}

      {noPriceAtAll ? (
        <Card>
          <p className="text-sm font-semibold text-ink">Couldn’t get the price right now</p>
          <p className="mt-1 text-sm text-muted">Check your connection and try again.</p>
          <Button className="mt-4" onClick={() => { void loadQuote(); void loadHistory(false); void loadDetail(false); }}>
            Try again
          </Button>
        </Card>
      ) : (
        <Card padding="lg" className="!rounded-none !bg-transparent !p-0 !shadow-none dark:!border-0 sm:!rounded-[20px] sm:!bg-surface sm:!p-8 sm:!shadow-card dark:sm:!border dark:sm:!bg-surface-muted">
          {/* ---------------------------------------------------------- header */}
          <header className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <CompanyLogo symbol={bare} name={name} market={market} size={phone ? 48 : 60} />
              {market === 'IN' && !noPriceAtAll && (
                <button
                  type="button"
                  onClick={() => navigate(`/valuation?symbol=${encodeURIComponent(bare)}&ex=${exchange}`)}
                  title="Is it cheap or expensive? See X, X/2 and X/3 against today’s price"
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] font-semibold text-ink-2 transition-colors hover:bg-surface-hover"
                >
                  <Scale size={18} />
                  Valuation
                </button>
              )}
            </div>
            <div className="relative hidden items-center gap-2 sm:flex sm:gap-3">
              <button type="button" onClick={copyLink} aria-label="Copy link" className={circleBtn}>
                <Link2 size={20} />
              </button>
              <button
                type="button"
                onClick={() => setAlertOpen((o) => !o)}
                aria-label="Price alert"
                aria-expanded={alertOpen}
                className={cn(circleBtn, alert && 'border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800')}
              >
                {alert ? <BellRing size={20} /> : <Bell size={20} />}
              </button>
              <button
                type="button"
                onClick={toggleSave}
                aria-label={saved ? 'Remove from saved' : 'Save stock'}
                aria-pressed={saved}
                className={cn(circleBtn, saved && 'border-slate-500 bg-slate-100 dark:border-slate-400 dark:bg-slate-800')}
              >
                <Bookmark size={20} fill={saved ? 'currentColor' : 'none'} />
              </button>
              {!phone && alertOpen && alertPopover}
            </div>
          </header>

          <div className="mt-5 flex items-center gap-1.5 text-[14px] uppercase tracking-wide text-muted sm:mt-4 sm:normal-case sm:tracking-normal">
            <span>{bare}</span>
            <span>·</span>
            <span>{exchLabel}</span>
            {market === 'IN' && (
              <button
                type="button"
                onClick={() => setExchange(exchange === 'NSE' ? 'BSE' : 'NSE')}
                aria-label={`Switch to ${exchange === 'NSE' ? 'BSE' : 'NSE'}`}
                title={`Switch to ${exchange === 'NSE' ? 'BSE' : 'NSE'}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-ink"
              >
                <ChevronsUpDown size={14} />
              </button>
            )}
          </div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink-2 sm:text-[24px]">{name}</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {price === null ? (
              <Skeleton className="h-9 w-40 rounded-lg" />
            ) : (
              <span className="text-[30px] font-semibold tracking-tight text-ink-2 font-numeric sm:text-[32px]">{fmtPrice(price, market)}</span>
            )}
            {change !== null && changePct !== null && (
              <span className="text-[15px] font-medium font-numeric" style={{ color: up ? STOCK_UP : STOCK_DOWN }}>
                {up ? '+' : '-'}
                {fmtNum(Math.abs(change), market)} ({Math.abs(changePct).toFixed(2)}%)
                <span className="ml-1.5 text-muted">{RANGE_LABEL[range]}</span>
              </span>
            )}
          </div>

          {/* ---------------------------------------------------------- chart */}
          <div
            className={cn(
              terminal
                ? 'fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-surface px-4 pb-6 pt-4 sm:px-8'
                : 'mt-6'
            )}
          >
            {terminal && (
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[18px] font-semibold text-ink-2">{name}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[22px] font-semibold text-ink-2 font-numeric">{fmtPrice(price, market)}</span>
                    {change !== null && changePct !== null && (
                      <span className="text-[14px] font-medium font-numeric" style={{ color: up ? STOCK_UP : STOCK_DOWN }}>
                        {up ? '+' : '-'}{fmtNum(Math.abs(change), market)} ({Math.abs(changePct).toFixed(2)}%)
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => setTerminal(false)} aria-label="Close terminal" className={circleBtn}>
                  <X size={20} />
                </button>
              </div>
            )}

            <div className={cn('relative transition-opacity', historyState === 'loading' && history && 'opacity-50')}>
              {!terminal && phone && points.length > 1 && (
                <button type="button" onClick={() => setTerminal(true)} aria-label="Expand chart" className="keep-round absolute bottom-3 right-1 z-10 inline-flex h-11 w-11 items-center justify-center border border-line bg-surface text-ink-2 shadow-sm">
                  <Maximize2 size={18} />
                </button>
              )}
              {historyState === 'failed' && !history ? (
                <div className="flex flex-col items-center justify-center gap-3 text-sm text-muted" style={{ height: chartHeight }}>
                  <span>Couldn’t load the chart right now.</span>
                  <Button variant="secondary" size="sm" onClick={() => void loadHistory(false)}>Try again</Button>
                </div>
              ) : points.length > 1 ? (
                <StockChart points={points} baseline={baseline} range={range} market={market} timezone={timezone} mode={mode} height={chartHeight} />
              ) : (
                <Skeleton className="w-full rounded-xl" style={{ height: chartHeight }} />
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="no-scrollbar -mx-1 flex flex-1 items-center justify-between gap-1.5 overflow-x-auto px-1 sm:justify-center sm:gap-2 lg:gap-3">
                {RANGE_KEYS.filter((k) => !(phone && k === '3Y')).map((k) => (
                  <Pill key={k} active={range === k} onClick={() => setRange(k)} className="min-w-0 flex-1 px-0 sm:min-w-[52px] sm:flex-none sm:px-4">
                    {RANGE_LABEL[k]}
                  </Pill>
                ))}
                <button
                  type="button"
                  onClick={() => setMode((m) => (m === 'line' ? 'candle' : 'line'))}
                  aria-label={mode === 'line' ? 'Show candles' : 'Show line'}
                  aria-pressed={mode === 'candle'}
                  title={mode === 'line' ? 'Show candles' : 'Show line'}
                  className={cn(
                    'keep-round inline-flex h-9 w-9 shrink-0 sm:h-10 sm:w-12 items-center justify-center border transition-colors',
                    mode === 'candle' ? 'border-slate-400 bg-slate-100 dark:border-slate-500 dark:bg-slate-800' : 'border-line bg-surface hover:bg-surface-hover'
                  )}
                >
                  <CandlesIcon />
                </button>
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------- details */}
          <div className="mt-10 space-y-12 sm:mt-12 sm:space-y-14">
            {detailState === 'loading' && !detail ? (
              <DetailSkeleton />
            ) : detail ? (
              <>
                <PerformanceSection detail={detail} price={price} market={market} />
                <FundamentalsSection detail={detail} market={market} />
                {(detail.financials.quarterly.length > 0 || detail.financials.yearly.length > 0) && <FinancialSection key={`${bare}-${exchange}`} detail={detail} market={market} />}
                {market === 'IN' && detail.shareholding.length > 0 && <ShareholdingSection key={`${bare}-${exchange}-h`} quarters={detail.shareholding} />}
                <AboutSection detail={detail} symbol={bare.toUpperCase()} />
              </>
            ) : (
              <div className="rounded-2xl border border-line p-6 text-sm text-muted">
                <p className="font-semibold text-ink">Couldn’t load the company details</p>
                <p className="mt-1">Performance, fundamentals and financials come from a separate source that didn’t answer.</p>
                <Button className="mt-4" variant="secondary" size="sm" onClick={() => void loadDetail(false)}>Try again</Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-12" role="status" aria-label="Loading company details">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="grid grid-cols-3 gap-4 pt-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AlertPopover({
  market,
  price,
  current,
  onSave,
  onClear,
  onClose,
}: {
  market: Market;
  price: number | null;
  current: StockPriceAlert | null;
  onSave: (target: number) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(current ? String(current.target) : '');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const target = parseFloat(value);
  const valid = Number.isFinite(target) && target > 0 && target !== price;
  return (
    <div ref={ref} className="absolute right-0 top-full z-20 mt-2 w-[280px] rounded-2xl border border-line bg-surface p-4 shadow-xl">
      <p className="text-sm font-semibold text-ink">Price alert</p>
      <p className="mt-0.5 text-[13px] text-muted">
        {price !== null ? `Now ${fmtPrice(price, market)}. ` : ''}Tell me when it reaches:
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-sm text-muted">{market === 'US' ? '$' : '₹'}</span>
        <input
          autoFocus
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^0-9.]/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && valid && onSave(target)}
          placeholder="Target price"
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-base text-ink font-numeric"
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" className="flex-1" disabled={!valid} onClick={() => onSave(target)}>
          {current ? 'Update' : 'Set alert'}
        </Button>
        {current && (
          <Button size="sm" variant="secondary" onClick={onClear}>
            Remove
          </Button>
        )}
      </div>
      <p className="mt-2.5 text-[12px] text-muted">Fires once, while Aurafin is open on this page.</p>
    </div>
  );
}

