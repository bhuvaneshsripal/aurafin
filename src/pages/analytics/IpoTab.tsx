import { useMemo } from 'react';
import { Rocket } from 'lucide-react';
import { Badge, Card, CardHeader, EmptyState, StatCard, Table, TableContainer, TBody, Td, Th, THead, Tr } from '../../components/ui';
import Amount from '../../components/Amount';
import { computeIpo, IPO_STAGES } from '../../utils/ipo';
import { formatDate } from '../../utils/date';
import type { AnalyticsData } from './useAnalyticsData';

export default function IpoTab({ data }: { data: AnalyticsData }) {
  const { assets, currency } = data;
  const rows = useMemo(
    () => assets.filter((a) => a.ipo).map((a) => ({ a, ipo: a.ipo!, c: computeIpo(a.ipo!) })),
    [assets]
  );

  if (rows.length === 0) {
    return (
      <Card padding="none">
        <EmptyState icon={<Rocket size={18} />} title="No IPOs tracked yet" description="Add an asset of type IPO / Pre-IPO and fill in the stage, lots and dates. Your IPO scorecard shows up here." />
      </Card>
    );
  }

  const decided = rows.filter((r) => ['allotted', 'listed', 'not_allotted'].includes(r.ipo.stage));
  const won = decided.filter((r) => r.ipo.stage !== 'not_allotted');
  const allotRate = decided.length > 0 ? (won.length / decided.length) * 100 : undefined;
  const blocked = rows.reduce((s, r) => s + r.c.blocked, 0);
  const listed = rows.filter((r) => r.c.listingGainPct !== undefined && r.ipo.stage === 'listed');
  const avgListing = listed.length > 0 ? listed.reduce((s, r) => s + (r.c.listingGainPct as number), 0) / listed.length : undefined;
  const totalListingGain = rows.reduce((s, r) => s + (r.c.listingGain ?? 0), 0);
  const totalGain = rows.reduce((s, r) => s + (r.c.gain ?? 0), 0);
  const stageLabel = (k: string) => IPO_STAGES.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Allotment rate" value={allotRate === undefined ? '—' : `${allotRate.toFixed(0)}%`} sublabel={decided.length ? `${won.length} of ${decided.length} bids` : 'no results yet'} />
        <StatCard label="Avg listing gain" value={avgListing === undefined ? '—' : `${avgListing >= 0 ? '+' : ''}${avgListing.toFixed(1)}%`} tone={avgListing === undefined ? 'default' : avgListing >= 0 ? 'positive' : 'negative'} sublabel={`${listed.length} listed`} />
        <StatCard label="Listing-day profit" value={<Amount value={totalListingGain} currency={currency} />} tone={totalListingGain >= 0 ? 'positive' : 'negative'} sublabel="on allotted shares" />
        <StatCard label="Blocked in bids" value={<Amount value={blocked} currency={currency} />} sublabel={`gain on held: ${totalGain >= 0 ? '+' : '−'}${Math.abs(Math.round(totalGain)).toLocaleString('en-IN')}`} />
      </div>
      <Card padding="none">
        <CardHeader divided padded title="Your IPOs" description="Every IPO and Pre-IPO position, by stage" />
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Company</Th>
                <Th>Stage</Th>
                <Th className="text-right">Bid</Th>
                <Th className="text-right">Issue</Th>
                <Th className="text-right">Listing gain</Th>
                <Th className="text-right">GMP</Th>
                <Th>Key date</Th>
              </Tr>
            </THead>
            <TBody>
              {rows.map(({ a, ipo, c }) => {
                const date = ipo.listingDate ?? ipo.allotmentDate ?? ipo.closeDate ?? ipo.lockInEnd;
                return (
                  <Tr key={a.id}>
                    <Td className="font-medium text-ink">{a.name}</Td>
                    <Td><Badge variant={ipo.stage === 'listed' ? 'success' : ipo.stage === 'not_allotted' ? 'neutral' : ipo.stage === 'applied' ? 'warning' : 'info'}>{stageLabel(ipo.stage)}</Badge></Td>
                    <Td className="text-right">{c.applicationAmount !== undefined ? <Amount value={c.applicationAmount} currency={a.currency} /> : '—'}</Td>
                    <Td className="text-right">{ipo.issuePrice ?? ipo.priceBandHigh ?? '—'}</Td>
                    <Td className={`text-right ${(c.listingGainPct ?? 0) < 0 ? 'text-negative' : 'text-positive'}`}>{c.listingGainPct === undefined ? '—' : `${c.listingGainPct >= 0 ? '+' : ''}${c.listingGainPct.toFixed(1)}%`}</Td>
                    <Td className="text-right">{c.gmpGainPct === undefined ? '—' : `${c.gmpGainPct >= 0 ? '+' : ''}${c.gmpGainPct.toFixed(0)}%`}</Td>
                    <Td>{date ? formatDate(date) : '—'}</Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        </TableContainer>
      </Card>
    </div>
  );
}
