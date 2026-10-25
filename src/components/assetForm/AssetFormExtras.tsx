import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ClipboardPaste, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import InfoTip, { InfoNote } from '../ui/InfoTip';
import { DateInput, inputClasses } from '../ui';
import CustomSelect from '../CustomSelect';
import { useAssetsStore } from '../../store/assetsStore';
import { formatPreciseCurrency } from '../../utils/privateFormat';
import type { Asset, AssetClass, EsopDetails, FundDetails } from '../../types';

/* -------------------------------------------------------------------------- */
/* Small shared bits                                                           */
/* -------------------------------------------------------------------------- */

function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium text-slate-500 mb-1 flex items-end gap-1.5 min-h-[2.25rem] leading-snug">
        {label}
        {hint && <InfoTip>{hint}</InfoTip>}
      </span>
      {children}
    </label>
  );
}

function Collapsible({ title, subtitle, children, defaultOpen = false }: { title: string; subtitle?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-line-soft bg-slate-50/60 rounded-xl">
      <div className="w-full flex items-center justify-between gap-3 px-4 py-3 cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="text-left text-sm font-medium text-ink-2"
            aria-expanded={open}
          >
            {title}
          </button>
          {subtitle && <InfoTip>{subtitle}</InfoTip>}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

/** Adds whole months to an ISO date (yyyy-mm-dd), clamping to the last day of the month. */
function addMonths(iso: string, months: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d, lastDay));
  return target;
}

function monthsBetween(fromIso: string, to: Date): number {
  const [y, m, d] = fromIso.split('-').map(Number);
  let months = (to.getFullYear() - y) * 12 + (to.getMonth() - (m - 1));
  if (to.getDate() < d) months -= 1;
  return months;
}

const isoOk = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/* -------------------------------------------------------------------------- */
/* 1. Live preview                                                             */
/* -------------------------------------------------------------------------- */

