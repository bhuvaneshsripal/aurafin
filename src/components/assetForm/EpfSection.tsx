import { useMemo, type ReactNode } from 'react';
import { DateInput, inputClasses } from '../ui';
import { formatCurrency } from '../../utils/privateFormat';
import type { EpfDetails } from '../../types';

export const DEFAULT_EPF_RATE = 8.25;

function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-sm font-medium text-slate-500 mb-1 flex items-end min-h-[2.25rem] leading-snug">{label}</span>
      {children}
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </label>
  );
}

const Row = ({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 text-xs">
    <span className="text-slate-500">{label}</span>
    <span className={`font-numeric text-right ${strong ? 'font-semibold text-ink text-sm' : 'text-ink-2'}`}>{value}</span>
  </div>
);

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
};

export default function EpfSection({
  value,
  onChange,
  currency,
  interestRate,
  onInterestRateChange,
}: {
  value: EpfDetails;
  onChange: (next: EpfDetails) => void;
  currency: string;
  /** Interest rate text from the main form state. */
  interestRate: string;
  onInterestRateChange: (v: string) => void;
}) {
  const set = (patch: Partial<EpfDetails>) => onChange({ ...value, ...patch });
  const todayIso = new Date().toISOString().slice(0, 10);

  const projection = useMemo(() => {
    const rateNum = Number(interestRate);
    const rate = (interestRate.trim() !== '' && Number.isFinite(rateNum) ? rateNum : DEFAULT_EPF_RATE) / 100;
    const { currentAge, retirementAge } = value;
    if (currentAge === undefined || retirementAge === undefined || retirementAge <= currentAge) return null;
    const years = Math.floor(retirementAge - currentAge);
    const monthlyBasic = value.monthlyBasic ?? 0;
    const growth = (value.salaryGrowthPct ?? 0) / 100;
    const inflation = (value.inflationPct ?? 0) / 100;
    // Employer's 8.33% EPS share (capped on ₹15,000 wage) doesn't reach the EPF balance.
    const monthlyContribution = (basic: number) =>
      basic * ((value.employeePct ?? 12) + (value.vpfPct ?? 0) + (value.employerPct ?? 12)) / 100 -
      Math.min(basic, 15000) * 0.0833 * ((value.employerPct ?? 12) > 0 ? 1 : 0);
    let balance = (value.employeeBalance ?? 0) + (value.employerBalance ?? 0);
    let basic = monthlyBasic;
    for (let y = 0; y < years; y++) {
      const yearly = Math.max(0, monthlyContribution(basic)) * 12;
      // Contributions arrive through the year, so on average earn half a year of interest.
      balance = balance * (1 + rate) + yearly * (1 + rate / 2);
      basic *= 1 + growth;
    }
    return { years, corpus: balance, real: balance / Math.pow(1 + inflation, years) };
  }, [value, interestRate]);

  return (
    <div className="space-y-4 border border-line-soft bg-slate-50/60 rounded-xl p-4">
      <div>
        <p className="text-sm font-medium text-ink-2">Employees' Provident Fund</p>
        <p className="text-xs text-slate-500 mt-0.5">Enter your passbook balances; Current Value follows their total.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="UAN">
          <input type="text" inputMode="numeric" value={value.uan ?? ''} onChange={(e) => set({ uan: e.target.value || undefined })} className={inputClasses} placeholder="12-digit UAN" />
        </Field>
        <Field label="Employer / establishment">
          <input type="text" value={value.employer ?? ''} onChange={(e) => set({ employer: e.target.value || undefined })} className={inputClasses} />
        </Field>
        <Field label="Joining date">
          <DateInput value={value.joiningDate ?? ''} onChange={(v) => set({ joiningDate: v || undefined })} max={todayIso} className={inputClasses} />
        </Field>
        <Field label="Interest rate (% p.a.)" hint={`Declared EPF rate is currently ${DEFAULT_EPF_RATE}%.`}>
          <input type="number" step="any" min={0} value={interestRate} onChange={(e) => onInterestRateChange(e.target.value)} className={inputClasses} placeholder={String(DEFAULT_EPF_RATE)} />
        </Field>
        <Field label="Employee balance (incl. VPF)">
          <input type="number" step="any" min={0} value={value.employeeBalance ?? ''} onChange={(e) => set({ employeeBalance: num(e.target.value) })} className={inputClasses} />
        </Field>
        <Field label="Employer balance">
          <input type="number" step="any" min={0} value={value.employerBalance ?? ''} onChange={(e) => set({ employerBalance: num(e.target.value) })} className={inputClasses} />
        </Field>
        <Field label="Balance as of">
          <DateInput value={value.balanceAsOf ?? ''} onChange={(v) => set({ balanceAsOf: v || undefined })} max={todayIso} className={inputClasses} />
        </Field>
        <Field label="Monthly Basic + DA">
          <input type="number" step="any" min={0} value={value.monthlyBasic ?? ''} onChange={(e) => set({ monthlyBasic: num(e.target.value) })} className={inputClasses} />
        </Field>
        <Field label="Employee contribution (%)">
          <input type="number" step="any" min={0} value={value.employeePct ?? ''} onChange={(e) => set({ employeePct: num(e.target.value) })} className={inputClasses} placeholder="12" />
        </Field>
        <Field label="Employer contribution (%)">
          <input type="number" step="any" min={0} value={value.employerPct ?? ''} onChange={(e) => set({ employerPct: num(e.target.value) })} className={inputClasses} placeholder="12" />
        </Field>
        <Field label="Voluntary (VPF) contribution (%)">
          <input type="number" step="any" min={0} value={value.vpfPct ?? ''} onChange={(e) => set({ vpfPct: num(e.target.value) })} className={inputClasses} placeholder="0" />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Current age">
          <input type="number" min={0} value={value.currentAge ?? ''} onChange={(e) => set({ currentAge: num(e.target.value) })} className={inputClasses} />
        </Field>
        <Field label="Retirement age">
          <input type="number" min={0} value={value.retirementAge ?? ''} onChange={(e) => set({ retirementAge: num(e.target.value) })} className={inputClasses} placeholder="58" />
        </Field>
        <Field label="Yearly salary growth (%)">
          <input type="number" step="any" min={0} value={value.salaryGrowthPct ?? ''} onChange={(e) => set({ salaryGrowthPct: num(e.target.value) })} className={inputClasses} />
        </Field>
        <Field label="Inflation (%)">
          <input type="number" step="any" min={0} value={value.inflationPct ?? ''} onChange={(e) => set({ inflationPct: num(e.target.value) })} className={inputClasses} />
        </Field>
      </div>

      {projection && (
        <div className="space-y-1.5">
          <Row label={`Projected corpus in ${projection.years} years`} value={formatCurrency(Math.round(projection.corpus), currency)} strong />
          {(value.inflationPct ?? 0) > 0 && <Row label="In today's money" value={formatCurrency(Math.round(projection.real), currency)} />}
        </div>
      )}
    </div>
  );
}
