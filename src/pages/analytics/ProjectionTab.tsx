import { useMemo, useState } from 'react';
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardHeader, Input, StatCard, chart } from '../../components/ui';
import Amount from '../../components/Amount';
import { useFinancialProfileStore } from '../../store/financialProfileStore';
import { formatAxisAmount, formatCompact } from '../../utils/currency';
import { runProjection, suggestAssumptions } from '../../utils/projection';
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

export default function ProjectionTab({ data }: { data: AnalyticsData }) {
  const { allocation, currency } = data;
  const profile = useFinancialProfileStore((s) => s.profile);
  const sugg = useMemo(() => suggestAssumptions(allocation.slices), [allocation.slices]);

  const defaultStart = Math.round(allocation.total);
  const monthlyExpense = profile?.monthlyExpense ?? 0;
  const [start, setStart] = useState('');
  const [monthly, setMonthly] = useState(profile?.monthlySavings ? String(profile.monthlySavings) : '');
  const [stepUp, setStepUp] = useState('8');
  const [ret, setRet] = useState('');
  const [vol, setVol] = useState('');
  const [years, setYears] = useState('20');
  const [infl, setInfl] = useState('6');
  const [swr, setSwr] = useState('3.5');
  const [targetOverride, setTargetOverride] = useState('');

  const n = (s: string, d: number) => (s.trim() === '' || !Number.isFinite(Number(s)) ? d : Number(s));
  const startValue = n(start, defaultStart);
  const swrN = Math.max(1, n(swr, 3.5));
  // FI number: today's annual expenses / safe-withdrawal rate.
  const fiToday = monthlyExpense > 0 ? (monthlyExpense * 12 * 100) / swrN : 0;
  const targetToday = n(targetOverride, fiToday);

  const result = useMemo(
    () =>
      runProjection({
        startValue,
        monthlyContribution: n(monthly, 0),
        stepUpPct: n(stepUp, 0),
        returnPct: n(ret, sugg.ret),
        volPct: n(vol, sugg.vol),
        years: n(years, 20),
        inflationPct: n(infl, 6),
        targetToday,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startValue, monthly, stepUp, ret, vol, years, infl, targetToday, sugg.ret, sugg.vol]
  );

  const rows = result.points.map((p) => ({ year: p.year, band: [p.p10, p.p90] as [number, number], Median: p.p50, Expected: p.expected, Target: p.target > 0 ? p.target : undefined }));
  const hasTarget = targetToday > 0;
  const prob = Math.round(result.successProb * 100);
  const probTone = prob >= 75 ? 'positive' : prob >= 50 ? 'default' : 'negative';

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Assumptions" description={`Your mix suggests about ${sugg.ret}% return with ${sugg.vol}% volatility. Leave blank to use that.`} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Num label="Starting value" value={start} onChange={setStart} suffix={currency} />
          <Num label="Monthly investment" value={monthly} onChange={setMonthly} suffix="/mo" />
          <Num label="Yearly step-up" value={stepUp} onChange={setStepUp} suffix="%" />
          <Num label="Years" value={years} onChange={setYears} />
          <Num label="Expected return" value={ret} onChange={setRet} suffix={`% (${sugg.ret})`} step={0.5} />
          <Num label="Volatility" value={vol} onChange={setVol} suffix={`% (${sugg.vol})`} step={0.5} />
          <Num label="Inflation" value={infl} onChange={setInfl} suffix="%" step={0.5} />
          <Num label="Safe withdrawal rate" value={swr} onChange={setSwr} suffix="%" step={0.25} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Num label={`Target corpus in today's money ${monthlyExpense > 0 ? `(blank = FI number from your ₹${formatCompact(monthlyExpense, currency)}/mo expenses)` : '(set monthly expenses in Essentials, or type one)'}`} value={targetOverride} onChange={setTargetOverride} suffix={currency} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Median outcome" value={<Amount value={result.finalP50} currency={currency} />} sublabel={`in ${years} yrs · ${formatCompact(result.finalP50Real, currency)} in today's money`} />
        <StatCard label="Bad case (10th pct)" value={<Amount value={result.finalP10} currency={currency} />} sublabel="9 in 10 runs did better" />
        <StatCard label="Good case (90th pct)" value={<Amount value={result.finalP90} currency={currency} />} sublabel="1 in 10 runs did better" />
        {hasTarget ? (
          <StatCard label="Chance of hitting target" value={`${prob}%`} tone={probTone} sublabel={result.medianYearsToTarget !== undefined ? `typically in ~${result.medianYearsToTarget} yrs` : 'not within the horizon in most runs'} />
        ) : (
          <StatCard label="Target" value="Not set" sublabel="add one above" />
        )}
      </div>

      <Card>
        <CardHeader title="Net worth projection" description="2,000 simulated futures. The shaded band covers the middle 80% of outcomes." />
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid stroke={chart.grid} vertical={false} />
              <XAxis dataKey="year" tick={chart.tick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}y`} />
              <YAxis tick={chart.tick} axisLine={false} tickLine={false} width={64} tickFormatter={(v) => formatAxisAmount(Number(v), currency)} />
              <Tooltip {...chart.tooltip} formatter={(v) => (Array.isArray(v) ? `${formatCompact(v[0], currency)} – ${formatCompact(v[1], currency)}` : formatCompact(Number(v), currency))} labelFormatter={(l) => `Year ${l}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="band" name="10th–90th pct" stroke="none" fill={chart.primary} fillOpacity={0.12} />
              <Line type="monotone" dataKey="Median" stroke={chart.primary} strokeWidth={2.25} dot={false} />
              <Line type="monotone" dataKey="Expected" stroke={chart.warning} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              {hasTarget && <Line type="monotone" dataKey="Target" name="Target (inflated)" stroke={chart.negative} strokeWidth={1.5} dot={false} />}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <p className="text-xs leading-relaxed text-muted">A simulation, not a forecast. Returns are drawn from a lognormal distribution using long-run assumptions per asset class, a uniform 0.35 correlation, and contributions made evenly through each year. Real markets have fatter tails and sequence risk.</p>
    </div>
  );
}
