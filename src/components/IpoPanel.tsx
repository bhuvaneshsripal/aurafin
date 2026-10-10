import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import DateInput from './ui/DateInput';
import CustomSelect from './CustomSelect';
import { inputClasses } from './ui/Input';
import type { IpoCategory, IpoDetails, IpoStage } from '../types';
import { computeIpo, IPO_CATEGORIES, IPO_STAGES } from '../utils/ipo';
import { formatPreciseCurrency, formatSignedCurrency } from '../utils/currency';

/** Every field is a string while editing; converted by formToIpo on save. */
export interface IpoForm {
  stage: IpoStage;
  board: 'mainboard' | 'sme';
  category: IpoCategory;
  priceBandLow: string;
  priceBandHigh: string;
  lotSize: string;
  lotsApplied: string;
  issuePrice: string;
  sharesAllotted: string;
  gmp: string;
  listingPrice: string;
  currentPrice: string;
  openDate: string;
  closeDate: string;
  allotmentDate: string;
  listingDate: string;
  lockInEnd: string;
}

export const emptyIpoForm: IpoForm = {
  stage: 'applied', board: 'mainboard', category: 'retail', priceBandLow: '', priceBandHigh: '', lotSize: '', lotsApplied: '1',
  issuePrice: '', sharesAllotted: '', gmp: '', listingPrice: '', currentPrice: '', openDate: '', closeDate: '', allotmentDate: '', listingDate: '', lockInEnd: '',
};

const s = (n: number | undefined) => (n === undefined ? '' : String(n));
export function ipoToForm(d?: IpoDetails, hasHoldings = false): IpoForm {
  if (!d) return { ...emptyIpoForm, stage: hasHoldings ? 'pre_ipo' : 'applied' };
  return {
    stage: d.stage, board: d.board ?? 'mainboard', category: d.category ?? 'retail',
    priceBandLow: s(d.priceBandLow), priceBandHigh: s(d.priceBandHigh), lotSize: s(d.lotSize), lotsApplied: s(d.lotsApplied),
    issuePrice: s(d.issuePrice), sharesAllotted: s(d.sharesAllotted), gmp: s(d.gmp), listingPrice: s(d.listingPrice), currentPrice: s(d.currentPrice),
    openDate: d.openDate ?? '', closeDate: d.closeDate ?? '', allotmentDate: d.allotmentDate ?? '', listingDate: d.listingDate ?? '', lockInEnd: d.lockInEnd ?? '',
  };
}

