import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardHeader, Input, StatCard, chart } from '../../components/ui';
import Amount from '../../components/Amount';
import { useFinancialProfileStore } from '../../store/financialProfileStore';
import { formatAxisAmount, formatCompact, hideNumber } from '../../utils/privateFormat';
import { runProjection, suggestAssumptions } from '../../utils/projection';
import { coastNumber, runRetirement, sustainableSpend } from '../../utils/retirement';
import type { AnalyticsData } from './useAnalyticsData';

function Num({ label, value, onChange, suffix, step = 1 }: { label: string; value: string; onChange: (v: string) => void; suffix?: string; step?: number }) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <div className="relative">
        <Input type="number" inputMode="decimal" step={step} value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint">{suffix}</span>}
      </div>
    </label>
  );
}

const n = (s: string, d: number) => (s.trim() === '' || !Number.isFinite(Number(s)) ? d : Number(s));

/** Retirement drawdown: will the corpus last, and how much can safely be spent? */
export default function RetirementTab({ data }: { data: AnalyticsData }) {
  const { allocation, currency } = data;
  const profile = useFinancialProfileStore((s) => s.profile);
  const sugg = useMemo(() => suggestAssumptions(allocation.slices), [allocation.slices]);

  const [age, setAge] = useState(profile?.age ? String(profile.age) : '30');
  const [retireAge, setRetireAge] = useState('50');
  const [endAge, setEndAge] = useState('90');
  const [expense, setExpense] = useState(profile?.monthlyExpense ? String(profile.monthlyExpense) : '');
  const [income, setIncome] = useState('');
  const [monthly, setMonthly] = useState(profile?.monthlySavings ? String(profile.monthlySavings) : '');
  const [stepUp, setStepUp] = useState('8');
  const [preRet, setPreRet] = useState('');
  const [postRet, setPostRet] = useState('9');
  const [postVol, setPostVol] = useState('10');
  const [infl, setInfl] = useState('6');
  const [corpusOverride, setCorpusOverride] = useState('');

  const ageN = n(age, 30);
  const retireN = Math.max(ageN, n(retireAge, 50));
  const yearsToRetire = Math.round(retireN - ageN);
  const retYears = Math.max(1, Math.round(n(endAge, 90) - retireN));
  const monthlyExpense = n(expense, 0);
  const annualExpense = monthlyExpense * 12;
  const inflN = n(infl, 6);

  // Corpus at retirement: median of the accumulation phase unless overridden.
  const accumulation = useMemo(
    () =>
      yearsToRetire > 0
        ? runProjection({
            startValue: Math.round(allocation.total),
            monthlyContribution: n(monthly, 0),
            stepUpPct: n(stepUp, 0),
            returnPct: n(preRet, sugg.ret),
            volPct: sugg.vol,
            years: yearsToRetire,
            inflationPct: inflN,
            targetToday: 0,
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allocation.total, monthly, stepUp, preRet, sugg.ret, sugg.vol, yearsToRetire, inflN]
  );
  const corpus = n(corpusOverride, accumulation ? accumulation.finalP50 : allocation.total);

  const base = {
    corpus,
    annualExpenseToday: annualExpense,
    yearsToRetire,
    retirementYears: retYears,
    returnPct: n(postRet, 9),
    volPct: n(postVol, 10),
    inflationPct: inflN,
    otherIncomeToday: n(income, 0) * 12,
  };
  const sim = useMemo(
    () => runRetirement(base),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [corpus, annualExpense, yearsToRetire, retYears, postRet, postVol, inflN, income]
  );
  const safeSpend = useMemo(
    () => (annualExpense > 0 ? sustainableSpend(base, 0.9) : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [corpus, yearsToRetire, retYears, postRet, postVol, inflN]
  );

  // FI number today's money at a 90%-confidence spend rate; Coast = what you'd need now to coast.
  const swr = base.corpus > 0 && safeSpend > 0 ? (safeSpend / (corpus / Math.pow(1 + inflN / 100, yearsToRetire))) * 100 : 0;
  const fiToday = swr > 0 ? ((annualExpense - base.otherIncomeToday) * 100) / swr : 0;
  const coast = fiToday > 0 ? coastNumber(fiToday, yearsToRetire, n(preRet, sugg.ret), inflN) : 0;
  const coasting = coast > 0 && allocation.total >= coast;

  const prob = Math.round(sim.successProb * 100);
  const tone = prob >= 85 ? 'positive' : prob >= 65 ? 'default' : 'negative';
  const rows = sim.points.map((p) => ({ age: Math.round(retireN) + p.year, band: [p.p10, p.p90] as [number, number], Median: p.p50 }));

  if (monthlyExpense <= 0) {
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader title="Retirement planner" description="Enter your monthly expenses to see whether your money would last." />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Num label="Current age" value={age} onChange={setAge} />
            <Num label="Retire at" value={retireAge} onChange={setRetireAge} />
            <Num label="Plan until age" value={endAge} onChange={setEndAge} />
            <Num label="Monthly expenses today" value={expense} onChange={setExpense} suffix="/mo" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Retirement planner" description={`${yearsToRetire} years of saving, then ${retYears} years of spending. Corpus at retirement defaults to the median of your projection.`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Current age" value={age} onChange={setAge} />
          <Num label="Retire at" value={retireAge} onChange={setRetireAge} />
          <Num label="Plan until age" value={endAge} onChange={setEndAge} />
          <Num label="Monthly expenses today" value={expense} onChange={setExpense} suffix="/mo" />
          <Num label="Pension / rent after retiring" value={income} onChange={setIncome} suffix="/mo" />
          <Num label="Monthly investment" value={monthly} onChange={setMonthly} suffix="/mo" />
          <Num label="Yearly step-up" value={stepUp} onChange={setStepUp} suffix="%" />
          <Num label="Return before retiring" value={preRet} onChange={setPreRet} suffix={`% (${sugg.ret})`} step={0.5} />
          <Num label="Return after retiring" value={postRet} onChange={setPostRet} suffix="%" step={0.5} />
          <Num label="Volatility after retiring" value={postVol} onChange={setPostVol} suffix="%" step={0.5} />
          <Num label="Inflation" value={infl} onChange={setInfl} suffix="%" step={0.5} />
          <Num label="Corpus at retirement" value={corpusOverride} onChange={setCorpusOverride} suffix={`${currency} (blank = projected)`} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Chance money lasts" value={hideNumber(`${prob}%`)} tone={tone} sublabel={`to age ${Math.round(n(endAge, 90))}`} />
        <StatCard label="Corpus at retirement" value={<Amount value={corpus} currency={currency} />} sublabel={`first-year draw ${hideNumber(`${sim.initialWithdrawalPct.toFixed(1)}%`)}`} />
        <StatCard label="Safe spend (90% sure)" value={<><Amount value={safeSpend / 12} currency={currency} />/mo</>} sublabel="in today's money" />
        <StatCard label="Coast number" value={<Amount value={coast} currency={currency} />} tone={coasting ? 'positive' : 'default'} sublabel={coasting ? 'you have already passed it' : 'invested today, no more saving needed'} />
      </div>

      {sim.p10DepletionYear !== undefined && (
        <p className="rounded-xl bg-surface-hover px-4 py-3 text-sm text-ink">
          In the worst 1 in 10 runs the money is gone by age {Math.round(retireN) + sim.p10DepletionYear}. Lowering spending, retiring later or holding more growth assets improves this.
        </p>
      )}

      <Card>
        <CardHeader title="Corpus during retirement" description="2,000 simulated retirements. Each draws its own order of good and bad years, so a crash early on hurts more." />
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="age" tick={chart.tick} axisLine={false} tickLine={false} />
              <YAxis tick={chart.tick} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => formatAxisAmount(Number(v), currency)} />
              <Tooltip {...chart.tooltip} formatter={(v) => (Array.isArray(v) ? `${formatCompact(v[0], currency)} – ${formatCompact(v[1], currency)}` : formatCompact(Number(v), currency))} labelFormatter={(l) => `Age ${l}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="band" isAnimationActive={false} name="10th–90th pct" stroke="none" fill={chart.primary} fillOpacity={0.12} />
              <Line type="monotone" dataKey="Median" isAnimationActive={false} stroke={chart.primary} strokeWidth={2.25} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <p className="text-xs leading-relaxed text-muted">A simulation, not advice. Expenses are inflated every year and withdrawn at the start of the year. Taxes on withdrawals, healthcare shocks and changes in spending with age are not modelled.</p>
    </div>
  );
}
