import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Input, SegmentedControl, StatCard, Table, TableContainer, TBody, Td, Th, THead, Tr } from '../../components/ui';
import Amount from '../../components/Amount';
import { useAnalyticsSettingsStore } from '../../store/analyticsSettingsStore';
import { computeHoldingPnl, isInvestmentHolding } from '../../utils/investmentPnl';
import { resolveAssetValues } from '../../utils/assetValues';
import { currentFinancialYear, fifoMatch, LTCG_EXEMPTION, summariseFy, TAX_RULES, unrealisedLots, type GainSlice } from '../../utils/capitalGains';
import { toIsoDate, formatDate } from '../../utils/date';
import { ASSET_CLASS_LABELS } from '../../utils/currency';
import type { AnalyticsData } from './useAnalyticsData';

function downloadCsv(name: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TaxTab({ data }: { data: AnalyticsData }) {
  const { taxAssets, currency, livePrices, sipValues, gold } = data;
  const { slabRate, setSlabRate } = useAnalyticsSettingsStore();
  const today = toIsoDate();
  const thisFy = currentFinancialYear();
  const [fy, setFy] = useState<string>(thisFy);

  const holdings = useMemo(
    () =>
      taxAssets
        .filter(isInvestmentHolding)
        .map((a) => {
          const r = resolveAssetValues(a, livePrices, sipValues, gold);
          return computeHoldingPnl(a, r.currentPrice, r.isLive);
        })
        .filter((h) => h.totalBoughtQty > 0),
    [taxAssets, livePrices, sipValues, gold]
  );
  const allHoldings = holdings;

  const slices = useMemo(() => allHoldings.flatMap((h) => fifoMatch(h).realised), [allHoldings]);
  const fys = useMemo(() => {
    const set = new Set<string>([thisFy]);
    slices.forEach((s) => s.fy && set.add(s.fy));
    return [...set].sort().reverse();
  }, [slices, thisFy]);
  const fySlices = slices.filter((s) => s.fy === fy);
  const summary = useMemo(() => summariseFy(fy, fySlices, slabRate), [fy, fySlices, slabRate]);
  const undated = slices.filter((s) => s.assumed).length;

  const equityGroup = summary.groups.find((g) => g.group === 'equity');
  const exemptionLeft = Math.max(0, LTCG_EXEMPTION - (equityGroup?.exemptionUsed ?? 0));

  const lots = useMemo(() => allHoldings.flatMap((h) => unrealisedLots(h, today)), [allHoldings, today]);
  const harvestLosses = lots.filter((l) => l.gain < -1).sort((a, b) => a.gain - b.gain).slice(0, 8);
  const harvestGains = lots.filter((l) => l.group === 'equity' && l.term === 'long' && l.gain > 1).sort((a, b) => b.gain - a.gain).slice(0, 6);
  const turningLong = lots.filter((l) => l.daysToLong !== undefined && l.daysToLong > 0 && l.daysToLong <= 60 && l.gain > 1).sort((a, b) => (a.daysToLong ?? 0) - (b.daysToLong ?? 0)).slice(0, 6);

  if (slices.length === 0 && lots.length === 0) {
    return (
      <Card padding="none">
        <EmptyState title="No investment lots yet" description="Record buys and sells on stocks, funds, gold or crypto in Wealth and your capital-gains report appears here." />
      </Card>
    );
  }

  const exportCsv = () =>
    downloadCsv(`aurafin-capital-gains-${fy.replace(/\s/g, '')}.csv`, [
      ['Asset', 'Type', 'Buy date', 'Sell date', 'Qty', 'Cost', 'Proceeds', 'Gain', 'Days held', 'Term', 'Tax bucket'],
      ...fySlices.map((s: GainSlice) => [s.assetName, ASSET_CLASS_LABELS[s.assetClass] ?? s.assetClass, s.buyDate ?? '', s.sellDate ?? '', s.qty, s.cost.toFixed(2), s.proceeds.toFixed(2), s.gain.toFixed(2), s.daysHeld ?? '', s.term === 'long' ? 'LTCG' : 'STCG', TAX_RULES[s.group].label]),
    ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl size="sm" value={fy} onChange={setFy} items={fys.slice(0, 4).map((f) => ({ key: f, label: f }))} />
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-muted">
            Your slab rate %
            <Input type="number" min={0} max={45} value={slabRate} onChange={(e) => setSlabRate(Math.max(0, Math.min(45, Number(e.target.value) || 0)))} className="!w-20" />
          </label>
          <Button size="sm" variant="secondary" onClick={exportCsv} disabled={fySlices.length === 0}>
            <Download size={14} /> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Realised gain" value={<Amount value={summary.totalGain} currency={currency} />} tone={summary.totalGain >= 0 ? 'positive' : 'negative'} sublabel={fy} />
        <StatCard label="Estimated tax" value={<Amount value={summary.totalTax} currency={currency} />} sublabel="indicative, not advice" />
        <StatCard label="LTCG exemption left" value={fy === thisFy ? <Amount value={exemptionLeft} currency={currency} /> : '—'} sublabel={`of ${LTCG_EXEMPTION.toLocaleString('en-IN')} on equity`} />
        <StatCard label="Sales in year" value={String(new Set(fySlices.map((s) => `${s.assetId}${s.sellDate}`)).size)} sublabel={`${fySlices.length} lot match${fySlices.length === 1 ? '' : 'es'}`} />
      </div>

      {summary.groups.length > 0 && (
        <Card padding="none">
          <CardHeader divided padded title="Tax summary" description="Losses are set off against gains within the same bucket (short-term loss against either; long-term loss only against long-term)" />
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>Bucket</Th>
                  <Th className="text-right">STCG</Th>
                  <Th className="text-right">LTCG</Th>
                  <Th className="text-right">Exempt</Th>
                  <Th className="text-right">Est. tax</Th>
                </Tr>
              </THead>
              <TBody>
                {summary.groups.map((g) => (
                  <Tr key={g.group}>
                    <Td>
                      <div className="font-medium text-ink">{g.rule.label}</div>
                      <div className="text-xs text-muted">
                        Long-term after {Number.isFinite(g.rule.ltDays) ? `${Math.round(g.rule.ltDays / 365)} yr` : 'n/a'} · ST {g.rule.stcgRate ?? slabRate}% · LT {g.rule.ltcgRate ?? slabRate}%
                      </div>
                    </Td>
                    <Td className={`text-right ${g.stcg < 0 ? 'text-negative' : ''}`}><Amount value={g.stcg} currency={currency} /></Td>
                    <Td className={`text-right ${g.ltcg < 0 ? 'text-negative' : ''}`}><Amount value={g.ltcg} currency={currency} /></Td>
                    <Td className="text-right"><Amount value={g.exemptionUsed} currency={currency} /></Td>
                    <Td className="text-right font-medium"><Amount value={g.tax} currency={currency} /></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {fy === thisFy && (harvestLosses.length > 0 || harvestGains.length > 0 || turningLong.length > 0) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {harvestLosses.length > 0 && (
            <LotList title="Tax-loss harvesting" description="Unrealised losses you could book to offset gains" lots={harvestLosses} currency={currency} tone="negative" />
          )}
          {harvestGains.length > 0 && exemptionLeft > 0 && (
            <LotList title="Gain harvesting" description={`Long-term equity gains you can book tax-free, up to the ${exemptionLeft.toLocaleString('en-IN')} left in this year's exemption`} lots={harvestGains} currency={currency} tone="positive" />
          )}
          {turningLong.length > 0 && (
            <LotList title="Turning long-term soon" description="Wait for these to cross the long-term line before selling" lots={turningLong} currency={currency} tone="positive" showDays />
          )}
        </div>
      )}

      {fySlices.length > 0 && (
        <Card padding="none">
          <CardHeader divided padded title="Realised lots" description="FIFO-matched, as tax rules require" />
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>Asset</Th>
                  <Th>Bought</Th>
                  <Th>Sold</Th>
                  <Th className="text-right">Gain</Th>
                  <Th className="text-right">Term</Th>
                </Tr>
              </THead>
              <TBody>
                {fySlices.map((s, i) => (
                  <Tr key={i}>
                    <Td>{s.assetName}</Td>
                    <Td>{s.buyDate ? formatDate(s.buyDate) : '—'}</Td>
                    <Td>{s.sellDate ? formatDate(s.sellDate) : '—'}</Td>
                    <Td className={`text-right ${s.gain < 0 ? 'text-negative' : 'text-positive'}`}><Amount value={s.gain} currency={currency} /></Td>
                    <Td className="text-right"><Badge variant={s.term === 'long' ? 'success' : 'warning'}>{s.term === 'long' ? 'Long' : 'Short'}{s.assumed ? '*' : ''}</Badge></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-muted">
        Estimates use Indian rules in force since 23 Jul 2024: listed equity and equity funds 20% short-term / 12.5% long-term above ₹1.25 lakh a year (12-month threshold); gold, silver and foreign equity 12.5% long-term after 24 months, short-term at your slab rate; crypto a flat 30% with no loss set-off. Debt funds and other assets are taxed at your slab rate. Cess, surcharge, grandfathering of pre-2018 equity, and brokerage/STT are not modelled. {undated > 0 && `* ${undated} lot match${undated === 1 ? ' has' : 'es have'} no buy or sell date, so it's treated as short-term. `}This is not tax advice, so please confirm with a CA.
      </p>
    </div>
  );
}

function LotList({ title, description, lots, currency, tone, showDays }: { title: string; description: string; lots: ReturnType<typeof unrealisedLots>; currency: string; tone: 'positive' | 'negative'; showDays?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <ul className="divide-y divide-line">
        {lots.map((l, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate text-ink">
              {l.asset.name}
              <span className="ml-1 text-xs text-muted">{showDays && l.daysToLong ? `· long-term in ${l.daysToLong}d` : l.buyDate ? `· bought ${formatDate(l.buyDate)}` : ''}</span>
            </span>
            <span className={`shrink-0 font-medium ${tone === 'positive' ? 'text-positive' : 'text-negative'}`}>
              <Amount value={l.gain} currency={currency} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
