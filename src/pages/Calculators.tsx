import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatCurrency } from '../utils/currency';

type CalcTab = 'sip' | 'lumpsum' | 'fd';

export default function Calculators() {
  const [tab, setTab] = useState<CalcTab>('sip');

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Calculators</h1>
        <p className="text-slate-500 text-base mt-1">
          Project how your investments could grow over time.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            ['sip', 'SIP'],
            ['lumpsum', 'Lumpsum'],
            ['fd', 'Fixed Deposit'],
          ] as [CalcTab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-base font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'sip' && <SipCalculator />}
      {tab === 'lumpsum' && <LumpsumCalculator />}
      {tab === 'fd' && <FdCalculator />}
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
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">{inputs}</div>
      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
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
          <h2 className="text-lg font-semibold text-slate-800">SIP Details</h2>
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
          <h2 className="text-lg font-semibold text-slate-800">Projected Value</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-slate-500">Invested</p>
              <p className="text-xl font-bold text-slate-900">{formatCurrency(invested)}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Maturity Value</p>
              <p className="text-xl font-bold text-brand-600">{formatCurrency(maturity)}</p>
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
          <h2 className="text-lg font-semibold text-slate-800">Lumpsum Details</h2>
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
          <h2 className="text-lg font-semibold text-slate-800">Projected Value</h2>
          <p className="text-sm text-slate-500">Maturity Value</p>
          <p className="text-2xl font-bold text-brand-600">{formatCurrency(maturity)}</p>
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
          <h2 className="text-lg font-semibold text-slate-800">Fixed Deposit Details</h2>
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
          <h2 className="text-lg font-semibold text-slate-800">Projected Value</h2>
          <p className="text-sm text-slate-500">Maturity Value</p>
          <p className="text-2xl font-bold text-brand-600">{formatCurrency(maturity)}</p>
        </>
      }
      chartData={chartData}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';