export function LivePreview({
  currency,
  value,
  invested,
  quantity,
  earliestDate,
  targetPrice,
  stopLossPrice,
  showReturns = true,
}: {
  currency: string;
  value: number;
  invested: number;
  quantity?: number;
  /** Earliest purchase / start date (ISO) — drives the annualised return. */
  earliestDate?: string;
  targetPrice?: number;
  stopLossPrice?: number;
  showReturns?: boolean;
}) {
  if (!showReturns || (!value && !invested)) return null;

  const hasCost = invested > 0;
  const pnl = value - invested;
  const pnlPct = hasCost ? (pnl / invested) * 100 : null;

  let cagr: number | null = null;
  if (hasCost && value > 0 && isoOk(earliestDate)) {
    const days = (Date.now() - new Date(earliestDate as string).getTime()) / 86_400_000;
    // Under 90 days an annualised figure is mostly noise, so don't show one.
    if (days >= 90) cagr = (Math.pow(value / invested, 365 / days) - 1) * 100;
  }

  const unitPrice = quantity && quantity > 0 ? value / quantity : null;
  const up = pnl >= 0;
  const tone = !hasCost ? 'text-ink' : up ? 'text-emerald-600' : 'text-red-500';
  const dist = (level?: number) =>
    level && unitPrice ? ((level - unitPrice) / unitPrice) * 100 : null;
  const toTarget = dist(targetPrice);
  const toStop = dist(stopLossPrice);

  const tile = (label: string, content: ReactNode, sub?: ReactNode) => (
    <div className="rounded-lg bg-surface border border-line-soft px-3 py-2.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="font-numeric text-sm font-semibold mt-0.5 truncate">{content}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5 truncate">{sub}</p>}
    </div>
  );

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-2">Live preview</p>
        <span className="text-[11px] text-slate-500">Updates as you type</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tile('Invested', hasCost ? formatPreciseCurrency(invested, currency) : '—')}
        {tile('Current value', value ? formatPreciseCurrency(value, currency) : '—', unitPrice ? `${formatPreciseCurrency(unitPrice, currency)} / unit` : undefined)}
        {tile(
          'Profit / loss',
          <span className={`inline-flex items-center gap-1 ${tone}`}>
            {hasCost && (up ? <TrendingUp size={13} /> : <TrendingDown size={13} />)}
            {hasCost ? `${up ? '+' : '−'}${formatPreciseCurrency(Math.abs(pnl), currency)}` : '—'}
          </span>,
          pnlPct !== null ? <span className={tone}>{`${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`}</span> : 'Add an invested amount'
        )}
        {tile(
          'Annualised',
          cagr !== null ? <span className={cagr >= 0 ? 'text-emerald-600' : 'text-red-500'}>{`${cagr >= 0 ? '+' : ''}${cagr.toFixed(1)}% / yr`}</span> : '—',
          cagr !== null ? 'Since first purchase (CAGR)' : 'Needs 90+ days of history'
        )}
      </div>
      {(toTarget !== null || toStop !== null) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
          {toTarget !== null && (
            <span>
              Target {formatPreciseCurrency(targetPrice as number, currency)}:{' '}
              <span className="font-semibold">{`${toTarget >= 0 ? '+' : ''}${toTarget.toFixed(1)}%`}</span> from here
            </span>
          )}
          {toStop !== null && (
            <span>
              Stop-loss {formatPreciseCurrency(stopLossPrice as number, currency)}:{' '}
              <span className="font-semibold">{`${toStop >= 0 ? '+' : ''}${toStop.toFixed(1)}%`}</span> from here
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Fund details (mutual / index / hybrid funds)                             */
/* -------------------------------------------------------------------------- */

export const FUND_DETAIL_CLASSES = new Set<AssetClass>(['equity_mutual_fund', 'index_fund', 'hybrid_mutual_fund', 'sip', 'debt_mutual_fund', 'etf']);

export function FundDetailsSection({ value, onChange }: { value: FundDetails; onChange: (next: FundDetails) => void }) {
  const set = (patch: Partial<FundDetails>) => onChange({ ...value, ...patch });
  const er = value.expenseRatio;
  return (
    <Collapsible title="Fund details" subtitle="Folio, plan, expense ratio, exit load — all optional">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Folio number">
          <input value={value.folio ?? ''} onChange={(e) => set({ folio: e.target.value })} className={inputClasses} placeholder="e.g. 1234567/89" />
        </Field>
        <Field label="Benchmark">
          <input value={value.benchmark ?? ''} onChange={(e) => set({ benchmark: e.target.value })} className={inputClasses} placeholder="e.g. Nifty 50 TRI" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plan">
          <CustomSelect
            value={value.plan ?? ''}
            onChange={(v) => set({ plan: (v || undefined) as FundDetails['plan'] })}
            className={inputClasses}
            placeholder="—"
            options={[
              { value: '', label: '—' },
              { value: 'direct', label: 'Direct' },
              { value: 'regular', label: 'Regular' },
            ]}
          />
        </Field>
        <Field label="Option">
          <CustomSelect
            value={value.option ?? ''}
            onChange={(v) => set({ option: (v || undefined) as FundDetails['option'] })}
            className={inputClasses}
            placeholder="—"
            options={[
              { value: '', label: '—' },
              { value: 'growth', label: 'Growth' },
              { value: 'idcw', label: 'IDCW (dividend)' },
            ]}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expense ratio (%)" hint={er !== undefined && er > 2.25 ? 'On the high side for an equity fund — compare with the direct plan.' : undefined}>
          <input type="number" step="any" min={0} value={er ?? ''} onChange={(e) => set({ expenseRatio: num(e.target.value) })} className={inputClasses} placeholder="e.g. 0.45" />
        </Field>
        <Field label="Lock-in ends (ELSS)">
          <DateInput value={value.lockInEnd ?? ''} onChange={(v) => set({ lockInEnd: v || undefined })} className={inputClasses} />
        </Field>
      </div>
      <Field label="Exit load">
        <input value={value.exitLoad ?? ''} onChange={(e) => set({ exitLoad: e.target.value })} className={inputClasses} placeholder="e.g. 1% if redeemed within 1 year" />
      </Field>
    </Collapsible>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. ESOP / RSU vesting                                                       */
/* -------------------------------------------------------------------------- */

export interface VestingSummary {
  vestedUnits: number;
  unvestedUnits: number;
  vestedPct: number;
  nextVestDate: Date | null;
  /** Value of the vested portion: (FMV − strike) × vested units, floored at 0. */
  vestedValue: number | null;
}

export function computeVesting(e: EsopDetails, today = new Date()): VestingSummary | null {
  const total = e.totalUnits ?? 0;
  const period = e.vestingMonths ?? 0;
  if (!total || total <= 0 || !period || period <= 0 || !isoOk(e.vestingStart)) return null;
  const cliff = Math.min(e.cliffMonths ?? 0, period);
  const elapsed = monthsBetween(e.vestingStart as string, today);
  let fraction = 0;
  if (elapsed >= cliff && elapsed > 0) fraction = Math.min(1, elapsed / period);
  const vestedUnits = Math.floor(total * fraction * 10000) / 10000;
  const nextVestDate =
    elapsed >= period ? null : addMonths(e.vestingStart as string, Math.max(elapsed < cliff ? cliff : elapsed + 1, 1));
  const per = e.fmv !== undefined ? Math.max(0, e.fmv - (e.kind === 'option' ? e.strikePrice ?? 0 : 0)) : null;
  return {
    vestedUnits,
    unvestedUnits: Math.max(0, total - vestedUnits),
    vestedPct: fraction * 100,
    nextVestDate,
    vestedValue: per !== null ? per * vestedUnits : null,
  };
}

export function EsopSection({
  value,
  onChange,
  currency,
  onApplyValue,
}: {
  value: EsopDetails;
  onChange: (next: EsopDetails) => void;
  currency: string;
  onApplyValue: (amount: number, units: number) => void;
}) {
  const set = (patch: Partial<EsopDetails>) => onChange({ ...value, ...patch });
  const vest = useMemo(() => computeVesting(value), [value]);
  const kind = value.kind ?? 'rsu';
  const expired = isoOk(value.expiryDate) && new Date(value.expiryDate as string).getTime() < Date.now();

  return (
    <div className="space-y-4 border border-line-soft bg-slate-50/60 rounded-xl p-4">
      <p className="text-sm font-medium text-ink-2 flex items-center gap-1.5">
        Grant &amp; vesting
        <InfoTip>Enter your grant once — vested units and value are worked out for you.</InfoTip>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Employer / company">
          <input value={value.employer ?? ''} onChange={(e) => set({ employer: e.target.value })} className={inputClasses} placeholder="e.g. Acme Technologies" />
        </Field>
        <Field label="Grant type">
          <CustomSelect
            value={kind}
            onChange={(v) => set({ kind: v as 'rsu' | 'option' })}
            className={inputClasses}
            options={[
              { value: 'rsu', label: 'RSU (free shares)' },
              { value: 'option', label: 'Stock options (strike price)' },
            ]}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Total units granted">
          <input type="number" step="any" min={0} value={value.totalUnits ?? ''} onChange={(e) => set({ totalUnits: num(e.target.value) })} className={inputClasses} placeholder="e.g. 4800" />
        </Field>
        <Field label={kind === 'option' ? `Strike price (${currency})` : `Current FMV per unit (${currency})`}>
          {kind === 'option' ? (
            <input type="number" step="any" min={0} value={value.strikePrice ?? ''} onChange={(e) => set({ strikePrice: num(e.target.value) })} className={inputClasses} placeholder="e.g. 120" />
          ) : (
            <input type="number" step="any" min={0} value={value.fmv ?? ''} onChange={(e) => set({ fmv: num(e.target.value) })} className={inputClasses} placeholder="e.g. 850" />
          )}
        </Field>
      </div>
      {kind === 'option' && (
        <Field label={`Current FMV per unit (${currency})`}>
          <input type="number" step="any" min={0} value={value.fmv ?? ''} onChange={(e) => set({ fmv: num(e.target.value) })} className={inputClasses} placeholder="e.g. 850" />
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Grant date">
          <DateInput value={value.grantDate ?? ''} onChange={(v) => set({ grantDate: v || undefined })} className={inputClasses} />
        </Field>
        <Field label="Vesting starts">
          <DateInput value={value.vestingStart ?? ''} onChange={(v) => set({ vestingStart: v || undefined })} className={inputClasses} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vesting period (months)">
          <input type="number" min={1} step={1} value={value.vestingMonths ?? ''} onChange={(e) => set({ vestingMonths: num(e.target.value) })} className={inputClasses} placeholder="e.g. 48" />
        </Field>
        <Field label="Cliff (months)">
          <input type="number" min={0} step={1} value={value.cliffMonths ?? ''} onChange={(e) => set({ cliffMonths: num(e.target.value) })} className={inputClasses} placeholder="e.g. 12" />
        </Field>
      </div>
      {kind === 'option' && (
        <Field label="Options expire on">
          <DateInput value={value.expiryDate ?? ''} onChange={(v) => set({ expiryDate: v || undefined })} className={inputClasses} />
        </Field>
      )}
      {expired && (
        <p className="text-xs text-amber-600 flex items-start gap-1">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> This grant's expiry date has passed.
        </p>
      )}
      {vest && (
        <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>
              Vested <span className="font-semibold text-ink">{vest.vestedUnits.toLocaleString('en-IN')}</span> of{' '}
              {(value.totalUnits ?? 0).toLocaleString('en-IN')} units
            </span>
            <span className="font-semibold text-brand-700">{vest.vestedPct.toFixed(0)}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full bg-brand-600 rounded-full" style={{ width: `${Math.min(100, vest.vestedPct)}%` }} />
          </div>
          <p className="text-xs text-slate-500">
            {vest.nextVestDate
              ? `Next vest: ${vest.nextVestDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
              : 'Fully vested'}
            {' · '}Unvested {vest.unvestedUnits.toLocaleString('en-IN')} units
          </p>
          {vest.vestedValue !== null && (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs text-slate-600">
                Vested value{kind === 'option' ? ' (FMV − strike)' : ''}:{' '}
                <span className="font-semibold text-ink">{formatPreciseCurrency(vest.vestedValue, currency)}</span>
              </p>
              <button
                type="button"
                onClick={() => onApplyValue(vest.vestedValue as number, vest.vestedUnits)}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 underline"
              >
                Use as Current Value
              </button>
            </div>
          )}
          <InfoNote>Assumes equal monthly vesting after the cliff. Check your grant letter — actual schedules vary.</InfoNote>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Price levels                                                             */
/* -------------------------------------------------------------------------- */

export function PriceLevelsSection({
  currency,
  targetPrice,
  stopLossPrice,
  onChange,
}: {
  currency: string;
  targetPrice: string;
  stopLossPrice: string;
  onChange: (patch: { targetPrice?: string; stopLossPrice?: string }) => void;
}) {
  const t = Number(targetPrice);
  const s = Number(stopLossPrice);
  const inverted = t > 0 && s > 0 && s >= t;
  return (
    <Collapsible title="Price levels" subtitle="Your target and stop-loss per unit — compared with today's price in the preview">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Target price (${currency})`}>
          <input type="number" step="any" min={0} value={targetPrice} onChange={(e) => onChange({ targetPrice: e.target.value })} className={inputClasses} placeholder="e.g. 1500" />
        </Field>
        <Field label={`Stop-loss (${currency})`}>
          <input type="number" step="any" min={0} value={stopLossPrice} onChange={(e) => onChange({ stopLossPrice: e.target.value })} className={inputClasses} placeholder="e.g. 900" />
        </Field>
      </div>
      {inverted && (
        <p className="text-xs text-amber-600 flex items-start gap-1">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" /> Stop-loss is at or above the target — check the two numbers.
        </p>
      )}
      <InfoNote>Saved with the holding for reference. These don't send notifications.</InfoNote>
    </Collapsible>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Paste purchases                                                          */
/* -------------------------------------------------------------------------- */

export interface ParsedLot {
  date?: string;
  quantity: string;
  price: string;
}

function parseDate(token: string): string | undefined {
  const t = token.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t);
  let y: number, mo: number, d: number;
  if (m) {
    y = +m[1]; mo = +m[2]; d = +m[3];
  } else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(t);
    if (!m) return undefined;
    d = +m[1]; mo = +m[2]; y = +m[3];
    if (y < 100) y += 2000;
  }
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return undefined;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Accepts lines like `12-03-2024, 10, 215.5`, `2024-03-12 10 @ 215.5` or `10 @ 215.5`. */
export function parsePastedLots(text: string): { lots: ParsedLot[]; errors: string[] } {
  const lots: ParsedLot[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.replace(/[₹$]/g, '').replace(/[,@;|×]|\bx\b/gi, ' ').split(/\s+/).filter(Boolean);
    let date: string | undefined;
    if (parts.length && parseDate(parts[0])) date = parseDate(parts.shift() as string);
    const nums = parts.map((p) => Number(p));
    if (nums.length !== 2 || nums.some((n) => !Number.isFinite(n) || n <= 0)) {
      errors.push(`Line ${i + 1}: expected "date, quantity, price" — got "${line}"`);
      return;
    }
    lots.push({ date, quantity: String(nums[0]), price: String(nums[1]) });
  });
  return { lots, errors };
}

export function PastePurchases({ onAdd }: { onAdd: (lots: ParsedLot[]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { lots, errors } = useMemo(() => parsePastedLots(text), [text]);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
      >
        <ClipboardPaste size={16} /> Paste several purchases
      </button>
      {open && (
        <div className="mt-2 space-y-2 border border-line-soft bg-slate-50/60 rounded-xl p-3">
          <p className="text-xs text-slate-500">One purchase per line: <span className="font-mono">date, quantity, price</span>. Dates can be DD-MM-YYYY or YYYY-MM-DD, and the date can be left out.</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className={`${inputClasses} font-mono text-xs resize-y`}
            placeholder={'12-03-2024, 10, 215.50\n05-08-2024, 5, 232'}
          />
          {errors.length > 0 && (
            <ul className="text-xs text-red-500 space-y-0.5">
              {errors.slice(0, 4).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {errors.length > 4 && <li>…and {errors.length - 4} more</li>}
            </ul>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={lots.length === 0}
              onClick={() => {
                onAdd(lots);
                setText('');
                setOpen(false);
              }}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-sm font-medium rounded-lg bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={14} /> Add {lots.length || ''} purchase{lots.length === 1 ? '' : 's'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* 6. Duplicate check                                                          */
/* -------------------------------------------------------------------------- */

export function DuplicateWarning({
  currentId,
  assetClass,
  symbol,
  name,
}: {
  /** Id of the asset being edited, if any — it never counts as its own duplicate. */
  currentId?: string;
  assetClass: AssetClass;
  symbol: string;
  name: string;
}) {
  const assets = useAssetsStore((s) => s.assets);
  const sym = symbol.trim().toUpperCase();
  const nm = name.trim().toUpperCase();
  const match = useMemo<Asset | undefined>(() => {
    if (!sym && nm.length < 3) return undefined;
    return assets.find(
      (a) =>
        a.id !== currentId &&
        a.assetClass === assetClass &&
        ((sym && a.symbol?.toUpperCase() === sym) || (!sym && a.name.trim().toUpperCase() === nm))
    );
  }, [assets, currentId, assetClass, sym, nm]);

  if (!match) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>
        You already hold <span className="font-semibold">{match.name}</span>
        {match.quantity ? ` (${match.quantity} units)` : ''}. Saving this creates a second entry — to add more, buy more on the existing holding
        so the average cost stays correct.
      </span>
    </div>
  );
}
