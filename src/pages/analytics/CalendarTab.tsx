import { useMemo, useState } from 'react';
import { CalendarClock, Landmark, Repeat, Target as TargetIcon, PiggyBank } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, SegmentedControl, StatCard } from '../../components/ui';
import Amount from '../../components/Amount';
import { useGoalsStore } from '../../store/goalsStore';
import { buildUpcomingEvents, type EventKind } from '../../utils/upcomingEvents';
import { formatDate } from '../../utils/date';
import type { AnalyticsData } from './useAnalyticsData';

const ICON: Record<EventKind, typeof Landmark> = { maturity: Landmark, sip: Repeat, rd: PiggyBank, goal: TargetIcon };

export default function CalendarTab({ data }: { data: AnalyticsData }) {
  const goals = useGoalsStore((s) => s.goals);
  const [range, setRange] = useState<'30' | '90' | '365'>('90');
  const events = useMemo(() => buildUpcomingEvents(data.assets, goals.filter((g) => g.currency === data.currency), Number(range)), [data.assets, goals, data.currency, range]);

  const inflow = events.filter((e) => e.kind === 'maturity').reduce((s, e) => s + (e.amount ?? 0), 0);
  const outflow = events.filter((e) => e.kind === 'sip' || e.kind === 'rd').reduce((s, e) => s + Math.abs(e.amount ?? 0), 0);

  const byMonth = useMemo(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) {
      const key = e.date.slice(0, 7);
      m.set(key, [...(m.get(key) ?? []), e]);
    }
    return [...m.entries()];
  }, [events]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <SegmentedControl size="sm" value={range} onChange={setRange} items={[{ key: '30', label: '30 days' }, { key: '90', label: '90 days' }, { key: '365', label: '1 year' }]} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Maturing" value={<Amount value={inflow} currency={data.currency} />} tone="positive" sublabel="money coming back" />
        <StatCard label="Scheduled investing" value={<Amount value={outflow} currency={data.currency} />} sublabel="SIP + RD debits" />
        <StatCard className="col-span-2 lg:col-span-1" label="Events" value={String(events.length)} sublabel={`next ${range} days`} />
      </div>

      {events.length === 0 ? (
        <Card padding="none">
          <EmptyState icon={<CalendarClock size={18} />} title="Nothing coming up" description="Add maturity dates to deposits and bonds, or set up SIPs, and they will show up here." />
        </Card>
      ) : (
        byMonth.map(([month, list]) => (
          <Card key={month} padding="none">
            <CardHeader divided padded title={new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} />
            <ul className="divide-y divide-line">
              {list.map((e) => {
                const Icon = ICON[e.kind];
                const incoming = e.kind === 'maturity';
                return (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{e.title}</div>
                      <div className="text-xs text-muted">
                        {formatDate(e.date)} · {e.daysAway === 0 ? 'today' : `in ${e.daysAway}d`}
                        {e.subtitle ? ` · ${e.subtitle}` : ''}
                      </div>
                    </div>
                    {e.amount !== undefined && (
                      <span className={`shrink-0 text-sm font-medium ${incoming ? 'text-positive' : e.kind === 'goal' ? 'text-ink' : 'text-muted'}`}>
                        {e.kind === 'goal' ? 'Target ' : incoming ? '+' : '−'}
                        <Amount value={Math.abs(e.amount)} currency={e.currency} />
                      </span>
                    )}
                    {e.kind === 'maturity' && e.daysAway <= 14 && <Badge variant="warning">Soon</Badge>}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
