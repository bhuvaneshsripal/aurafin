import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Plus, Trash2 } from 'lucide-react';
import InfoTip, { InfoNote } from '../ui/InfoTip';
import { DateInput, Select, inputClasses } from '../ui';
import { formatCurrency, formatPreciseCurrency } from '../../utils/privateFormat';
import { formatDate, toIsoDate } from '../../utils/date';
import { newId } from '../../utils/id';
import {
  COST_INFLATION_PCT,
  DEFAULT_GROWTH_PCT,
  DEFAULT_RENT_ESCALATION_PCT,
  DEFAULT_SELLING_COST_PCT,
  estimateSale,
  loanAnalysis,
  ownershipShare,
  projectProperty,
  propertyAppreciation,
  propertyCost,
  rateBasedValue,
  rentalAnalysis,
} from '../../utils/property';
import type { Liability, PropertyDetails, PropertyImprovement } from '../../types';

function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
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

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="space-y-4 border border-line-soft bg-slate-50/60 rounded-xl p-4">
      <p className="text-sm font-medium text-ink-2 flex items-center gap-1.5">
        {title}
        {subtitle && <InfoTip>{subtitle}</InfoTip>}
      </p>
      {children}
    </div>
  );
}

/** A Block that can be folded away — keeps the long analysis sections out of the way until wanted. */
function FoldBlock({ title, subtitle, badge, defaultOpen = false, children }: { title: string; subtitle?: string; badge?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-line-soft bg-slate-50/60 rounded-xl p-4 space-y-4">
      <div className="w-full flex items-start justify-between gap-3 cursor-pointer" onClick={() => setOpen((v) => !v)}>
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
        <span className="flex items-center gap-2 shrink-0">
          {badge}
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </div>
      {open && <div className="space-y-4">{children}</div>}
    </div>
  );
}

