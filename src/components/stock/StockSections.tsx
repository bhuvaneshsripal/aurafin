import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '../ui';
import InfoTip from '../ui/InfoTip';
import { STOCK_DOWN, STOCK_UP } from './StockChart';
import {
  financialUnit,
  fmtCompact,
  fmtInt,
  fmtNum,
  fmtSigned,
  quarterLabel,
  type FinancialPeriod,
  type GrowthFigures,
  type HoldingQuarter,
  type Market,
  type StockDetail,
} from '../../utils/stockDetail';

// Colours taken from the reference design.
const TRACK = '#eceef3';
const TRACK_DONE = '#e1e4eb';
const MARKER = '#7c7e8c';
const REV_LIGHT = '#c9cdd9';
const REV_DARK = '#8794a8';
const PROFIT_LIGHT = '#92e0cc';

export function SectionTitle({ children, info, action }: { children: ReactNode; info?: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 sm:mb-5">
      <h2 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-ink-2 sm:text-[22px]">
        {children}
        {info && <InfoTip size={16}>{info}</InfoTip>}
      </h2>
      {action}
    </div>
  );
}

/** Round, bordered pill — the range tabs, Quarterly/Yearly and the quarter chips. */
export function Pill({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'keep-round inline-flex h-9 shrink-0 items-center justify-center rounded-full border px-3.5 text-[13px] sm:h-10 sm:px-4 sm:text-[14px] font-medium transition-colors',
        active
          ? 'border-slate-400 bg-slate-100 text-ink dark:border-slate-500 dark:bg-slate-800'
          : 'border-line bg-surface text-ink-2 hover:bg-surface-hover',
        className
      )}
    >
      {children}
    </button>
  );
}

const TextLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="inline-flex shrink-0 items-center gap-0.5 text-[15px] font-semibold text-ink-2 hover:text-ink">
    {children}
    <ChevronRight size={16} />
  </button>
);

const colourFor = (n: number | null) => (n === null ? undefined : n >= 0 ? STOCK_UP : STOCK_DOWN);

// ------------------------------------------------------------------ Performance

function RangeBar({ lowLabel, highLabel, low, high, value, market }: { lowLabel: string; highLabel: string; low: number | null; high: number | null; value: number | null; market: Market }) {
  const ok = low !== null && high !== null && high > low && value !== null;
  const pct = ok ? Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)) : 0;
  return (
    <div className="mb-6 sm:mb-7">
      <div className="mb-2.5 flex items-start justify-between text-[14px]">
        <div>
          <div className="text-muted">{lowLabel}</div>
          <div className="mt-0.5 text-[15px] font-medium text-ink-2 font-numeric">{fmtNum(low, market)}</div>
        </div>
        <div className="text-right">
          <div className="text-muted">{highLabel}</div>
          <div className="mt-0.5 text-[15px] font-medium text-ink-2 font-numeric">{fmtNum(high, market)}</div>
        </div>
      </div>
      <div className="relative h-1.5 rounded-full" style={{ background: TRACK }}>
        {ok && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: TRACK_DONE }} />}
        {ok && (
          <span
            aria-hidden
            className="absolute top-full mt-1 block -translate-x-1/2"
            style={{ left: `${pct}%`, width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `9px solid ${MARKER}` }}
          />
        )}
      </div>
    </div>
  );
}

