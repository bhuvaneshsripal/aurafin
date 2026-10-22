import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Check, Download, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Input, SegmentedControl, Table, TableContainer, TBody, Td, Th, THead, Tr, chart } from '../../components/ui';
import Amount from '../../components/Amount';
import { hideNumber } from '../../utils/privateFormat';
import { useAnalyticsSettingsStore } from '../../store/analyticsSettingsStore';
import { exportToCsv } from '../../utils/exportCsv';
import {
  allocateNewMoney,
  buildCategoryBreakdown,
  CATEGORY_KEYS,
  CATEGORY_META,
  computeDrift,
  concentration,
  TARGET_PRESETS,
  targetSum,
  type CategoryKey,
  type TargetAllocation,
} from '../../utils/portfolioAnalytics';
import type { AnalyticsData } from './useAnalyticsData';
import CategoryBreakdownList from './CategoryBreakdown';

const LIMIT_OPTIONS = ['10', '15', '20', '25'];

export default function AllocationTab({ data }: { data: AnalyticsData }) {
  const { currency, allocItems } = data;
  const { targets, band, holdingLimit, setTargets, setBand, setHoldingLimit } = useAnalyticsSettingsStore();
  const [newMoney, setNewMoney] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TargetAllocation>(targets);

  const { total, categories } = useMemo(() => buildCategoryBreakdown(allocItems), [allocItems]);
  const hasTargets = targetSum(targets) > 0;
  const rows = useMemo(() => computeDrift(categories, total, targets, band), [categories, total, targets, band]);
  const money = Number(newMoney) > 0 ? Number(newMoney) : 0;
  const plan = useMemo(() => allocateNewMoney(rows, total, money, targets), [rows, total, money, targets]);
  const conc = useMemo(() => concentration(allocItems, holdingLimit), [allocItems, holdingLimit]);
  const draftSum = targetSum(draft);

  // Full rebalance = every category moved exactly to its target. Buys and sells
  // should match when targets add to 100%; the difference is cash left over.
  const fullBuy = rows.reduce((s, r) => s + Math.max(0, r.adjust), 0);
  const fullSell = rows.reduce((s, r) => s + Math.max(0, -r.adjust), 0);
  const offTarget = rows.filter((r) => r.status !== 'on_track').length;
  const equity = categories.find((c) => c.key === 'equity');
  const directStock = equity?.children.find((c) => c.assetClass === 'stock');

  const save = () => {
    setTargets(draft);
    setEditing(false);
  };

  const chartData = rows.map((r) => ({ name: r.label, Current: +r.currentPct.toFixed(1), Target: +r.targetPct.toFixed(1), color: r.color }));

  const downloadPlan = () => {
    const out = rows.map((r) => ({
      'Asset class': r.label,
      'Current %': +r.currentPct.toFixed(2),
      'Target %': +r.targetPct.toFixed(2),
      'Drift (pts)': +r.driftPct.toFixed(2),
      Status: r.status === 'on_track' ? 'Within band' : r.status === 'over' ? 'Overweight' : 'Underweight',
      Action: r.status === 'on_track' ? 'Hold' : r.adjust > 0 ? 'Buy' : 'Sell',
      [`Amount (${currency})`]: Math.round(Math.abs(r.adjust)),
    }));
    void exportToCsv('aurafin-rebalance-plan.csv', out);
  };

  if (allocItems.length === 0) return null;

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="Portfolio value" value={<Amount value={total} currency={currency} />} />
        <SummaryTile label="Classes off target" value={`${offTarget} of ${rows.length || categories.length}`} tone={offTarget > 0 ? 'warn' : 'ok'} />
        <SummaryTile label="Full rebalance: buy" value={<Amount value={fullBuy} currency={currency} />} hint={hasTargets ? undefined : 'Set targets first'} />
        <SummaryTile label="Full rebalance: sell" value={<Amount value={fullSell} currency={currency} />} hint={hasTargets ? undefined : 'Set targets first'} />
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Current allocation" description="By asset class — tap Equity to see Direct Stock, ETF and SIP" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categories} dataKey="value" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                  {categories.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip {...chart.tooltip} formatter={(v) => [hideNumber(`${((Number(v) / total) * 100).toFixed(1)}%`), '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2">
            <CategoryBreakdownList categories={categories} currency={currency} />
          </div>
          {directStock && equity && (
            <p className="mt-3 text-xs text-muted">
              Direct stocks are {hideNumber(`${directStock.pctOfCategory.toFixed(0)}%`)} of your equity and {hideNumber(`${directStock.pct.toFixed(1)}%`)} of the whole portfolio.
            </p>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader
            title="Target allocation"
            description={hasTargets ? `Alert when an asset class drifts more than ±${band} points` : 'Set the mix you want and Aurafin shows exactly what to buy or sell'}
            actions={
              !editing ? (
                <Button size="sm" variant="secondary" onClick={() => { setDraft(targets); setEditing(true); }}>
                  {hasTargets ? 'Edit targets' : 'Set targets'}
                </Button>
              ) : null
            }
          />
          {editing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {TARGET_PRESETS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setDraft(p.targets)} className="rounded-lg border border-line px-3 py-1.5 text-left text-sm hover:bg-surface-hover">
                    <span className="font-medium text-ink">{p.label}</span>
                    <span className="block text-xs text-muted">{p.description}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {CATEGORY_KEYS.map((k: CategoryKey) => (
                  <label key={k} className="block text-xs font-medium text-muted">
                    {CATEGORY_META[k].label} %
                    <Input type="number" min={0} max={100} inputMode="decimal" value={draft[k] ?? ''} placeholder="0" onChange={(e) => setDraft({ ...draft, [k]: e.target.value === '' ? undefined : Math.max(0, Math.min(100, Number(e.target.value))) })} />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className={`text-sm font-medium ${Math.abs(draftSum - 100) < 0.01 ? 'text-positive' : 'text-negative'}`}>Total {draftSum.toFixed(draftSum % 1 ? 1 : 0)}% {Math.abs(draftSum - 100) < 0.01 ? '' : '(must equal 100%)'}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Tolerance</span>
                  <SegmentedControl size="sm" value={String(band)} onChange={(v) => setBand(Number(v))} items={[{ key: '3', label: '±3' }, { key: '5', label: '±5' }, { key: '10', label: '±10' }]} />
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button size="sm" onClick={save} disabled={Math.abs(draftSum - 100) > 0.01}>
                    <Check size={14} /> Save
                  </Button>
                </div>
              </div>
            </div>
          ) : hasTargets ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke={chart.grid} horizontal={false} />
                  <XAxis type="number" tick={chart.tick} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={chart.tick} width={92} axisLine={false} tickLine={false} />
                  <Tooltip {...chart.tooltip} formatter={(v) => `${v}%`} />
                  <ReferenceLine x={0} stroke={chart.axis} />
                  <Bar dataKey="Current" fill={chart.primary} radius={[0, 4, 4, 0]} barSize={9} />
                  <Bar dataKey="Target" fill="var(--color-line)" radius={[0, 4, 4, 0]} barSize={9} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted">No target set yet. Pick a preset (Aggressive, Balanced, Conservative) or enter your own.</p>
          )}
        </Card>
      </div>

      {hasTargets && !editing && (
        <>
          <Card padding="none">
            <CardHeader
              divided
              padded
              title="Rebalancing plan"
              description="What it takes to get back to your target mix"
              actions={
                <Button size="sm" variant="secondary" onClick={downloadPlan}>
                  <Download size={14} /> Export
                </Button>
              }
            />
            <TableContainer>
              <Table>
                <THead>
                  <Tr>
                    <Th>Asset class</Th>
                    <Th className="text-right">Current</Th>
                    <Th className="text-right">Target</Th>
                    <Th className="text-right">Drift</Th>
                    <Th className="text-right">Action</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <Tr key={r.key}>
                      <Td>
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                          {r.label}
                        </span>
                      </Td>
                      <Td className="text-right">{hideNumber(`${r.currentPct.toFixed(1)}%`)}</Td>
                      <Td className="text-right">{r.targetPct.toFixed(1)}%</Td>
                      <Td className="text-right">
                        <Badge variant={r.status === 'on_track' ? 'success' : r.status === 'over' ? 'warning' : 'info'}>
                          {r.driftPct > 0 ? '+' : ''}
                          {r.driftPct.toFixed(1)} pts
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        {r.status === 'on_track' ? (
                          <span className="text-muted">Within band</span>
                        ) : (
                          <span className={r.adjust > 0 ? 'text-positive' : 'text-negative'}>
                            {r.adjust > 0 ? 'Buy ' : 'Sell '}
                            <Amount value={Math.abs(r.adjust)} currency={currency} />
                          </span>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </Card>

          <Card padding="none">
            <CardHeader
              divided
              padded
              title="Concentration"
              description={`Holdings above ${holdingLimit}% of your portfolio, and how much to trim to get them back under the limit`}
              actions={
                <SegmentedControl size="sm" value={String(holdingLimit)} onChange={(v) => setHoldingLimit(Number(v))} items={LIMIT_OPTIONS.map((l) => ({ key: l, label: `${l}%` }))} />
              }
            />
            {conc.top.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No holdings to check yet.</p>
            ) : (
              <TableContainer>
                <Table>
                  <THead>
                    <Tr>
                      <Th>Holding</Th>
                      <Th className="text-right">Value</Th>
                      <Th className="text-right">Weight</Th>
                      <Th className="text-right">To get under limit</Th>
                    </Tr>
                  </THead>
                  <TBody>
                    {conc.top.map((r) => (
                      <Tr key={r.asset.id}>
                        <Td>
                          <span className="block max-w-[14rem] truncate font-medium text-ink">{r.asset.name}</span>
                        </Td>
                        <Td className="text-right">
                          <Amount value={r.value} currency={currency} />
                        </Td>
                        <Td className="text-right">
                          <Badge variant={r.trim > 0 ? 'warning' : 'success'}>{hideNumber(`${r.pct.toFixed(1)}%`)}</Badge>
                        </Td>
                        <Td className="text-right">
                          {r.trim > 0 ? (
                            <span className="text-negative">
                              Sell <Amount value={r.trim} currency={currency} />
                            </span>
                          ) : (
                            <span className="text-muted">OK</span>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              </TableContainer>
            )}
            {conc.breaches.length > 0 && (
              <p className="px-5 pb-4 pt-3 text-xs text-muted">Selling keeps the proceeds as cash inside the portfolio, so the total value does not change.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Rebalance with new money (no selling)" description="Add fresh money to the underweight classes instead of selling winners, which avoids triggering tax." />
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-xs font-medium text-muted">
                Amount to invest
                <Input type="number" min={0} inputMode="decimal" value={newMoney} placeholder="e.g. 100000" onChange={(e) => setNewMoney(e.target.value)} className="w-48" />
              </label>
              {newMoney && (
                <Button size="sm" variant="ghost" onClick={() => setNewMoney('')}>
                  <RotateCcw size={14} /> Clear
                </Button>
              )}
            </div>
            {money > 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(plan)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                      <span className="text-ink">{CATEGORY_META[k as CategoryKey].label}</span>
                      <span className="font-medium text-positive">
                        <Amount value={v} currency={currency} />
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className={`mt-1 text-base font-semibold ${tone === 'warn' ? 'text-negative' : tone === 'ok' ? 'text-positive' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
