import { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Check, RotateCcw } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Input, SegmentedControl, Table, TableContainer, TBody, Td, Th, THead, Tr, chart } from '../../components/ui';
import Amount from '../../components/Amount';
import { useAnalyticsSettingsStore } from '../../store/analyticsSettingsStore';
import { allocateNewMoney, CATEGORY_KEYS, CATEGORY_META, computeDrift, TARGET_PRESETS, targetSum, type CategoryKey, type TargetAllocation } from '../../utils/portfolioAnalytics';
import type { AnalyticsData } from './useAnalyticsData';

export default function AllocationTab({ data }: { data: AnalyticsData }) {
  const { allocation, currency } = data;
  const { targets, band, setTargets, setBand } = useAnalyticsSettingsStore();
  const [newMoney, setNewMoney] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TargetAllocation>(targets);

  const hasTargets = targetSum(targets) > 0;
  const rows = useMemo(() => computeDrift(allocation.slices, allocation.total, targets, band), [allocation, targets, band]);
  const money = Number(newMoney) > 0 ? Number(newMoney) : 0;
  const plan = useMemo(() => allocateNewMoney(rows, allocation.total, money, targets), [rows, allocation.total, money, targets]);
  const draftSum = targetSum(draft);

  const save = () => {
    setTargets(draft);
    setEditing(false);
  };

  const chartData = rows.map((r) => ({ name: r.label, Current: +r.currentPct.toFixed(1), Target: +r.targetPct.toFixed(1), color: r.color }));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Current allocation" description="By asset class, at today's value" />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={allocation.slices} dataKey="value" nameKey="label" innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
                  {allocation.slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip {...chart.tooltip} formatter={(v) => [`${((Number(v) / allocation.total) * 100).toFixed(1)}%`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5">
            {allocation.slices.map((s) => (
              <li key={s.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-ink">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="text-muted">
                  <Amount value={s.value} currency={currency} /> · {s.pct.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
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
            <CardHeader divided padded title="Rebalancing plan" description="What it takes to get back to your target mix" />
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
                      <Td className="text-right">{r.currentPct.toFixed(1)}%</Td>
                      <Td className="text-right">{r.targetPct.toFixed(1)}%</Td>
                      <Td className="text-right">
                        <Badge variant={r.status === 'on_track' ? 'success' : r.status === 'over' ? 'warning' : 'info'}>
                          {r.driftPct > 0 ? '+' : ''}
                          {r.driftPct.toFixed(1)} pts
                        </Badge>
                      </Td>
                      <Td className="text-right">
                        {Math.abs(r.adjust) < 1 ? (
                          <span className="text-muted">Hold</span>
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
