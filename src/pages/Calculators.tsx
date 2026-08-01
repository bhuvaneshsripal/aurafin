import { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft,
  TrendingUp,
  Calendar,
  Coins,
  LineChart as LineChartIcon,
  Landmark,
  Wallet,
  PiggyBank,
  Layers,
  Plus,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import ProBadge from '../components/pro/ProBadge';

type CalcKey = 'xirr' | 'sip' | 'lumpsum' | 'phased' | 'cagr' | 'emi' | 'swp' | 'retirement' | 'fd';

interface CalcDef {
  key: CalcKey;
  label: string;
  description: string;
  icon: LucideIcon;
  soon?: boolean;
  pro?: boolean;
}

interface CalcGroup {
  title: string;
  items: CalcDef[];
}

const GROUPS: CalcGroup[] = [
  {
    title: 'Returns',
    items: [
      {
        key: 'xirr',
        label: 'XIRR Calculator',
        description: 'Annualized return on SIPs and irregular investments.',
        icon: LineChartIcon,
      },
      {
        key: 'sip',
        label: 'SIP Calculator',
        description: 'Project the future value of a monthly SIP, with optional step-up.',
        icon: Calendar,
      },
      {
        key: 'lumpsum',
        label: 'Lumpsum Calculator',
        description: 'Growth of a one-time investment over time.',
        icon: Coins,
      },
      {
        key: 'phased',
        label: 'Phased Investment Calculator',
        description: 'One fund where your monthly investment changes across year ranges (e.g. 1–3, 3–13, 13–20).',
        icon: Layers,
        pro: true,
      },
      {
        key: 'cagr',
        label: 'CAGR Calculator',
        description: 'Compound annual growth rate between two values.',
        icon: TrendingUp,
      },
    ],
  },
  {
    title: 'Loans',
    items: [
      {
        key: 'emi',
        label: 'EMI Calculator',
        description: 'Monthly instalment, total interest, and principal breakup.',
        icon: Landmark,
      },
    ],
  },
  {
    title: 'Planning',
    items: [
      {
        key: 'swp',
        label: 'SWP with Inflation',
        description: 'How long your corpus lasts with inflation-linked withdrawals.',
        icon: Wallet,
      },
      {
        key: 'retirement',
        label: 'Retirement Calculator',
        description: 'The corpus you need and the SIP to reach it.',
        icon: PiggyBank,
      },
      {
        key: 'fd',
        label: 'FD Calculator',
        description: 'Maturity value of a fixed deposit.',
        icon: Coins,
      },
    ],
  },
];

const ALL_CALCS = GROUPS.flatMap((g) => g.items);

export default function Calculators() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCalc = searchParams.get('calc') as CalcKey | null;
  const [active, setActiveState] = useState<CalcKey | null>(
    urlCalc && ALL_CALCS.some((c) => c.key === urlCalc) ? urlCalc : null
  );
  const didMountRef = useRef(false);

  // Local state -> URL (?calc=). The initial sync replaces so it doesn't add
  // an extra Back stop; opening/closing a calculator afterwards pushes, so
  // Back steps out of a calculator one at a time instead of leaving the page.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (active) next.set('calc', active);
    else next.delete('calc');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: !didMountRef.current });
    }
    didMountRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // URL -> local state (Back/Forward navigation, manual refresh).
  useEffect(() => {
    const fromUrl = searchParams.get('calc') as CalcKey | null;
    const resolved = fromUrl && ALL_CALCS.some((c) => c.key === fromUrl) ? fromUrl : null;
    if (resolved !== active) setActiveState(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setActive = (key: CalcKey | null) => setActiveState(key);
  const activeCalc = ALL_CALCS.find((c) => c.key === active);

  if (activeCalc) {
    return (
      <div className="space-y-6 max-w-4xl">
        <button
          onClick={() => setActive(null)}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-brand-600 dark:hover:text-brand-300"
        >
          <ArrowLeft size={16} /> Back to Calculators
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{activeCalc.label}</h1>
            {activeCalc.pro && <ProBadge />}
          </div>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">{activeCalc.description}</p>
        </div>
        {active === 'xirr' && <XirrCalculator />}
        {active === 'sip' && <SipCalculator />}
        {active === 'lumpsum' && <LumpsumCalculator />}
        {active === 'phased' && <PhasedCalculator />}
        {active === 'cagr' && <CagrCalculator />}
        {active === 'emi' && <EmiCalculator />}
        {active === 'swp' && <SwpCalculator />}
        {active === 'retirement' && <RetirementCalculator />}
        {active === 'fd' && <FdCalculator />}
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Calculators</h1>
        <p className="text-slate-500 dark:text-slate-400 text-base mt-1">
          Project how your investments could grow over time.
        </p>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {group.title}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {group.items.map((c) => {
              const Icon = c.icon;
              return (
                <button
                  key={c.key}
                  disabled={c.soon}
                  onClick={() => !c.soon && setActive(c.key)}
                  className={`text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-start gap-4 transition-colors ${
                    c.soon
                      ? 'opacity-60 cursor-not-allowed'
                      : 'hover:border-brand-400 dark:hover:border-brand-600 hover:bg-brand-50/40 dark:hover:bg-brand-900/30'
                  }`}
                >
                  <div className="h-10 w-10 rounded-xl bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-300 shrink-0">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">{c.label}</p>
                      {c.pro && <ProBadge size="xs" />}
                      {c.soon && (
                        <span className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-full">
                          Soon
                        </span>
                      )}
                      {!c.soon && <span className="text-slate-300 dark:text-slate-600 ml-auto">→</span>}
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{c.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalcShell({
  inputs,
  result,
  chartData,
}: {
  inputs: React.ReactNode;
  result: React.ReactNode;
  chartData: { year: number; value: number }[];
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">{inputs}</div>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        {result}
        {chartData.length > 1 && (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={70} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="value" stroke="#16a35d" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function SipCalculator() {
  const [monthly, setMonthly] = useState('10000');
  const [rate, setRate] = useState('12');
  const [years, setYears] = useState('10');
  const [stepUp, setStepUp] = useState('0');

  const { chartData, invested, maturity } = useMemo(() => {
    const P = Number(monthly) || 0;
    const annualRate = Number(rate) || 0;
    const n = Number(years) || 0;
    const stepUpPct = Number(stepUp) || 0;
    const monthlyRate = annualRate / 12 / 100;

    let balance = 0;
    let totalInvested = 0;
    let currentMonthly = P;
    const data: { year: number; value: number }[] = [{ year: 0, value: 0 }];

    for (let year = 1; year <= n; year++) {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + monthlyRate) + currentMonthly;
        totalInvested += currentMonthly;
      }
      data.push({ year, value: Math.round(balance) });
      currentMonthly = currentMonthly * (1 + stepUpPct / 100);
    }

    return { chartData: data, invested: Math.round(totalInvested), maturity: Math.round(balance) };
  }, [monthly, rate, years, stepUp]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">SIP Details</h2>
          <Field label="Monthly Investment">
            <input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Expected Annual Return (%)">
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Duration (Years)">
            <input type="number" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Annual Step-Up (%, optional)">
            <input type="number" value={stepUp} onChange={(e) => setStepUp(e.target.value)} className={inputClass} />
          </Field>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Projected Value</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Invested</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(invested)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Maturity Value</p>
              <p className="text-xl font-bold text-brand-600 dark:text-brand-300">{formatCurrency(maturity)}</p>
            </div>
          </div>
        </>
      }
      chartData={chartData}
    />
  );
}

function LumpsumCalculator() {
  const [principal, setPrincipal] = useState('100000');
  const [rate, setRate] = useState('12');
  const [years, setYears] = useState('10');

  const { chartData, maturity } = useMemo(() => {
    const P = Number(principal) || 0;
    const r = (Number(rate) || 0) / 100;
    const n = Number(years) || 0;
    const data: { year: number; value: number }[] = [];
    for (let year = 0; year <= n; year++) {
      data.push({ year, value: Math.round(P * Math.pow(1 + r, year)) });
    }
    return { chartData: data, maturity: Math.round(P * Math.pow(1 + r, n)) };
  }, [principal, rate, years]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Lumpsum Details</h2>
          <Field label="Investment Amount">
            <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Expected Annual Return (%)">
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Duration (Years)">
            <input type="number" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
          </Field>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Projected Value</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Maturity Value</p>
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-300">{formatCurrency(maturity)}</p>
        </>
      }
      chartData={chartData}
    />
  );
}

interface Phase {
  id: number;
  amount: string;
  from: string;
  to: string;
}

function PhasedCalculator() {
  const [phases, setPhases] = useState<Phase[]>([
    { id: 1, amount: '1000', from: '1', to: '3' },
    { id: 2, amount: '5000', from: '3', to: '13' },
    { id: 3, amount: '10000', from: '13', to: '20' },
  ]);
  const [rate, setRate] = useState('12');
  const nextId = useMemo(() => Math.max(0, ...phases.map((p) => p.id)) + 1, [phases]);

  const addPhase = () => {
    const lastTo = phases.length ? phases[phases.length - 1].to : '0';
    setPhases((prev) => [...prev, { id: nextId, amount: '', from: lastTo, to: '' }]);
  };
  const removePhase = (id: number) => {
    setPhases((prev) => prev.filter((p) => p.id !== id));
  };
  const updatePhase = (id: number, field: 'amount' | 'from' | 'to', value: string) => {
    setPhases((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const { chartData, invested, maturity, gain, totalYears, breakdown } = useMemo(() => {
    const annualRate = (Number(rate) || 0) / 100;
    const monthlyRate = annualRate / 12;

    const ranges = phases
      .map((p) => ({
        amount: Number(p.amount) || 0,
        from: Number(p.from) || 0,
        to: Number(p.to) || 0,
      }))
      .filter((p) => p.amount > 0 && p.to > p.from)
      .map((p) => ({ ...p, fromMonth: Math.round(p.from * 12), toMonth: Math.round(p.to * 12) }));

    const n = ranges.length ? Math.max(...ranges.map((r) => r.to)) : 0;
    const totalMonths = Math.round(n * 12);

    let balance = 0;
    let totalInvested = 0;
    const data: { year: number; value: number }[] = [{ year: 0, value: 0 }];

    // Same fund, compounding every month; the monthly contribution just changes
    // depending on which phase (year range) that month falls into.
    for (let month = 1; month <= totalMonths; month++) {
      const activePhase = ranges.find((r) => month > r.fromMonth && month <= r.toMonth);
      const monthlyAmount = activePhase ? activePhase.amount : 0;

      balance = balance * (1 + monthlyRate) + monthlyAmount;
      totalInvested += monthlyAmount;

      if (month % 12 === 0) {
        data.push({ year: month / 12, value: Math.round(balance) });
      }
    }
    if (data[data.length - 1]?.year !== n) {
      data.push({ year: n, value: Math.round(balance) });
    }

    const withInvested = ranges.map((r) => ({
      amount: r.amount,
      from: r.from,
      to: r.to,
      monthsInvested: r.toMonth - r.fromMonth,
      totalInvested: r.amount * (r.toMonth - r.fromMonth),
    }));

    return {
      chartData: data,
      invested: Math.round(totalInvested),
      maturity: Math.round(balance),
      gain: Math.round(balance - totalInvested),
      totalYears: n,
      breakdown: withInvested,
    };
  }, [phases, rate]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Investment Phases</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">
            One fund, monthly investment that changes over time. Example: ₹1,000/month from year 1 to 3, then
            ₹5,000/month from year 3 to 13, then ₹10,000/month from year 13 to 20 — everything compounds together.
          </p>

          <div className="space-y-2">
            {phases.map((p, i) => (
              <div key={p.id} className="flex items-end gap-2">
                <Field label={i === 0 ? 'Monthly Amount' : ''}>
                  <input
                    type="number"
                    placeholder="Amount"
                    value={p.amount}
                    onChange={(e) => updatePhase(p.id, 'amount', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label={i === 0 ? 'From Year' : ''}>
                  <input
                    type="number"
                    placeholder="From"
                    value={p.from}
                    onChange={(e) => updatePhase(p.id, 'from', e.target.value)}
                    className={`${inputClass} w-20`}
                  />
                </Field>
                <Field label={i === 0 ? 'To Year' : ''}>
                  <input
                    type="number"
                    placeholder="To"
                    value={p.to}
                    onChange={(e) => updatePhase(p.id, 'to', e.target.value)}
                    className={`${inputClass} w-20`}
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => removePhase(p.id)}
                  disabled={phases.length <= 1}
                  className="mb-0.5 h-[42px] w-10 shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-300 dark:hover:border-red-700 disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="Remove phase"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addPhase}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-300 hover:text-brand-700"
          >
            <Plus size={16} /> Add another phase
          </button>

          <Field label="Expected Annual Return (%)">
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </Field>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Projected Value</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total Invested</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(invested)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Maturity Value (Year {totalYears})</p>
              <p className="text-xl font-bold text-brand-600 dark:text-brand-300">{formatCurrency(maturity)}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Estimated Gain</p>
            <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(gain)}</p>
          </div>
          {breakdown.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                Breakdown by phase
              </p>
              {breakdown.map((b, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">
                    Year {b.from}–{b.to}: {formatCurrency(b.amount)}/mo
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {formatCurrency(b.totalInvested)} invested
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      }
      chartData={chartData}
    />
  );
}

function FdCalculator() {
  const [principal, setPrincipal] = useState('100000');
  const [rate, setRate] = useState('7');
  const [years, setYears] = useState('5');
  const [compounding, setCompounding] = useState('4');

  const { chartData, maturity } = useMemo(() => {
    const P = Number(principal) || 0;
    const r = (Number(rate) || 0) / 100;
    const n = Number(years) || 0;
    const c = Number(compounding) || 1;
    const data: { year: number; value: number }[] = [];
    for (let year = 0; year <= n; year++) {
      data.push({ year, value: Math.round(P * Math.pow(1 + r / c, c * year)) });
    }
    return { chartData: data, maturity: Math.round(P * Math.pow(1 + r / c, c * n)) };
  }, [principal, rate, years, compounding]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Fixed Deposit Details</h2>
          <Field label="Deposit Amount">
            <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Interest Rate (%)">
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Tenure (Years)">
            <input type="number" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Compounding Frequency (times/year)">
            <select value={compounding} onChange={(e) => setCompounding(e.target.value)} className={inputClass}>
              <option value="1">Annually</option>
              <option value="2">Half-Yearly</option>
              <option value="4">Quarterly</option>
              <option value="12">Monthly</option>
            </select>
          </Field>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Projected Value</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Maturity Value</p>
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-300">{formatCurrency(maturity)}</p>
        </>
      }
      chartData={chartData}
    />
  );
}

function CagrCalculator() {
  const [initial, setInitial] = useState('100000');
  const [final, setFinal] = useState('200000');
  const [years, setYears] = useState('5');

  const { cagr, chartData } = useMemo(() => {
    const I = Number(initial) || 0;
    const F = Number(final) || 0;
    const n = Number(years) || 0;
    const rate = I > 0 && n > 0 ? Math.pow(F / I, 1 / n) - 1 : 0;
    const data: { year: number; value: number }[] = [];
    for (let year = 0; year <= n; year++) {
      data.push({ year, value: Math.round(I * Math.pow(1 + rate, year)) });
    }
    return { cagr: rate * 100, chartData: data };
  }, [initial, final, years]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">CAGR Details</h2>
          <Field label="Initial Value">
            <input type="number" value={initial} onChange={(e) => setInitial(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Final Value">
            <input type="number" value={final} onChange={(e) => setFinal(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Duration (Years)">
            <input type="number" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
          </Field>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Result</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Compound Annual Growth Rate</p>
          <p className="text-2xl font-bold text-brand-600 dark:text-brand-300">
            {Number.isFinite(cagr) ? cagr.toFixed(2) : '0.00'}%
          </p>
        </>
      }
      chartData={chartData}
    />
  );
}

function EmiCalculator() {
  const [principal, setPrincipal] = useState('2500000');
  const [rate, setRate] = useState('9');
  const [years, setYears] = useState('20');

  const { emi, totalInterest, totalPayment, chartData } = useMemo(() => {
    const P = Number(principal) || 0;
    const annualRate = Number(rate) || 0;
    const n = (Number(years) || 0) * 12;
    const r = annualRate / 12 / 100;
    const monthlyEmi = r > 0 && n > 0 ? (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : 0;
    const total = monthlyEmi * n;
    const interest = total - P;

    const data: { year: number; value: number }[] = [];
    let balance = P;
    data.push({ year: 0, value: Math.round(balance) });
    for (let year = 1; year <= Number(years); year++) {
      for (let m = 0; m < 12; m++) {
        const interestPortion = balance * r;
        const principalPortion = monthlyEmi - interestPortion;
        balance = Math.max(0, balance - principalPortion);
      }
      data.push({ year, value: Math.round(balance) });
    }

    return {
      emi: Math.round(monthlyEmi),
      totalInterest: Math.round(interest),
      totalPayment: Math.round(total),
      chartData: data,
    };
  }, [principal, rate, years]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Loan Details</h2>
          <Field label="Loan Amount">
            <input type="number" value={principal} onChange={(e) => setPrincipal(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Interest Rate (% p.a.)">
            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Tenure (Years)">
            <input type="number" value={years} onChange={(e) => setYears(e.target.value)} className={inputClass} />
          </Field>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">EMI Breakup</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Monthly EMI</p>
              <p className="text-xl font-bold text-brand-600 dark:text-brand-300">{formatCurrency(emi)}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Interest</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatCurrency(totalInterest)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Payment</p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white">{formatCurrency(totalPayment)}</p>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">Remaining loan balance by year, below.</p>
        </>
      }
      chartData={chartData}
    />
  );
}

interface Cashflow {
  id: number;
  date: string;
  amount: string;
}

function xirrRate(cashflows: { date: Date; amount: number }[]): number | null {
  if (cashflows.length < 2) return null;
  const t0 = cashflows[0].date.getTime();
  const years = cashflows.map((c) => (c.date.getTime() - t0) / (365 * 24 * 3600 * 1000));

  const npv = (rate: number) =>
    cashflows.reduce((sum, c, i) => sum + c.amount / Math.pow(1 + rate, years[i]), 0);
  const dnpv = (rate: number) =>
    cashflows.reduce(
      (sum, c, i) => sum - (years[i] * c.amount) / Math.pow(1 + rate, years[i] + 1),
      0
    );

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) {
      rate = next;
      break;
    }
    rate = next;
  }
  return Number.isFinite(rate) ? rate : null;
}

function XirrCalculator() {
  const today = new Date().toISOString().slice(0, 10);
  const [flows, setFlows] = useState<Cashflow[]>([{ id: 1, date: today, amount: '-100000' }]);
  const [currentValue, setCurrentValue] = useState('130000');
  const [currentDate, setCurrentDate] = useState(today);

  const addFlow = () => {
    setFlows((prev) => [...prev, { id: Date.now(), date: today, amount: '-10000' }]);
  };
  const removeFlow = (id: number) => setFlows((prev) => prev.filter((f) => f.id !== id));
  const updateFlow = (id: number, patch: Partial<Cashflow>) =>
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const rate = useMemo(() => {
    const cfs = [
      ...flows
        .filter((f) => f.date && Number(f.amount))
        .map((f) => ({ date: new Date(f.date), amount: Number(f.amount) })),
      { date: new Date(currentDate), amount: Number(currentValue) || 0 },
    ].sort((a, b) => a.date.getTime() - b.date.getTime());
    return xirrRate(cfs);
  }, [flows, currentValue, currentDate]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Cash Flows</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">
          Enter each investment as a negative amount on the date you invested.
        </p>
        {flows.map((f) => (
          <div key={f.id} className="flex items-center gap-2">
            <input
              type="date"
              value={f.date}
              onChange={(e) => updateFlow(f.id, { date: e.target.value })}
              className={inputClass}
            />
            <input
              type="number"
              value={f.amount}
              onChange={(e) => updateFlow(f.id, { amount: e.target.value })}
              className={inputClass}
              placeholder="Amount"
            />
            <button
              onClick={() => removeFlow(f.id)}
              disabled={flows.length === 1}
              className="text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-30 shrink-0 text-sm px-2"
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={addFlow} className="text-sm font-medium text-brand-600 dark:text-brand-300 hover:text-brand-700 dark:hover:text-brand-300">
          + Add cash flow
        </button>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
          <Field label="Current Value (positive)">
            <input
              type="number"
              value={currentValue}
              onChange={(e) => setCurrentValue(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="As of Date">
            <input
              type="date"
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Result</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Annualized Return (XIRR)</p>
        <p className="text-2xl font-bold text-brand-600 dark:text-brand-300">
          {rate !== null ? `${(rate * 100).toFixed(2)}%` : '—'}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          Based on the timing and size of each cash flow entered, plus the current value.
        </p>
      </div>
    </div>
  );
}

function SwpCalculator() {
  const [corpus, setCorpus] = useState('5000000');
  const [withdrawal, setWithdrawal] = useState('30000');
  const [returnRate, setReturnRate] = useState('8');
  const [inflation, setInflation] = useState('6');

  const { chartData, lastsYears, depleted, endingBalance } = useMemo(() => {
    const P = Number(corpus) || 0;
    const monthlyReturn = (Number(returnRate) || 0) / 12 / 100;
    const annualInflation = (Number(inflation) || 0) / 100;
    const MAX_YEARS = 50;

    let balance = P;
    let monthlyWithdrawal = Number(withdrawal) || 0;
    const data: { year: number; value: number }[] = [{ year: 0, value: Math.round(balance) }];
    let yearsLasted = MAX_YEARS;
    let ranOut = false;

    outer: for (let year = 1; year <= MAX_YEARS; year++) {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + monthlyReturn) - monthlyWithdrawal;
        if (balance <= 0) {
          balance = 0;
          yearsLasted = year - 1 + (m + 1) / 12;
          ranOut = true;
          data.push({ year: Math.round(yearsLasted * 10) / 10, value: 0 });
          break outer;
        }
      }
      data.push({ year, value: Math.round(balance) });
      monthlyWithdrawal = monthlyWithdrawal * (1 + annualInflation);
    }

    return {
      chartData: data,
      lastsYears: Math.round(yearsLasted * 10) / 10,
      depleted: ranOut,
      endingBalance: Math.round(balance),
    };
  }, [corpus, withdrawal, returnRate, inflation]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Withdrawal Plan</h2>
          <Field label="Starting Corpus">
            <input type="number" value={corpus} onChange={(e) => setCorpus(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Monthly Withdrawal (today's value)">
            <input
              type="number"
              value={withdrawal}
              onChange={(e) => setWithdrawal(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Expected Annual Return (%)">
            <input
              type="number"
              value={returnRate}
              onChange={(e) => setReturnRate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Inflation Rate (%, withdrawal grows each year)">
            <input
              type="number"
              value={inflation}
              onChange={(e) => setInflation(e.target.value)}
              className={inputClass}
            />
          </Field>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Result</h2>
          {depleted ? (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">Corpus lasts</p>
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-300">{lastsYears} years</p>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500 dark:text-slate-400">Balance after 50 years</p>
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-300">{formatCurrency(endingBalance)}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Your corpus outlasts the 50-year projection window at this withdrawal rate.
              </p>
            </>
          )}
        </>
      }
      chartData={chartData}
    />
  );
}

function RetirementCalculator() {
  const [currentAge, setCurrentAge] = useState('30');
  const [retireAge, setRetireAge] = useState('60');
  const [lifeExpectancy, setLifeExpectancy] = useState('85');
  const [monthlyExpense, setMonthlyExpense] = useState('50000');
  const [inflation, setInflation] = useState('6');
  const [preReturn, setPreReturn] = useState('12');
  const [postReturn, setPostReturn] = useState('7');
  const [currentSavings, setCurrentSavings] = useState('500000');

  const { corpusNeeded, requiredSip, chartData } = useMemo(() => {
    const age = Number(currentAge) || 0;
    const rAge = Number(retireAge) || 0;
    const life = Number(lifeExpectancy) || 0;
    const yearsToRetirement = Math.max(0, rAge - age);
    const yearsInRetirement = Math.max(0, life - rAge);
    const g = (Number(inflation) || 0) / 100;
    const preR = (Number(preReturn) || 0) / 100;
    const postR = (Number(postReturn) || 0) / 100;

    // Monthly expense projected to the retirement date.
    const expenseAtRetirement = (Number(monthlyExpense) || 0) * 12 * Math.pow(1 + g, yearsToRetirement);

    // Present value (at retirement) of a growing annuity of expenses through retirement.
    let corpus: number;
    if (yearsInRetirement <= 0) {
      corpus = 0;
    } else if (Math.abs(postR - g) < 1e-9) {
      corpus = expenseAtRetirement * yearsInRetirement;
    } else {
      const ratio = Math.pow((1 + g) / (1 + postR), yearsInRetirement);
      corpus = (expenseAtRetirement * (1 - ratio)) / (postR - g);
    }

    // Future value of current savings by retirement.
    const fvCurrentSavings = (Number(currentSavings) || 0) * Math.pow(1 + preR, yearsToRetirement);
    const shortfall = Math.max(0, corpus - fvCurrentSavings);

    // Monthly SIP required to reach the shortfall by retirement.
    const n = yearsToRetirement * 12;
    const i = preR / 12;
    let sip = 0;
    if (n > 0) {
      const factor = i > 0 ? ((Math.pow(1 + i, n) - 1) / i) * (1 + i) : n;
      sip = factor > 0 ? shortfall / factor : 0;
    }

    // Corpus balance during retirement (depletion chart).
    const data: { year: number; value: number }[] = [];
    let balance = corpus;
    let expense = expenseAtRetirement / 12;
    data.push({ year: 0, value: Math.round(balance) });
    for (let year = 1; year <= yearsInRetirement; year++) {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + postR / 12) - expense;
      }
      data.push({ year, value: Math.round(Math.max(0, balance)) });
      expense = expense * (1 + g);
    }

    return { corpusNeeded: Math.round(corpus), requiredSip: Math.round(sip), chartData: data };
  }, [currentAge, retireAge, lifeExpectancy, monthlyExpense, inflation, preReturn, postReturn, currentSavings]);

  return (
    <CalcShell
      inputs={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Your Plan</h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current Age">
              <input type="number" value={currentAge} onChange={(e) => setCurrentAge(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Retirement Age">
              <input type="number" value={retireAge} onChange={(e) => setRetireAge(e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Life Expectancy (Age)">
            <input
              type="number"
              value={lifeExpectancy}
              onChange={(e) => setLifeExpectancy(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Current Monthly Expense">
            <input
              type="number"
              value={monthlyExpense}
              onChange={(e) => setMonthlyExpense(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Current Savings (towards retirement)">
            <input
              type="number"
              value={currentSavings}
              onChange={(e) => setCurrentSavings(e.target.value)}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Inflation (%)">
              <input type="number" value={inflation} onChange={(e) => setInflation(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Pre-retirement Return (%)">
              <input type="number" value={preReturn} onChange={(e) => setPreReturn(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Post-retirement Return (%)">
              <input type="number" value={postReturn} onChange={(e) => setPostReturn(e.target.value)} className={inputClass} />
            </Field>
          </div>
        </>
      }
      result={
        <>
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Result</h2>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Corpus Needed at Retirement</p>
              <p className="text-xl font-bold text-brand-600 dark:text-brand-300">{formatCurrency(corpusNeeded)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Monthly SIP Required</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(requiredSip)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Corpus balance through retirement, assuming expenses keep rising with inflation, below.
          </p>
        </>
      }
      chartData={chartData}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';
