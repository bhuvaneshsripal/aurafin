import { PieChart as PieIcon } from 'lucide-react';
import { Card, EmptyState, SegmentedControl, Tabs } from '../components/ui';
import { useUrlTab } from '../hooks/useUrlTab';
import { useAnalyticsData } from './analytics/useAnalyticsData';
import AllocationTab from './analytics/AllocationTab';
import RiskTab from './analytics/RiskTab';
import TaxTab from './analytics/TaxTab';
import ProjectionTab from './analytics/ProjectionTab';
import CalendarTab from './analytics/CalendarTab';

const VIEWS = ['allocation', 'risk', 'tax', 'projection', 'calendar'] as const;
type ViewKey = (typeof VIEWS)[number];

/** Analytics body, rendered as the "Analytics" tab of the Wealth page. Sub-sections live in the `view` URL param. */
export default function AnalyticsContent() {
  const [view, setView] = useUrlTab<ViewKey>(VIEWS, 'allocation', 'view');
  const data = useAnalyticsData();

  if (!data.hasData) {
    return (
      <Card padding="none">
        <EmptyState icon={<PieIcon size={18} />} title="Add some assets first" description="Analytics works off your holdings. Add a few and come back." />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          className="min-w-0 flex-1"
          value={view}
          onChange={setView}
          items={[
            { key: 'allocation', label: 'Rebalance' },
            { key: 'risk', label: 'Risk' },
            { key: 'tax', label: 'Tax & gains' },
            { key: 'projection', label: 'Projection' },
            { key: 'calendar', label: 'Calendar' },
          ]}
        />
        {data.currencies.length > 1 && (
          <SegmentedControl size="sm" value={data.currency} onChange={data.setCurrency} items={data.currencies.slice(0, 4).map((c) => ({ key: c, label: c }))} />
        )}
      </div>
      {view === 'allocation' && <AllocationTab data={data} />}
      {view === 'risk' && <RiskTab data={data} />}
      {view === 'tax' && <TaxTab data={data} />}
      {view === 'projection' && <ProjectionTab data={data} />}
      {view === 'calendar' && <CalendarTab data={data} />}
    </div>
  );
}
