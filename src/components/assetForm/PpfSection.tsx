import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Plus, Trash2 } from 'lucide-react';
import { DateInput, Select, inputClasses } from '../ui';
import { COMMON_BANKS } from '../../utils/banks';
import { formatCurrency, formatPreciseCurrency } from '../../utils/privateFormat';
import { formatDate, toIsoDate } from '../../utils/date';
import { newId } from '../../utils/id';
import {
  DEFAULT_PPF_RATE,
  PPF_MAX_DEPOSIT,
  PPF_MIN_DEPOSIT,
  checkpointYears as checkpointYearsFor,
  computePpfNow,
  excessDeposits,
  fyLabel,
  ppfMaturityDate,
  ppfRate,
  ppfStatus,
  projectPpf,
  taxSavedSoFar,
  yearAdvice,
} from '../../utils/ppf';
import type { PpfDetails, PpfDeposit } from '../../types';

function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium text-slate-500 mb-1 flex items-end min-h-[2.25rem] leading-snug">{label}</span>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </label>
  );
}

function Block({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="space-y-4 border border-line-soft bg-slate-50/60 rounded-xl p-4">
      <div>
        <p className="text-sm font-medium text-ink-2">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

const Row = ({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className={`font-numeric text-right ${strong ? 'font-semibold text-ink text-sm' : 'text-ink-2'}`}>{value}</span>
  </div>
);

const Note = ({ tone, children }: { tone: 'info' | 'warn' | 'good'; children: ReactNode }) => {
  const Icon = tone === 'warn' ? AlertTriangle : tone === 'good' ? CheckCircle2 : Info;
  const color = tone === 'warn' ? 'text-amber-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-600';
  return (
    <p className={`text-xs flex items-start gap-1.5 ${color}`}>
      <Icon size={13} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </p>
  );
}

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

const ACCOUNT_FOR: { value: NonNullable<PpfDetails['accountFor']>; label: string }[] = [
  { value: 'self', label: 'Myself' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child (as guardian)' },
  { value: 'parent', label: 'Parent' },
  { value: 'other', label: 'Someone else' },
];

const InfoChip = ({ tone, children }: { tone: 'good' | 'muted' | 'warn'; children: ReactNode }) => (
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

export default function PpfSection({
  value,
  onChange,
  currency,
  interestRate,
  onInterestRateChange,
  institution,
  onInstitutionChange,
}: {
  value: PpfDetails;
  onChange: (next: PpfDetails) => void;
  currency: string;
  /** Interest rate text from the main form state (kept in the asset's own `interestRate`). */
  interestRate: string;
  onInterestRateChange: (v: string) => void;
  institution: string;
  onInstitutionChange: (v: string) => void;
}) {
  const set = (patch: Partial<PpfDetails>) => onChange({ ...value, ...patch });
  const rate = ppfRate(interestRate);
  const money = (n: number) => formatPreciseCurrency(n, currency);
  const whole = (n: number) => formatCurrency(n, currency);

  const now = useMemo(() => computePpfNow(value, rate), [value, rate]);
  const status = useMemo(() => ppfStatus(value.openingDate, now), [value.openingDate, now]);
  const proj = useMemo(() => projectPpf(value, rate), [value, rate]);
  const advice = useMemo(() => (value.openingDate || now ? yearAdvice(now?.fyDeposited ?? 0) : null), [value.openingDate, now]);
  const excess = useMemo(() => excessDeposits(value), [value]);
  const maturity = ppfMaturityDate(value.openingDate);

  // Year-end checkpoints a passbook balance can be taken from: each 31 March since opening.
  const checkpointYears = useMemo(() => checkpointYearsFor(value.openingDate), [value.openingDate]);

  const [newDate, setNewDate] = useState(toIsoDate());
  const [newAmount, setNewAmount] = useState('');
  const [showTable, setShowTable] = useState(false);
  const todayIso = toIsoDate();
  // Deposits before the year-end are only skipped once a year-end balance is actually in use.
  const checkpointStart = value.checkpointFy && (value.checkpointBalance ?? 0) > 0 ? `${value.checkpointFy}-04-01` : undefined;

  const addDeposit = () => {
    const amount = Number(newAmount);
    if (!newDate || !(amount > 0)) return;
    const dep: PpfDeposit = { id: newId(), date: newDate, amount };
    set({ deposits: [...(value.deposits ?? []), dep] });
    setNewAmount('');
  };
  const removeDeposit = (id: string) => set({ deposits: (value.deposits ?? []).filter((d) => d.id !== id) });
  const deposits = [...(value.deposits ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  const blocks = value.extensionBlocks ?? 0;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const depositedPct = advice ? Math.min(100, (advice.deposited / PPF_MAX_DEPOSIT) * 100) : 0;
  const taxSoFar = taxSavedSoFar(advice?.deposited ?? 0, value.taxSlabPct);

  return (
    <>
      <Block title="Account" subtitle="From your passbook or net banking — all optional except the opening date">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bank / Post office">
            <>
              <input
                list="ppf-institutions"
                value={institution}
                onChange={(e) => onInstitutionChange(e.target.value)}
                className={inputClasses}
                placeholder="e.g. State Bank of India"
              />
              <datalist id="ppf-institutions">
                <option value="India Post (Post Office)" />
                {COMMON_BANKS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          </Field>
          <Field label="Account number">
            <input value={value.accountNumber ?? ''} onChange={(e) => set({ accountNumber: e.target.value.trim() || undefined })} className={inputClasses} placeholder="PPF account no." />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account is for">
            <Select value={value.accountFor ?? 'self'} onChange={(e) => set({ accountFor: e.target.value as PpfDetails['accountFor'] })}>
              {ACCOUNT_FOR.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nominee">
            <input value={value.nominee ?? ''} onChange={(e) => set({ nominee: e.target.value || undefined })} className={inputClasses} placeholder="Name" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Account opened on" hint={maturity ? `Matures on ${formatDate(maturity)} — 15 years after the end of that financial year` : 'Sets the 15-year term, loan and withdrawal windows'}>
            <DateInput value={value.openingDate ?? ''} onChange={(v) => set({ openingDate: v || undefined })} max={todayIso} className={inputClasses} />
          </Field>
          <Field label="Interest rate (% p.a.)" hint={`Reset by the government every quarter — ${DEFAULT_PPF_RATE}% for Oct–Dec 2026`}>
            <input type="number" step="any" min={0} value={interestRate} onChange={(e) => onInterestRateChange(e.target.value)} className={inputClasses} placeholder={String(DEFAULT_PPF_RATE)} />
          </Field>
        </div>
      </Block>

      {status && (
        <Block title="Term & rules" subtitle="Where this account sits in the 15-year scheme">
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-3">
            <div>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="text-slate-500">
                  {status.isMatured ? 'Matured' : `${Math.floor(status.monthsLeft / 12)} yr ${status.monthsLeft % 12} mo to maturity`}
                </span>
                <span className="font-numeric text-ink-2">{pct(status.termProgress)} of term</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-700/50 overflow-hidden">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${status.termProgress * 100}%` }} />
              </div>
            </div>
            <Row label="Financial year of the account" value={status.fyIndex >= 1 ? `#${status.fyIndex} (${fyLabel(status.openFy + status.fyIndex - 1)})` : 'Not started'} />
            <Row label="Matures on" value={formatDate(status.maturityDate)} />
            <Row label="Withdraw the full balance from" value={formatDate(status.withdrawableFrom)} />

            <div className="border-t border-line-soft pt-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-2">Loan against PPF</span>
                {status.loan.state === 'open' ? <InfoChip tone="good">Available</InfoChip> : status.loan.state === 'before' ? <InfoChip tone="muted">From {formatDate(status.loan.from)}</InfoChip> : <InfoChip tone="muted">Window closed</InfoChip>}
              </div>
              {status.loan.state === 'open' && (
                <p className="text-[11px] text-slate-500">
                  {status.loan.max !== undefined ? <>Up to about <span className="font-semibold text-ink-2">{money(status.loan.max)}</span> (25% of the balance two years ago). </> : 'Add the passbook balance to see the limit. '}
                  Open until {formatDate(status.loan.to)}. Costs 1% above the PPF rate if repaid within 36 months.
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-ink-2">Partial withdrawal</span>
                {status.withdrawal.state === 'open' ? <InfoChip tone="good">Available</InfoChip> : <InfoChip tone="muted">From {formatDate(status.withdrawal.from)}</InfoChip>}
              </div>
              {status.withdrawal.state === 'open' && (
                <p className="text-[11px] text-slate-500">
                  {status.withdrawal.max !== undefined ? (
                    <>
                      Up to about <span className="font-semibold text-ink-2">{money(status.withdrawal.max)}</span> this year (50% of the lower of the balance four years ago and last year)
                      {status.withdrawal.approx ? ' — estimated, since older balances are missing. ' : '. '}
                    </>
                  ) : (
                    'Add the passbook balance to see the limit. '
                  )}
                  One withdrawal per financial year. Premature closure is only allowed for specific reasons, with a 1% interest cut.
                </p>
              )}
            </div>
          </div>
        </Block>
      )}

      <Block title="Passbook balance" subtitle="Start from a year-end balance, then log what you've deposited since — interest is worked out the way PPF does it">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Balance on 31 March of" hint="Pick the latest year-end whose statement you have">
            <Select value={value.checkpointFy ? String(value.checkpointFy) : ''} onChange={(e) => set({ checkpointFy: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">No year-end balance</option>
              {checkpointYears.map((y) => (
                <option key={y} value={y}>
                  31 Mar {y} (FY {fyLabel(y - 1)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Balance then" hint="Including the interest credited that day">
            <input type="number" step="any" min={0} value={value.checkpointBalance ?? ''} onChange={(e) => set({ checkpointBalance: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
        </div>
        {value.checkpointFy && (
          <Field label="Total you deposited until then (optional)" hint="Only used to show your real return — leave blank if unsure">
            <input type="number" step="any" min={0} value={value.depositedToCheckpoint ?? ''} onChange={(e) => set({ depositedToCheckpoint: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">{value.checkpointFy ? `Deposits since 1 Apr ${value.checkpointFy}` : 'Deposits'}</p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
            <DateInput value={newDate} onChange={setNewDate} className={inputClasses} />
            <input
              type="number"
              step="any"
              min={0}
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDeposit();
                }
              }}
              className={inputClasses}
              placeholder="Amount"
            />
            <button
              type="button"
              onClick={addDeposit}
              disabled={!newDate || !(Number(newAmount) > 0)}
              className="h-10 px-3 rounded-lg bg-brand-600 text-white text-sm font-medium inline-flex items-center gap-1 hover:bg-brand-700 disabled:opacity-40 disabled:pointer-events-none"
            >
              <Plus size={14} /> Add
            </button>
          </div>
          {deposits.length > 0 ? (
            <ul className="rounded-lg bg-surface border border-line-soft divide-y divide-line-soft">
              {deposits.map((d) => {
                const ignored = checkpointStart !== undefined && d.date < checkpointStart;
                const upcoming = d.date > todayIso;
                return (
                  <li key={d.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="text-slate-500">
                      {formatDate(d.date)}
                      {ignored && <span className="ml-2 text-amber-600">already in the balance above — not counted</span>}
                      {upcoming && <span className="ml-2 text-slate-400">upcoming — counted from its date</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="font-numeric text-ink-2">{money(d.amount)}</span>
                      <button type="button" onClick={() => removeDeposit(d.id)} aria-label="Remove deposit" className="text-slate-400 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[11px] text-slate-400">No deposits logged yet.</p>
          )}
          {value.openingDate && deposits.some((d) => d.date < value.openingDate!) && (
            <Note tone="warn">Some deposits are dated before the account was opened — check the dates.</Note>
          )}
          {excess.map((x) => (
            <Note key={x.fy} tone="warn">
              FY {x.label}: {money(x.excess)} is over the {whole(PPF_MAX_DEPOSIT)} yearly limit. The excess earns no interest and isn't counted here.
            </Note>
          ))}
        </div>

        {now ? (
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
            <Row label="Credited balance (as in passbook)" value={money(now.creditedBalance)} />
            <Row label={`Interest earned this year, credited 31 Mar`} value={money(now.accruedInterest)} />
            <div className="border-t border-line-soft pt-1.5">
              <Row label="Current value" value={money(now.currentValue)} strong />
            </div>
            <Row label="Total deposited" value={money(now.invested)} />
            <Row label="Interest earned in all" value={money(now.interestEarned)} />
            <p className="text-[11px] text-slate-400 pt-1">
              Interest is worked out monthly on the balance after your deposits up to the 5th, and added to the balance once a year on 31 March. Current Value follows this unless the account has no balance or deposits logged.
            </p>
          </div>
        ) : (
          <Note tone="info">Add a year-end balance or a deposit and Current Value will be calculated for you. Until then, enter it by hand below.</Note>
        )}
        {now && now.ignoredDeposits > 0 && (
          <Note tone="warn">
            {now.ignoredDeposits} deposit{now.ignoredDeposits === 1 ? ' is' : 's are'} dated before the year-end balance, so they're already counted in it.
          </Note>
        )}
      </Block>

      {advice && status && !status.isMatured && (
        <Block title={`This financial year (${advice.fyLabel})`} subtitle="Deposit limits, the 5th-of-month rule and your 80C benefit">
          <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-3">
            <div>
              <div className="flex items-baseline justify-between text-xs mb-1.5">
                <span className="text-slate-500">Deposited so far</span>
                <span className="font-numeric text-ink-2">
                  {money(advice.deposited)} of {whole(PPF_MAX_DEPOSIT)}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-200/70 dark:bg-slate-700/50 overflow-hidden">
                <div className={`h-full rounded-full ${depositedPct >= 100 ? 'bg-emerald-500' : 'bg-brand-600'}`} style={{ width: `${depositedPct}%` }} />
              </div>
            </div>
            {advice.headroom > 0 ? (
              <>
                <Row label="Room left this year" value={money(advice.headroom)} />
                {advice.suggestedMonthly !== undefined && <Row label={`To fill it: ${advice.instalmentsLeft} × by the 5th`} value={`${money(advice.suggestedMonthly)} / month`} />}
                <Note tone="info">
                  Deposit by <span className="font-semibold">{formatDate(advice.nextCutoff)}</span> to earn interest for that whole month; a later deposit starts earning the month after. A lump sum between 1–5 April earns for the full year.
                </Note>
              </>
            ) : (
              <Note tone="good">Limit reached for {advice.fyLabel} — nothing more earns interest this year.</Note>
            )}
            {advice.belowMinimum && (
              <Note tone="warn">
                No {money(PPF_MIN_DEPOSIT)} minimum deposit yet this year — {advice.daysLeftInFy} days left. An account missing it turns inactive; reviving it takes the ₹500 minimum plus a ₹50 fee for each missed year.
              </Note>
            )}
            {taxSoFar !== undefined && <Row label="Tax saved so far (old regime, 80C)" value={money(taxSoFar)} />}
          </div>
        </Block>
      )}

      <Block title="Plan & projection" subtitle="What this account could be worth at maturity, and what extending it could add">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deposit each year" hint={`Up to ${whole(PPF_MAX_DEPOSIT)}`}>
            <input type="number" step="any" min={0} max={PPF_MAX_DEPOSIT} value={value.plannedYearlyDeposit ?? ''} onChange={(e) => set({ plannedYearlyDeposit: num(e.target.value) })} className={inputClasses} placeholder="e.g. 150000" />
          </Field>
          <Field label="How you deposit">
            <Select value={value.depositMode ?? 'lump'} onChange={(e) => set({ depositMode: e.target.value as PpfDetails['depositMode'] })}>
              <option value="lump">Lump sum by 5 April</option>
              <option value="monthly">12 monthly instalments</option>
            </Select>
          </Field>
        </div>
        {(value.plannedYearlyDeposit ?? 0) > PPF_MAX_DEPOSIT && (
          <Note tone="warn">The yearly limit is {whole(PPF_MAX_DEPOSIT)} — anything above that earns nothing, so the projection uses {whole(PPF_MAX_DEPOSIT)}.</Note>
        )}
        {(value.plannedYearlyDeposit ?? 0) > 0 && (value.plannedYearlyDeposit ?? 0) < PPF_MIN_DEPOSIT && (
          <Note tone="warn">The minimum deposit is {whole(PPF_MIN_DEPOSIT)} a year to keep the account active.</Note>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Yearly step-up %">
            <input type="number" step="any" min={0} value={value.depositStepUpPct ?? ''} onChange={(e) => set({ depositStepUpPct: num(e.target.value) })} className={inputClasses} placeholder="0" />
          </Field>
          <Field label="Extend after 15 yrs">
            <Select value={String(blocks)} onChange={(e) => set({ extensionBlocks: Number(e.target.value) as PpfDetails['extensionBlocks'] })}>
              <option value="0">No extension</option>
              <option value="1">5 years</option>
              <option value="2">10 years</option>
              <option value="3">15 years</option>
            </Select>
          </Field>
          <Field label="During extension">
            <Select value={value.extensionWithDeposits ? 'with' : 'without'} disabled={blocks === 0} onChange={(e) => set({ extensionWithDeposits: e.target.value === 'with' })}>
              <option value="without">No new deposits</option>
              <option value="with">Keep depositing</option>
            </Select>
          </Field>
        </div>
        <Field label="Tax slab (old regime)" hint="For the Section 80C saving on deposits. Choose 'Not claiming' under the new regime — the interest itself is always tax-free.">
          <Select value={String(value.taxSlabPct ?? 0)} onChange={(e) => set({ taxSlabPct: Number(e.target.value) || undefined })}>
            <option value="0">Not claiming 80C</option>
            <option value="5">5%</option>
            <option value="20">20%</option>
            <option value="30">30%</option>
          </Select>
        </Field>

        {proj && proj.milestones.length > 0 ? (
          <div className="space-y-2">
            {proj.milestones.map((m) => (
              <div key={m.label} className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
                <Row label={`${m.label} · ${formatDate(m.date)}`} value={money(m.balance)} strong />
                <Row label="You deposit from now" value={money(m.depositsFromNow)} />
                <Row label="Interest from now" value={money(m.interestFromNow)} />
              </div>
            ))}
            {proj.taxSavedOverPlan !== undefined && proj.taxSavedOverPlan > 0 && (
              <div className="rounded-lg bg-surface border border-line-soft p-3 space-y-1.5">
                <Row label="Tax saved over the plan (80C)" value={money(proj.taxSavedOverPlan)} strong />
                {proj.taxSavedPerYear !== undefined && <Row label="At the full limit, every year" value={money(proj.taxSavedPerYear)} />}
              </div>
            )}
            <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs font-medium text-brand-700 inline-flex items-center gap-1">
              <ChevronDown size={14} className={`transition-transform ${showTable ? 'rotate-180' : ''}`} />
              {showTable ? 'Hide' : 'Show'} year-by-year
            </button>
            {showTable && (
              <div className="rounded-lg bg-surface border border-line-soft overflow-x-auto">
                <table className="w-full text-xs font-numeric">
                  <thead>
                    <tr className="text-slate-500 text-left">
                      <th className="px-3 py-2 font-medium">FY</th>
                      <th className="px-3 py-2 font-medium text-right">Deposit</th>
                      <th className="px-3 py-2 font-medium text-right">Interest</th>
                      <th className="px-3 py-2 font-medium text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {proj.rows.map((r) => (
                      <tr key={r.fy} className="text-ink-2">
                        <td className="px-3 py-1.5">{r.label}</td>
                        <td className="px-3 py-1.5 text-right">{whole(r.deposited)}</td>
                        <td className="px-3 py-1.5 text-right">{whole(r.interest)}</td>
                        <td className="px-3 py-1.5 text-right">{whole(r.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Assumes {rate}% throughout; the rate is reset every quarter, so treat this as an estimate. After maturity, extension must be applied for in writing (Form H) within a year of maturity.
            </p>
          </div>
        ) : (
          <Note tone="info">Add the opening date and a yearly deposit amount to see a projection.</Note>
        )}
      </Block>
    </>
  );
}