const num = (v: string): number | undefined => (v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
export function formToIpo(f: IpoForm): IpoDetails {
  return {
    stage: f.stage, board: f.board, category: f.category,
    priceBandLow: num(f.priceBandLow), priceBandHigh: num(f.priceBandHigh), lotSize: num(f.lotSize), lotsApplied: num(f.lotsApplied),
    issuePrice: num(f.issuePrice), sharesAllotted: num(f.sharesAllotted), gmp: num(f.gmp), listingPrice: num(f.listingPrice), currentPrice: num(f.currentPrice),
    openDate: f.openDate || undefined, closeDate: f.closeDate || undefined, allotmentDate: f.allotmentDate || undefined,
    listingDate: f.listingDate || undefined, lockInEnd: f.lockInEnd || undefined,
  };
}

function F({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="block">
      <span className="block text-sm font-medium text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </div>
  );
}

const input = `mt-1 ${inputClasses}`;

interface Props {
  form: IpoForm;
  setForm: (f: IpoForm) => void;
  symbol: string;
  setSymbol: (v: string) => void;
  currency: string;
}

export default function IpoPanel({ form, setForm, symbol, setSymbol, currency }: Props) {
  const set = <K extends keyof IpoForm>(k: K, v: IpoForm[K]) => setForm({ ...form, [k]: v });
  const c = computeIpo(formToIpo(form));
  const st = form.stage;
  const isPre = st === 'pre_ipo';
  const holds = st === 'allotted' || st === 'listed' || isPre;
  const money = (n: number) => formatPreciseCurrency(n, currency);
  const NumInput = ({ k, ph, step = 'any' }: { k: keyof IpoForm; ph?: string; step?: string }) => (
    <input type="number" step={step} min={0} inputMode="decimal" value={form[k] as string} onChange={(e) => set(k, e.target.value as never)} className={input} placeholder={ph} />
  );

  return (
    <div className="space-y-4 rounded-xl border border-line-soft bg-slate-50/60 p-4">
      <div>
        <p className="mb-2 text-sm font-medium text-slate-500">Stage</p>
        <div className="flex flex-wrap gap-1.5">
          {IPO_STAGES.map((x) => (
            <button key={x.key} type="button" title={x.hint} onClick={() => set('stage', x.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${st === x.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-surface text-slate-600 hover:bg-surface-hover'}`}>
              {x.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-slate-500">{IPO_STAGES.find((x) => x.key === st)?.hint}</p>
      </div>

      {!isPre && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <F label="Board">
              <CustomSelect
                value={form.board}
                onChange={(v) => set('board', v as IpoForm['board'])}
                className={input}
                options={[{ value: 'mainboard', label: 'Mainboard' }, { value: 'sme', label: 'SME' }]}
              />
            </F>
            <F label="Category">
              <CustomSelect
                value={form.category}
                onChange={(v) => set('category', v as IpoCategory)}
                className={input}
                options={IPO_CATEGORIES.map((x) => ({ value: x.value, label: x.label }))}
              />
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <F label="Band low"><NumInput k="priceBandLow" /></F>
            <F label="Band high (cut-off)"><NumInput k="priceBandHigh" /></F>
            <F label="Lot size (shares)"><NumInput k="lotSize" step="1" /></F>
            <F label="Lots applied"><NumInput k="lotsApplied" step="1" /></F>
          </div>
          {c.applicationAmount !== undefined && (
            <div className="rounded-lg bg-surface p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-600">Money blocked at cut-off ({c.appliedShares} shares)</span>
                <span className="font-semibold text-ink">{money(c.applicationAmount)}</span>
              </div>
              {c.overRetailLimit && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-negative">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  Retail bids can't exceed ₹2,00,000. {c.maxRetailLots ? `At most ${c.maxRetailLots} lot${c.maxRetailLots === 1 ? '' : 's'} fits, or switch to an HNI category.` : ''}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {(holds || st === 'applied') && (
        <div className="grid grid-cols-2 gap-3">
          {holds && <F label={isPre ? 'Shares held' : 'Shares allotted'}><NumInput k="sharesAllotted" step="1" /></F>}
          {(holds || st === 'applied') && <F label={isPre ? 'Buy price / share' : 'Issue price / share'} hint={st === 'applied' ? 'Fill once the final price is fixed' : undefined}><NumInput k="issuePrice" /></F>}
        </div>
      )}

      {(st === 'applied' || st === 'allotted' || st === 'listed') && (
        <F label="GMP per share (grey-market premium, your estimate)">
          <NumInput k="gmp" ph="e.g. 45" />
        </F>
      )}
      {c.gmpListingPrice !== undefined && st !== 'listed' && (
        <p className={`flex items-center gap-1.5 text-sm ${(c.gmpGainPct ?? 0) >= 0 ? 'text-positive' : 'text-negative'}`}>
          {(c.gmpGainPct ?? 0) >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
          GMP implies a listing near {money(c.gmpListingPrice)} ({(c.gmpGainPct ?? 0) >= 0 ? '+' : ''}{(c.gmpGainPct ?? 0).toFixed(1)}%)
          {c.gmpPerLot !== undefined && <span className="text-slate-500">· {formatSignedCurrency(c.gmpPerLot, currency)} per lot</span>}
        </p>
      )}

      {st === 'listed' && (
        <div className="grid grid-cols-2 gap-3">
          <F label="Listing price"><NumInput k="listingPrice" /></F>
          <F label="NSE/BSE symbol (live price)" hint="Optional. Switches value to the live price.">
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className={input} placeholder="e.g. SWIGGY" />
          </F>
        </div>
      )}
      {(isPre || st === 'allotted') && (
        <F label={isPre ? 'Latest price / share (last round or estimate)' : 'Latest price / share (optional)'}>
          <NumInput k="currentPrice" />
        </F>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {!isPre && <F label="Opens"><DateInput value={form.openDate} onChange={(v) => set('openDate', v)} className={input} /></F>}
        {!isPre && <F label="Closes"><DateInput value={form.closeDate} onChange={(v) => set('closeDate', v)} className={input} /></F>}
        {!isPre && <F label="Allotment"><DateInput value={form.allotmentDate} onChange={(v) => set('allotmentDate', v)} className={input} /></F>}
        {!isPre && <F label="Listing"><DateInput value={form.listingDate} onChange={(v) => set('listingDate', v)} className={input} /></F>}
        {(isPre || holds) && <F label="Lock-in ends"><DateInput value={form.lockInEnd} onChange={(v) => set('lockInEnd', v)} className={input} /></F>}
      </div>

      {(c.invested > 0 || c.blocked > 0 || (st === 'not_allotted' && c.refund)) && (
        <div className="space-y-1.5 rounded-lg bg-surface p-3 text-sm">
          {c.blocked > 0 && <Row l="Blocked in your bank (ASBA)" v={money(c.blocked)} />}
          {c.invested > 0 && <Row l="Invested" v={money(c.invested)} />}
          {c.invested > 0 && <Row l={`Current value${c.priceSource === 'issue' ? ' (at issue price)' : ''}`} v={money(c.currentValue)} />}
          {c.listingGain !== undefined && <Row l={`Listing gain${c.listingGainPct !== undefined ? ` (${c.listingGainPct >= 0 ? '+' : ''}${c.listingGainPct.toFixed(1)}%)` : ''}`} v={formatSignedCurrency(c.listingGain, currency)} tone={c.listingGain >= 0 ? 'pos' : 'neg'} />}
          {c.gain !== undefined && st !== 'allotted' && <Row l={`Gain now${c.gainPct !== undefined ? ` (${c.gainPct >= 0 ? '+' : ''}${c.gainPct.toFixed(1)}%)` : ''}`} v={formatSignedCurrency(c.gain, currency)} tone={c.gain >= 0 ? 'pos' : 'neg'} />}
          {c.refund !== undefined && c.refund > 0 && <Row l="Unblocked / refunded" v={money(c.refund)} />}
        </div>
      )}
      <p className="text-xs text-slate-500">
        Current Value and Invested are filled in for you from these details. A bid that is still pending counts as ₹0 (the money is still in your bank until allotment).
      </p>
    </div>
  );
}

function Row({ l, v, tone }: { l: string; v: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-600">{l}</span>
      <span className={`font-semibold ${tone === 'pos' ? 'text-positive' : tone === 'neg' ? 'text-negative' : 'text-ink'}`}>{v}</span>
    </div>
  );
}

const STAGE_LABEL: Record<IpoStage, string> = { applied: 'Applied', allotted: 'Allotted', listed: 'Listed', not_allotted: 'Not allotted', pre_ipo: 'Pre-IPO' };

/** Read-only IPO lifecycle summary, shown on the asset detail view. */
export function IpoSummary({ ipo, currency }: { ipo: IpoDetails; currency: string }) {
  const c = computeIpo(ipo);
  const money = (n: number) => formatPreciseCurrency(n, currency);
  const daysTo = (iso?: string) => {
    if (!iso) return undefined;
    const t = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
    return Math.ceil((t - Date.now()) / 86400000);
  };
  const lock = daysTo(ipo.lockInEnd);
  const next: { label: string; iso?: string }[] = [
    { label: 'Closes', iso: ipo.closeDate }, { label: 'Allotment', iso: ipo.allotmentDate }, { label: 'Listing', iso: ipo.listingDate },
  ];
  const upcoming = next.find((n) => n.iso && (daysTo(n.iso) ?? -1) >= 0);
  return (
    <div className="space-y-2 rounded-xl border border-line-soft bg-slate-50/60 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-ink">{STAGE_LABEL[ipo.stage]}{ipo.board === 'sme' ? ' · SME' : ''}</span>
        {upcoming && <span className="text-xs text-slate-500">{upcoming.label} in {daysTo(upcoming.iso)}d</span>}
      </div>
      {c.blocked > 0 && <Row l="Blocked (ASBA)" v={money(c.blocked)} />}
      {c.listingGain !== undefined && <Row l={`Listing gain${c.listingGainPct !== undefined ? ` (${c.listingGainPct >= 0 ? '+' : ''}${c.listingGainPct.toFixed(1)}%)` : ''}`} v={formatSignedCurrency(c.listingGain, currency)} tone={c.listingGain >= 0 ? 'pos' : 'neg'} />}
      {c.gmpListingPrice !== undefined && ipo.stage !== 'listed' && <Row l={`GMP-implied listing (${(c.gmpGainPct ?? 0).toFixed(1)}%)`} v={money(c.gmpListingPrice)} tone={(c.gmpGainPct ?? 0) >= 0 ? 'pos' : 'neg'} />}
      {c.gmpOnApplied !== undefined && ipo.stage === 'applied' && <Row l="GMP profit if fully allotted" v={formatSignedCurrency(c.gmpOnApplied, currency)} tone={c.gmpOnApplied >= 0 ? 'pos' : 'neg'} />}
      {ipo.lockInEnd && lock !== undefined && <Row l="Lock-in ends" v={lock > 0 ? `${lock} days` : 'Ended'} />}
    </div>
  );
}