export function PerformanceSection({ detail, price, market }: { detail: StockDetail; price: number | null; market: Market }) {
  const p = detail.performance;
  const cell = (label: string, value: string) => (
    <div key={label}>
      <div className="text-[14px] text-muted">{label}</div>
      <div className="mt-1 text-[15px] font-medium text-ink-2 font-numeric">{value}</div>
    </div>
  );
  const circuits = market === 'IN' && (p.lowerCircuit !== null || p.upperCircuit !== null);
  return (
    <section>
      <SectionTitle info="Today's and the 52-week price range, with the ▲ showing where the price is now, plus today's trading figures.">Performance</SectionTitle>
      <RangeBar lowLabel="Today’s Low" highLabel="Today’s High" low={p.dayLow} high={p.dayHigh} value={price} market={market} />
      <RangeBar lowLabel="52 Week Low" highLabel="52 Week High" low={p.weekLow52} high={p.weekHigh52} value={price} market={market} />
      <div className={cn('mt-8 grid grid-cols-3 gap-x-3 gap-y-6 sm:mt-9 sm:gap-x-4', circuits ? 'lg:grid-cols-5' : 'lg:grid-cols-3')}>
        {cell('Open', fmtNum(p.open, market))}
        {cell('Prev. Close', fmtNum(p.previousClose, market))}
        {cell('Volume', fmtInt(p.volume, market))}
        {circuits && cell('Lower circuit', fmtNum(p.lowerCircuit, market))}
        {circuits && cell('Upper circuit', fmtNum(p.upperCircuit, market))}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Fundamentals

export function FundamentalsSection({ detail, market }: { detail: StockDetail; market: Market }) {
  const f = detail.fundamentals;
  const left: [string, string][] = [
    ['Mkt Cap', fmtCompact(f.marketCap, market)],
    ['P/E Ratio(TTM)', fmtNum(f.pe, market)],
    ['P/B Ratio', fmtNum(f.pb, market)],
    ['Industry P/E', fmtNum(f.industryPe, market)],
    ['Debt to Equity', fmtNum(f.debtToEquity, market)],
  ];
  const right: [string, string][] = [
    ['ROE', f.roe === null ? '—' : `${fmtNum(f.roe, market)}%`],
    ['EPS(TTM)', fmtNum(f.eps, market)],
    ['Div Yield', f.dividendYield === null ? '—' : `${fmtNum(f.dividendYield, market)}%`],
    ['Book Value', fmtNum(f.bookValue, market)],
    ['Face Value', fmtNum(f.faceValue, market, f.faceValue !== null && Number.isInteger(f.faceValue) ? 0 : 2)],
  ];
  const col = (rows: [string, string][]) => (
    <div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-2 py-3 text-[14px] sm:gap-4 sm:py-3.5 sm:text-[15px]">
          <span className="text-muted">{k}</span>
          <span className="font-medium text-ink-2 font-numeric">{v}</span>
        </div>
      ))}
    </div>
  );
  return (
    <section>
      <SectionTitle info="Key ratios for the company. Industry P/E is the average for its sector; a dash means the data source has no figure.">Fundamentals</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 sm:gap-0">
        <div className="sm:border-r sm:border-line sm:pr-8">{col(left)}</div>
        <div className="sm:pl-8">{col(right)}</div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ Financial performance

const niceStep = (rough: number) => {
  const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * pow >= rough) return m * pow;
  return 10 * pow;
};
const tickLabel = (v: number) => {
  if (v >= 1000) return `${+(v / 1000).toFixed(1)}k`;
  return `${+v.toFixed(1)}`;
};