const Row = ({ label, value, strong }: { label: ReactNode; value: ReactNode; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className={`font-numeric text-right ${strong ? 'font-semibold text-ink text-sm' : 'text-ink-2'}`}>{value}</span>
  </div>
);

const Note = ({ tone, children }: { tone: 'info' | 'warn' | 'good'; children: ReactNode }) => {
  if (tone === 'info') return <InfoNote label="Tip">{children}</InfoNote>;
  const Icon = tone === 'warn' ? AlertTriangle : CheckCircle2;
  const color = tone === 'warn' ? 'text-amber-600' : 'text-emerald-600';
  return (
    <p className={`text-xs flex items-start gap-1.5 ${color}`}>
      <Icon size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  );
};

const Chip = ({ tone, children }: { tone: 'good' | 'muted' | 'warn'; children: ReactNode }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
      tone === 'good'
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
        : tone === 'warn'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300'
    }`}
  >
    {children}
  </span>
);

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

const KINDS: { value: NonNullable<PropertyDetails['kind']>; label: string }[] = [
  { value: 'apartment', label: 'Apartment / flat' },
  { value: 'independent_house', label: 'Independent house' },
  { value: 'villa', label: 'Villa' },
  { value: 'builder_floor', label: 'Builder floor' },
  { value: 'studio', label: 'Studio' },
  { value: 'plot', label: 'Plot / land' },
  { value: 'other', label: 'Other' },
];

const USAGES: { value: NonNullable<PropertyDetails['usage']>; label: string }[] = [
  { value: 'self_occupied', label: 'Self-occupied' },
  { value: 'rented', label: 'Rented out' },
  { value: 'vacant', label: 'Vacant' },
  { value: 'under_construction', label: 'Under construction' },
];

const AREA_BASIS: { value: NonNullable<PropertyDetails['areaBasis']>; label: string }[] = [
  { value: 'super_built_up', label: 'Super built-up' },
  { value: 'built_up', label: 'Built-up' },
  { value: 'carpet', label: 'Carpet' },
  { value: 'plot', label: 'Plot area' },
];

const SLABS = [5, 10, 15, 20, 25, 30];

const pct1 = (n: number) => `${n.toFixed(1)}%`;
const fmtMonths = (m: number) => `${Math.floor(m / 12)} yr ${m % 12} mo`;

export default function PropertySection({
  value,
  onChange,
  currency,
  assetValue,
  loans,
}: {
  value: PropertyDetails;
  onChange: (next: PropertyDetails) => void;
  currency: string;
  /** Current Value from the main form (the person's share) — used while valuation is manual. */
  assetValue: number;
  /** Every liability the person tracks — one can be linked as this property's loan. */
  loans: Liability[];
}) {
  const set = (patch: Partial<PropertyDetails>) => onChange({ ...value, ...patch });
  const money = (n: number) => formatPreciseCurrency(n, currency);
  const whole = (n: number) => formatCurrency(n, currency);
  const todayIso = toIsoDate();

  const share = ownershipShare(value);
  const mode = value.valuationMode ?? 'manual';
  const rateValue = useMemo(() => rateBasedValue(value), [value.areaSqft, value.ratePerSqft, value.ownershipPct]); // eslint-disable-line react-hooks/exhaustive-deps
  const yourValue = mode === 'rate' && rateValue ? rateValue : assetValue;

  const cost = useMemo(() => propertyCost(value), [value]);
  const appreciation = useMemo(() => propertyAppreciation(value, yourValue, todayIso), [value, yourValue, todayIso]);
  const rental = useMemo(() => rentalAnalysis(value, yourValue, todayIso), [value, yourValue, todayIso]);
  const linkedLoan = loans.find((l) => l.id === value.linkedLoanId);
  const loan = useMemo(() => loanAnalysis(linkedLoan, yourValue), [linkedLoan, yourValue]);
  const sale = useMemo(() => estimateSale(value, yourValue, loan?.outstanding ?? 0, todayIso), [value, yourValue, loan?.outstanding, todayIso]);
  const proj = useMemo(() => projectProperty(value, yourValue), [value, yourValue]);

  const sortedLoans = useMemo(() => [...loans].sort((a, b) => Number(b.liabilityClass === 'home_loan') - Number(a.liabilityClass === 'home_loan') || a.name.localeCompare(b.name)), [loans]);

  // Improvements ledger
  const [impDate, setImpDate] = useState(todayIso);
  const [impAmount, setImpAmount] = useState('');
  const [impNote, setImpNote] = useState('');
  const addImprovement = () => {
    const amount = Number(impAmount);
    if (!impDate || !(amount > 0)) return;
    const item: PropertyImprovement = { id: newId(), date: impDate, amount, note: impNote.trim() || undefined };
    set({ improvements: [...(value.improvements ?? []), item] });
    setImpAmount('');
    setImpNote('');
  };
  const removeImprovement = (id: string) => set({ improvements: (value.improvements ?? []).filter((i) => i.id !== id) });
  const improvements = [...(value.improvements ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  const [showTable, setShowTable] = useState(false);

  const rented = value.usage === 'rented';
  const leaseChip =
    rental.leaseDaysLeft === undefined ? null : rental.leaseDaysLeft < 0 ? (
      <Chip tone="warn">Lease ended</Chip>
    ) : rental.leaseDaysLeft <= 60 ? (
      <Chip tone="warn">Lease ends in {rental.leaseDaysLeft} d</Chip>
    ) : (
      <Chip tone="good">Lease ok</Chip>
    );

  return (
    <>
      <Block title="Property" subtitle="What it is and how you use it — everything here is optional">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Property type">
            <Select value={value.kind ?? 'apartment'} onChange={(e) => set({ kind: e.target.value as PropertyDetails['kind'] })}>
              {KINDS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Currently">
            <Select value={value.usage ?? 'self_occupied'} onChange={(e) => set({ usage: e.target.value as PropertyDetails['usage'] })}>
              {USAGES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project / society">
            <input value={value.projectName ?? ''} onChange={(e) => set({ projectName: e.target.value || undefined })} className={inputClasses} placeholder="e.g. Prestige Lakeside" />
          </Field>
          <Field label="City">
            <input value={value.city ?? ''} onChange={(e) => set({ city: e.target.value || undefined })} className={inputClasses} placeholder="e.g. Bengaluru" />
          </Field>
        </div>
        <Field label="Address">
          <input value={value.address ?? ''} onChange={(e) => set({ address: e.target.value || undefined })} className={inputClasses} placeholder="Flat no., street, locality" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area (sq ft)">
            <input type="number" step="any" min={0} value={value.areaSqft ?? ''} onChange={(e) => set({ areaSqft: num(e.target.value) })} className={inputClasses} placeholder="e.g. 1250" />
          </Field>
          <Field label="Area measured as">
            <Select value={value.areaBasis ?? 'super_built_up'} onChange={(e) => set({ areaBasis: e.target.value as PropertyDetails['areaBasis'] })}>
              {AREA_BASIS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Your ownership share (%)" hint="100 if you are the sole owner. Price, rent and costs below are for the whole property.">
            <input type="number" step="any" min={0} max={100} value={value.ownershipPct ?? ''} onChange={(e) => set({ ownershipPct: num(e.target.value) })} className={inputClasses} placeholder="100" />
          </Field>
          <Field label="Co-owner(s)">
            <input value={value.coOwners ?? ''} onChange={(e) => set({ coOwners: e.target.value || undefined })} className={inputClasses} placeholder="e.g. Spouse" />
          </Field>
        </div>
        <Field label="Registration / RERA no.">
          <input value={value.registrationNo ?? ''} onChange={(e) => set({ registrationNo: e.target.value.trim() || undefined })} className={inputClasses} placeholder="Document or RERA number" />
        </Field>
      </Block>

      <Block title="Purchase & cost" subtitle="What the whole property cost you — this becomes your Invested amount">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Purchase date">
            <DateInput value={value.purchaseDate ?? ''} onChange={(v) => set({ purchaseDate: v || undefined })} max={todayIso} className={inputClasses} />
          </Field>
          <Field label="Purchase price">
            <input type="number" step="any" min={0} value={value.purchasePrice ?? ''} onChange={(e) => set({ purchasePrice: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stamp duty">
            <input type="number" step="any" min={0} value={value.stampDuty ?? ''} onChange={(e) => set({ stampDuty: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
          <Field label="Registration fee">
            <input type="number" step="any" min={0} value={value.registrationFee ?? ''} onChange={(e) => set({ registrationFee: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
          <Field label="Brokerage">
            <input type="number" step="any" min={0} value={value.brokerage ?? ''} onChange={(e) => set({ brokerage: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
          <Field label="Legal / other costs">
            <input type="number" step="any" min={0} value={value.otherPurchaseCosts ?? ''} onChange={(e) => set({ otherPurchaseCosts: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">Renovation &amp; improvements</p>
          <div className="grid grid-cols-[1fr_1fr] gap-2">
            <DateInput value={impDate} onChange={setImpDate} max={todayIso} className={inputClasses} />
            <input type="number" step="any" min={0} value={impAmount} onChange={(e) => setImpAmount(e.target.value)} className={inputClasses} placeholder="Amount" />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={impNote}
              onChange={(e) => setImpNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addImprovement();
                }
              }}
              className={inputClasses}
              placeholder="What was done (optional) — e.g. modular kitchen"
            />
            <button
              type="button"
              onClick={addImprovement}
              disabled={!impDate || !(Number(impAmount) > 0)}
              className="h-10 px-3 rounded-lg bg-brand-600 text-white text-sm font-medium inline-flex items-center gap-1 hover:bg-brand-700 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {improvements.length > 0 ? (
            <ul className="rounded-lg bg-surface border border-line-soft divide-y divide-line-soft">
              {improvements.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="text-slate-500 min-w-0 truncate">
                    {formatDate(i.date)}
                    {i.note && <span className="ml-2 text-ink-2">{i.note}</span>}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-numeric text-ink-2">{money(i.amount)}</span>
                    <button type="button" onClick={() => removeImprovement(i.id)} aria-label="Remove improvement" className="text-slate-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <InfoNote>Money spent after buying adds to your cost — and lowers the tax on a future sale.</InfoNote>
          )}
        </div>

        {cost.total > 0 && (
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
            <Row label="Purchase price" value={money(cost.price)} />
            {cost.closing > 0 && <Row label="Stamp duty, registration & other" value={money(cost.closing)} />}
            {cost.improvements > 0 && <Row label="Renovation & improvements" value={money(cost.improvements)} />}
            <div className="border-t border-line-soft pt-1.5">
              <Row label="Total cost (whole property)" value={money(cost.total)} strong />
            </div>
            {share < 1 && <Row label={`Your ${Math.round(share * 1000) / 10}% share`} value={money(cost.yourTotal)} />}
            {appreciation?.boughtPerSqft !== undefined && <Row label="Price paid per sq ft" value={money(appreciation.boughtPerSqft)} />}
          </div>
        )}
      </Block>

      <Block title="Value & growth" subtitle="Type today's value yourself, or work it out from the going rate in your area">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Value comes from">
            <Select value={mode} onChange={(e) => set({ valuationMode: e.target.value as PropertyDetails['valuationMode'] })}>
              <option value="manual">I'll type Current Value</option>
              <option value="rate">Area × rate per sq ft</option>
            </Select>
          </Field>
          <Field label="Current rate (per sq ft)" hint={mode === 'rate' ? 'Check recent sale listings in your project / locality' : 'Only used when value comes from area × rate'}>
            <input type="number" step="any" min={0} value={value.ratePerSqft ?? ''} onChange={(e) => set({ ratePerSqft: num(e.target.value) })} className={inputClasses} placeholder="e.g. 9500" />
          </Field>
        </div>
        {mode === 'rate' && !rateValue && <Note tone="info">Add the area above and a rate here — Current Value will be worked out for you. Until then, type it below.</Note>}
        {mode === 'rate' && rateValue && (
          <Note tone="good">
            {value.areaSqft} sq ft × {money(value.ratePerSqft ?? 0)}
            {share < 1 ? ` × your ${Math.round(share * 1000) / 10}% share` : ''} = <span className="font-semibold">{money(rateValue)}</span>
          </Note>
        )}

        {appreciation ? (
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
            <Row label="Gain over your total cost" value={`${appreciation.gain >= 0 ? '+' : '−'}${money(Math.abs(appreciation.gain))} (${appreciation.gainPct >= 0 ? '+' : '−'}${pct1(Math.abs(appreciation.gainPct))})`} strong />
            {appreciation.cagr !== undefined && appreciation.years !== undefined && (
              <Row label={`Growth per year over ${appreciation.years.toFixed(1)} yrs`} value={`${appreciation.cagr >= 0 ? '' : '−'}${pct1(Math.abs(appreciation.cagr))}`} />
            )}
            {appreciation.nowPerSqft !== undefined && <Row label="Value per sq ft today" value={money(appreciation.nowPerSqft)} />}
            <InfoNote className="pt-1">Measured against everything you've spent (price, stamp duty, registration, improvements), so it's a fair view of what the property has made you.</InfoNote>
          </div>
        ) : (
          <Note tone="info">Add the purchase price and today's value to see your gain and yearly growth.</Note>
        )}

        <Field label="Expected price growth (% a year)" hint={`Used only for the projection below — defaults to ${DEFAULT_GROWTH_PCT}%`}>
          <input type="number" step="any" value={value.growthPct ?? ''} onChange={(e) => set({ growthPct: num(e.target.value) })} className={inputClasses} placeholder={String(DEFAULT_GROWTH_PCT)} />
        </Field>
      </Block>

      <FoldBlock
        title="Rent & running costs"
        subtitle="Yield, net income and lease tracking"
        badge={rental.netYieldPct !== undefined ? <Chip tone={rental.netYieldPct >= 0 ? 'good' : 'warn'}>Net yield {pct1(rental.netYieldPct)}</Chip> : leaseChip}
        defaultOpen={rented}
      >
        {rented ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly rent">
                <input type="number" step="any" min={0} value={value.monthlyRent ?? ''} onChange={(e) => set({ monthlyRent: num(e.target.value) })} className={inputClasses} placeholder="0" />
              </Field>
              <Field label="Security deposit held">
                <input type="number" step="any" min={0} value={value.securityDeposit ?? ''} onChange={(e) => set({ securityDeposit: num(e.target.value) })} className={inputClasses} placeholder="0" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Yearly rent increase (%)" hint={`Defaults to ${DEFAULT_RENT_ESCALATION_PCT}% in the projection`}>
                <input type="number" step="any" min={0} value={value.rentEscalationPct ?? ''} onChange={(e) => set({ rentEscalationPct: num(e.target.value) })} className={inputClasses} placeholder={String(DEFAULT_RENT_ESCALATION_PCT)} />
              </Field>
              <Field label="Empty months per year" hint="Typical gap between tenants">
                <input type="number" step="any" min={0} max={12} value={value.vacancyMonths ?? ''} onChange={(e) => set({ vacancyMonths: num(e.target.value) })} className={inputClasses} placeholder="0" />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Tenant">
                <input value={value.tenantName ?? ''} onChange={(e) => set({ tenantName: e.target.value || undefined })} className={inputClasses} placeholder="Name" />
              </Field>
              <Field label="Lease starts">
                <DateInput value={value.leaseStart ?? ''} onChange={(v) => set({ leaseStart: v || undefined })} className={inputClasses} />
              </Field>
              <Field label="Lease ends" hint="You'll see a reminder under Upcoming">
                <DateInput value={value.leaseEnd ?? ''} onChange={(v) => set({ leaseEnd: v || undefined })} className={inputClasses} />
              </Field>
            </div>
            {rental.leaseDaysLeft !== undefined && rental.leaseDaysLeft <= 60 && (
              <Note tone="warn">{rental.leaseDaysLeft < 0 ? `The lease ended ${Math.abs(rental.leaseDaysLeft)} days ago` : `The lease ends in ${rental.leaseDaysLeft} days`} — time to renew or find a new tenant.</Note>
            )}
          </>
        ) : (
          <Note tone="info">Set "Currently" to "Rented out" above to track rent, tenant and lease dates. Running costs below always count.</Note>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Property tax (per year)">
            <input type="number" step="any" min={0} value={value.propertyTaxYearly ?? ''} onChange={(e) => set({ propertyTaxYearly: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
          <Field label="Society maintenance (per month)">
            <input type="number" step="any" min={0} value={value.maintenanceMonthly ?? ''} onChange={(e) => set({ maintenanceMonthly: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
          <Field label="Insurance (per year)">
            <input type="number" step="any" min={0} value={value.insuranceYearly ?? ''} onChange={(e) => set({ insuranceYearly: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
          <Field label="Repairs & other (per year)">
            <input type="number" step="any" min={0} value={value.otherCostsYearly ?? ''} onChange={(e) => set({ otherCostsYearly: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
        </div>

        {rental.hasAnyFigures ? (
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
            {rental.earnsRent && <Row label="Rent in a year (after empty months)" value={money(rental.annualRent)} />}
            <Row label="Running costs in a year" value={money(rental.annualCosts)} />
            <div className="border-t border-line-soft pt-1.5">
              <Row label="Net income in a year (whole property)" value={money(rental.netAnnual)} strong />
            </div>
            <Row label={share < 1 ? `Your ${Math.round(share * 1000) / 10}% share, per month` : 'Per month'} value={money(rental.yourNetMonthly)} />
            {rental.grossYieldPct !== undefined && <Row label="Gross rental yield" value={pct1(rental.grossYieldPct)} />}
            {rental.netYieldPct !== undefined && <Row label="Net yield on today's value" value={pct1(rental.netYieldPct)} />}
            {rental.yieldOnCostPct !== undefined && <Row label="Net yield on what you paid" value={pct1(rental.yieldOnCostPct)} />}
            {appreciation?.cagr !== undefined && rental.netYieldPct !== undefined && (
              <div className="border-t border-line-soft pt-1.5">
                <Row label="Growth + net yield (approx. total return a year)" value={pct1(appreciation.cagr + rental.netYieldPct)} strong />
              </div>
            )}
            <InfoNote className="pt-1">Residential rent in India typically yields 2–4% of value a year, so growth in the price does most of the work.</InfoNote>
          </div>
        ) : (
          <Note tone="info">Add rent or running costs to see yield and monthly net income.</Note>
        )}
      </FoldBlock>

      <FoldBlock
        title="Home loan & equity"
        subtitle="Link a loan you track under Liabilities"
        badge={loan ? <Chip tone="muted">Equity {whole(loan.equity)}</Chip> : undefined}
        defaultOpen={!!linkedLoan}
      >
        <Field label="Loan against this property" hint="Your net worth already subtracts this loan under Liabilities — linking only adds equity and cash-flow figures here, nothing is counted twice.">
          <Select value={value.linkedLoanId ?? ''} onChange={(e) => set({ linkedLoanId: e.target.value || undefined })}>
            <option value="">No loan linked</option>
            {sortedLoans.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {whole(l.outstanding)} outstanding
              </option>
            ))}
          </Select>
        </Field>
        {sortedLoans.length === 0 && <Note tone="info">No loans yet — add your home loan on the Liabilities tab, then come back and link it.</Note>}
        {value.linkedLoanId && !linkedLoan && <Note tone="warn">The linked loan was deleted. Pick another or clear it.</Note>}
        {loan && (
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
            <Row label="Property value (your share)" value={money(yourValue)} />
            <Row label="Loan outstanding" value={`− ${money(loan.outstanding)}`} />
            <div className="border-t border-line-soft pt-1.5">
              <Row label="Your equity" value={money(loan.equity)} strong />
            </div>
            {loan.ltvPct !== undefined && <Row label="Loan as % of value" value={pct1(loan.ltvPct)} />}
            {loan.emi !== undefined && <Row label="EMI" value={`${money(loan.emi)} / month`} />}
            {loan.interestThisMonth !== undefined && loan.principalThisMonth !== undefined && loan.emi !== undefined && (
              <Row label="This month's EMI goes to" value={`${money(loan.interestThisMonth)} interest · ${money(Math.max(0, loan.principalThisMonth))} principal`} />
            )}
            {loan.monthsLeft !== undefined && <Row label="Loan clears in about" value={fmtMonths(loan.monthsLeft)} />}
            {loan.emi !== undefined && rental.hasAnyFigures && (
              <div className="border-t border-line-soft pt-1.5">
                <Row label="Net rent after EMI, per month" value={`${rental.yourNetMonthly - loan.emi < 0 ? '−' : ''}${money(Math.abs(rental.yourNetMonthly - loan.emi))}`} strong />
              </div>
            )}
            {loan.emi !== undefined && rental.hasAnyFigures && rental.yourNetMonthly - loan.emi < 0 && (
              <Note tone="warn">The property doesn't pay for its own loan — you top up {money(loan.emi - rental.yourNetMonthly)} every month.</Note>
            )}
            {linkedLoan && loan.emi === undefined && <InfoNote>Add the EMI and interest rate on the loan to see the monthly split and payoff date.</InfoNote>}
          </div>
        )}
      </FoldBlock>

      <FoldBlock
        title="If you sold today"
        subtitle="Capital-gains tax and what you'd actually take home"
        badge={sale?.inHand !== undefined ? <Chip tone="muted">{whole(sale.inHand)} in hand</Chip> : undefined}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Selling costs (% of price)" hint="Brokerage, legal, staging">
            <input type="number" step="any" min={0} value={value.sellingCostPct ?? ''} onChange={(e) => set({ sellingCostPct: num(e.target.value) })} className={inputClasses} placeholder={String(DEFAULT_SELLING_COST_PCT)} />
          </Field>
          {sale && sale.longTerm !== true && (
            <Field label="Your tax slab" hint="Gains on a property held under 2 years are taxed at your slab">
              <Select value={String(value.taxSlabPct ?? 30)} onChange={(e) => set({ taxSlabPct: Number(e.target.value) })}>
                {SLABS.map((s) => (
                  <option key={s} value={s}>
                    {s}%
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {!sale ? (
          <Note tone="info">Add today's value to see an estimate.</Note>
        ) : (
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
            <Row label="Sale price (your share)" value={money(sale.salePrice)} />
            <Row label="Selling costs" value={`− ${money(sale.sellingCost)}`} />
            <Row label="What you paid in all" value={`− ${money(sale.cost)}`} />
            <div className="border-t border-line-soft pt-1.5">
              <Row label={sale.gain >= 0 ? 'Capital gain' : 'Capital loss'} value={money(Math.abs(sale.gain))} strong />
            </div>
            {sale.regime === 'unknown' ? (
              <Note tone="info">Add the purchase date and price to estimate the tax.</Note>
            ) : (
              <>
                <Row label="Held for" value={fmtMonths(sale.holdingMonths ?? 0)} />
                {sale.regime === 'loss' && <Note tone="good">No tax — and a long-term loss can be set off against other long-term gains.</Note>}
                {sale.regime === 'stcg' && <Row label={`Short-term gain tax (${value.taxSlabPct ?? 30}% slab + cess)`} value={`− ${money(sale.tax ?? 0)}`} />}
                {sale.regime === 'ltcg_flat' && <Row label="Long-term gain tax (12.5% + cess)" value={`− ${money(sale.tax ?? 0)}`} />}
                {sale.regime === 'ltcg_indexed' && <Row label="Long-term gain tax (20% with indexation + cess)" value={`− ${money(sale.tax ?? 0)}`} />}
                {sale.indexationAllowed && sale.taxFlat !== undefined && sale.taxIndexed !== undefined && (
                  <InfoNote>Bought before 23 Jul 2024, so you can pick: {money(sale.taxFlat)} at 12.5% without indexation, or {money(sale.taxIndexed)} at 20% with indexation (cost raised to {money(sale.indexedCost ?? 0)}). The lower is shown.</InfoNote>
                )}
                {sale.afterTax !== undefined && <Row label="After tax" value={money(sale.afterTax)} />}
                {loan && <Row label="Pay off the loan" value={`− ${money(loan.outstanding)}`} />}
                {sale.inHand !== undefined && (
                  <div className="border-t border-line-soft pt-1.5">
                    <Row label={loan ? 'In your hand after tax & loan' : 'In your hand after tax'} value={money(sale.inHand)} strong />
                  </div>
                )}
              </>
            )}
            <InfoNote className="pt-1">An estimate for a resident individual — surcharge isn't included. A long-term gain can be reduced or removed by buying another residential house (Section 54) or investing in specified bonds (Section 54EC, up to ₹50 lakh); check with a tax professional before selling.</InfoNote>
          </div>
        )}
      </FoldBlock>

      <FoldBlock title="Projection" subtitle="Where this could be in 5 to 20 years" badge={proj ? <Chip tone="muted">{proj.growthPct}% growth</Chip> : undefined}>
        {proj ? (
          <div className="space-y-2">
            {proj.rows.map((r) => (
              <div key={r.years} className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
                <Row label={`In ${r.years} years`} value={whole(r.total)} strong />
                <Row label="Property value" value={whole(r.value)} />
                <Row label="Net rent collected on the way" value={whole(r.cumulativeNet)} />
              </div>
            ))}
            <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs font-medium text-brand-700 inline-flex items-center gap-1">
              <ChevronDown size={14} className={`transition-transform ${showTable ? 'rotate-180' : ''}`} />
              {showTable ? 'Hide' : 'Show'} assumptions
            </button>
            {showTable && (
              <ul className="text-[11px] text-slate-500 space-y-0.5 list-disc pl-4">
                <li>Price grows {proj.growthPct}% a year (change it under Value &amp; growth).</li>
                <li>Rent rises {value.rentEscalationPct ?? DEFAULT_RENT_ESCALATION_PCT}% a year; running costs rise {COST_INFLATION_PCT}% a year.</li>
                <li>Counts only your {Math.round(share * 1000) / 10}% share, before income tax, loan payments and any sale tax.</li>
              </ul>
            )}
            <InfoNote>A what-if, not a forecast — property prices vary widely by city and locality.</InfoNote>
          </div>
        ) : (
          <Note tone="info">Add today's value to see a projection.</Note>
        )}
      </FoldBlock>
    </>
  );
}