function FinancialChart({ rows, unit, showRevenue, showProfit, selected, onSelect }: { rows: FinancialPeriod[]; unit: number; showRevenue: boolean; showProfit: boolean; selected: number; onSelect: (i: number) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(240, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const H = 210;
  const TOP = 8;
  const BOTTOM = 34;
  const vals = rows.flatMap((r) => [showRevenue ? r.revenue : null, showProfit ? r.profit : null]).filter((v): v is number => v !== null).map((v) => v / unit);
  const maxV = Math.max(1, ...vals);
  const step = niceStep(maxV / 4);
  const top = step * 4;
  const plotH = H - TOP - BOTTOM;
  const y = (v: number) => TOP + (1 - v / top) * plotH;
  const AXIS = 40;
  const gw = (W - AXIS) / Math.max(1, rows.length);
  const bw = Math.min(35, gw * 0.2);
  return (
    <div ref={wrapRef} className="w-full">
    <svg width={W} height={H} className="block" role="img" aria-label="Revenue and profit by period">
      {[0, 1, 2, 3, 4].map((i) => {
        const v = step * i;
        return (
          <g key={i}>
            <line x1={0} x2={W - AXIS} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeWidth={1} strokeDasharray={i === 0 ? '2 3' : '4 4'} />
            <text x={W - AXIS + 10} y={y(v) + 4} fontSize={12} fill="var(--color-muted)">{i === 0 ? '0' : tickLabel(v)}</text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const cx = gw * i + gw / 2;
        const active = i === selected;
        const bars: { v: number | null; fill: string; dx: number }[] = [];
        const n = (showRevenue ? 1 : 0) + (showProfit ? 1 : 0);
        const startX = cx - (n * bw + (n - 1) * 7) / 2;
        let k = 0;
        if (showRevenue) bars.push({ v: r.revenue, fill: active ? REV_DARK : REV_LIGHT, dx: startX + k++ * (bw + 7) });
        if (showProfit) bars.push({ v: r.profit, fill: active ? STOCK_UP : PROFIT_LIGHT, dx: startX + k++ * (bw + 7) });
        return (
          <g key={r.date} onClick={() => onSelect(i)} className="cursor-pointer">
            <rect x={gw * i} y={0} width={gw} height={H} fill="transparent" />
            {bars.map((b, j) =>
              b.v !== null && b.v > 0 ? (
                <rect key={j} x={b.dx} y={y(b.v / unit)} width={bw} height={Math.max(1, y(0) - y(b.v / unit))} rx={2} fill={b.fill} />
              ) : null
            )}
            <text x={cx} y={H - 10} fontSize={13} textAnchor="middle" fill="var(--color-muted)" fontWeight={active ? 600 : 400}>{quarterLabel(r.date)}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

function SeriesToggle({ label, color, on, onClick }: { label: string; color: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className="flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-muted">
      <span className="flex h-4 w-4 items-center justify-center rounded-[4px] border" style={{ background: on ? color : 'transparent', borderColor: color }}>
        {on && <Check size={12} strokeWidth={3} className="text-white" />}
      </span>
      {label}
    </button>
  );
}

function GrowthTable({ revenue, profit }: { revenue: GrowthFigures; profit: GrowthFigures }) {
  const rows = (g: GrowthFigures) => [
    [g.basis === 'annual' ? '1Y' : '1Y (TTM)', g.ttm],
    ['3Y CAGR', g.cagr3],
  ] as const;
  const col = (title: string, g: GrowthFigures) => (
    <div>
      <div className="flex items-center justify-between pb-3 text-[12px] font-medium tracking-[0.08em] text-muted">
        <span>{title}</span>
        <span>VALUE</span>
      </div>
      {rows(g).map(([k, v]) => (
        <div key={k} className="flex items-center justify-between py-2.5 text-[15px]">
          <span className="text-ink-2">{k}</span>
          <span className="font-medium font-numeric" style={{ color: colourFor(v) }}>{v === null ? '—' : fmtSigned(v, 0)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-0">
      <div className="sm:border-r sm:border-line sm:pr-8">{col('REVENUE GROWTH', revenue)}</div>
      <div className="sm:pl-8">{col('PROFIT GROWTH', profit)}</div>
    </div>
  );
}

export function FinancialSection({ detail, market }: { detail: StockDetail; market: Market }) {
  const [view, setView] = useState<'quarterly' | 'yearly'>('quarterly');
  const [showAll, setShowAll] = useState(false);
  const [showRevenue, setShowRevenue] = useState(true);
  const [showProfit, setShowProfit] = useState(true);
  const rows = detail.financials[view];
  const [picked, setPicked] = useState<{ view: string; i: number } | null>(null);
  const selected = picked && picked.view === view && picked.i < rows.length ? picked.i : rows.length - 1;
  const unit = financialUnit(market);
  const cur = rows[selected];
  const g = detail.financials.growth;

  const money = (v: number | null) => (v === null ? '—' : fmtCompact(v, market));
  const hasAny = rows.length > 0;

  return (
    <section>
      <SectionTitle>Financial performance</SectionTitle>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Pill active={view === 'quarterly'} onClick={() => setView('quarterly')}>Quarterly</Pill>
          <Pill active={view === 'yearly'} onClick={() => setView('yearly')}>Yearly</Pill>
        </div>
        <TextLink onClick={() => setShowAll((s) => !s)}>All Financials</TextLink>
      </div>

      {!hasAny ? (
        <p className="rounded-2xl border border-line p-6 text-sm text-muted">The data source has no {view} results for this company.</p>
      ) : (
        <div className="sm:rounded-[20px] sm:border sm:border-line sm:p-6">
          <div className="text-[12px] font-medium uppercase tracking-[0.1em] text-muted">{quarterLabel(cur.date)}</div>
          <div className="mt-3 flex flex-wrap gap-x-12 gap-y-4">
            <div>
              <SeriesToggle label="REVENUE" color={REV_DARK} on={showRevenue} onClick={() => setShowRevenue((s) => !s)} />
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-[20px] font-semibold text-ink-2 font-numeric">{money(cur.revenue)}</span>
                {cur.revenueYoy !== null && <span className="text-[14px] font-medium font-numeric" style={{ color: colourFor(cur.revenueYoy) }}>{fmtSigned(cur.revenueYoy)}</span>}
              </div>
            </div>
            <div>
              <SeriesToggle label="PROFIT" color={STOCK_UP} on={showProfit} onClick={() => setShowProfit((s) => !s)} />
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-[20px] font-semibold text-ink-2 font-numeric">{money(cur.profit)}</span>
                {cur.profitYoy !== null && <span className="text-[14px] font-medium font-numeric" style={{ color: colourFor(cur.profitYoy) }}>{fmtSigned(cur.profitYoy)}</span>}
              </div>
            </div>
          </div>
          <div className="mt-5">
            <FinancialChart rows={rows} unit={unit} showRevenue={showRevenue} showProfit={showProfit} selected={selected} onSelect={(i) => setPicked({ view, i })} />
          </div>
        </div>
      )}

      {showAll && hasAny && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[420px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] tracking-[0.08em] text-muted">
                <th className="px-4 py-3 font-medium">PERIOD</th>
                <th className="px-4 py-3 text-right font-medium">REVENUE</th>
                <th className="px-4 py-3 text-right font-medium">PROFIT</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.date} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-ink-2">{quarterLabel(r.date)}</td>
                  <td className="px-4 py-3 text-right text-ink-2 font-numeric">{money(r.revenue)}</td>
                  <td className="px-4 py-3 text-right text-ink-2 font-numeric">{money(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GrowthTable revenue={g.revenue.quarterly} profit={g.profit.quarterly} />
    </section>
  );
}

// ------------------------------------------------------------------ Shareholding

const HOLD_ROWS: { key: keyof Pick<HoldingQuarter, 'promoters' | 'public' | 'dii' | 'fii'>; label: string; color: string }[] = [
  { key: 'promoters', label: 'Promoters', color: '#7c74d0' },
  { key: 'public', label: 'Public', color: '#f0a21f' },
  { key: 'dii', label: 'DIIs', color: '#a5b85b' },
  { key: 'fii', label: 'FIIs', color: '#4aa8dc' },
];

export function ShareholdingSection({ quarters }: { quarters: HoldingQuarter[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const active = quarters.find((q) => q.date === pick) ?? quarters[quarters.length - 1];
  const shown = useMemo(() => HOLD_ROWS.filter((r) => quarters.some((q) => q[r.key] !== null)), [quarters]);
  if (!active) return null;
  return (
    <section>
      <SectionTitle>Shareholding pattern</SectionTitle>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-1 flex min-w-0 gap-2 overflow-x-auto px-1">
          {quarters.map((q) => (
            <Pill key={q.date} active={q.date === active.date} onClick={() => setPick(q.date)}>{quarterLabel(q.date)}</Pill>
          ))}
        </div>
        <div className="self-start sm:self-end"><TextLink onClick={() => setDetails((s) => !s)}>Shareholder details</TextLink></div>
      </div>
      <div className="sm:rounded-[20px] sm:border sm:border-line sm:p-6">
        <div className="space-y-6">
          {shown.map((r) => {
            const v = active[r.key];
            return (
              <div key={r.key} className="flex items-center gap-4 text-[15px] sm:gap-5">
                <span className="w-[88px] shrink-0 text-ink-2 sm:w-28">{r.label}</span>
                <div className="h-2 flex-1 rounded-full" style={{ background: TRACK }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, v ?? 0))}%`, background: r.color }} />
                </div>
                <span className="w-16 shrink-0 text-right font-medium text-ink-2 font-numeric">{v === null ? '—' : `${v.toFixed(2)}%`}</span>
              </div>
            );
          })}
        </div>
      </div>
      {details && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[420px] text-[14px]">
            <thead>
              <tr className="text-left text-[12px] tracking-[0.08em] text-muted">
                <th className="px-4 py-3 font-medium">QUARTER</th>
                {shown.map((r) => (
                  <th key={r.key} className="px-4 py-3 text-right font-medium">{r.label.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...quarters].reverse().map((q) => (
                <tr key={q.date} className="border-t border-line-soft">
                  <td className="px-4 py-3 text-ink-2">{quarterLabel(q.date)}</td>
                  {shown.map((r) => (
                    <td key={r.key} className="px-4 py-3 text-right text-ink-2 font-numeric">{q[r.key] === null ? '—' : `${q[r.key]!.toFixed(2)}%`}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ About

const CLAMP = 190;

export function AboutSection({ detail, symbol }: { detail: StockDetail; symbol: string }) {
  const [open, setOpen] = useState(false);
  const a = detail.about;
  const text = a.description?.trim() ?? '';
  const cut = useMemo(() => {
    if (text.length <= CLAMP) return text;
    const slice = text.slice(0, CLAMP);
    return slice.slice(0, Math.max(slice.lastIndexOf(' '), 60));
  }, [text]);
  const long = text.length > CLAMP;
  const exch = detail.exchange === 'BSE' ? 'BSE' : detail.exchange === 'US' ? 'Ticker' : 'NSE';
  const meta: [string, ReactNode][] = [
    ['CEO/MD', a.ceo ?? '—'],
    ['Founded in', a.founded ? String(a.founded) : '—'],
    [`${exch} symbol`, symbol],
    ['Industry', a.industry ? <span className="border-b border-dashed border-ink-2/60">{a.industry}</span> : '—'],
  ];
  return (
    <section>
      <SectionTitle>About</SectionTitle>
      {text && (
        <p className="text-[15px] leading-7 text-muted">
          {open || !long ? text : `${cut}`}
          {long && (
            <>
              {!open && <span>… </span>}
              <button type="button" onClick={() => setOpen((s) => !s)} className="font-semibold" style={{ color: STOCK_UP }}>
                {open ? ' Show less' : 'Read more'}
              </button>
            </>
          )}
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
        {meta.map(([k, v]) => (
          <div key={k}>
            <div className="text-[14px] text-muted">{k}</div>
            <div className="mt-1 text-[15px] font-semibold text-ink-2">{v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

