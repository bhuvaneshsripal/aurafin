/**
 * Tax-aware rebalance trade list. For every overweight asset class it picks
 * what to sell in the order that costs the least tax (loss lots, then long-term
 * gains inside the yearly exemption, then the rest), and splits the proceeds
 * across underweight classes. Estimates only: rates come from TAX_RULES, the
 * LTCG exemption is applied once to listed equity, and holdings without lot
 * history (FDs, property...) are listed with no tax estimate.
 */
import type { Asset } from '../types';
import { LTCG_EXEMPTION, TAX_RULES, taxGroupOf, type UnrealisedLot } from './capitalGains';
import { categoryOf, type CategoryKey, type DriftRow, type ValuedAsset } from './portfolioAnalytics';

export interface SellLine {
  asset: Asset;
  category: CategoryKey;
  amount: number;
  gain: number;
  estTax: number;
  /** False when there is no lot history, so no tax could be estimated. */
  taxKnown: boolean;
}

export interface BuyLine {
  key: CategoryKey;
  label: string;
  amount: number;
}

export interface RebalancePlan {
  sells: SellLine[];
  buys: BuyLine[];
  totalSell: number;
  totalTax: number;
  /** Money left to reinvest after tax. */
  netProceeds: number;
}

interface Cand {
  asset: Asset;
  category: CategoryKey;
  value: number;
  gain: number;
  rate: number; // % of the gain
  group: ReturnType<typeof taxGroupOf>;
  long: boolean;
  known: boolean;
}

function rateFor(group: ReturnType<typeof taxGroupOf>, long: boolean, slab: number): number {
  const r = TAX_RULES[group];
  const v = long ? r.ltcgRate : r.stcgRate;
  return v === null ? slab : v;
}

export function buildRebalancePlan(items: ValuedAsset[], rows: DriftRow[], lots: UnrealisedLot[], slabRate: number, exemptionLeft = LTCG_EXEMPTION): RebalancePlan {
  const lotsByAsset = new Map<string, UnrealisedLot[]>();
  for (const l of lots) lotsByAsset.set(l.asset.id, [...(lotsByAsset.get(l.asset.id) ?? []), l]);

  const sells = new Map<string, SellLine>();
  let exemption = exemptionLeft;

  for (const row of rows) {
    if (row.status !== 'over' || row.adjust >= 0) continue;
    let need = -row.adjust;
    const cands: Cand[] = [];
    for (const it of items) {
      if (it.value <= 0 || categoryOf(it.asset) !== row.key) continue;
      const al = lotsByAsset.get(it.asset.id);
      if (al && al.length > 0) {
        for (const l of al) {
          const group = l.group;
          cands.push({ asset: it.asset, category: row.key, value: l.value, gain: l.gain, rate: l.gain > 0 ? rateFor(group, l.term === 'long', slabRate) : 0, group, long: l.term === 'long', known: true });
        }
      } else {
        cands.push({ asset: it.asset, category: row.key, value: it.value, gain: 0, rate: 0, group: taxGroupOf(it.asset.assetClass), long: false, known: false });
      }
    }
    // Known lots first, cheapest tax per rupee of sale first (losses sort before gains).
    cands.sort((a, b) => Number(b.known) - Number(a.known) || (a.known ? a.gain / a.value - b.gain / b.value : 0) || a.rate - b.rate);
    for (const c of cands) {
      if (need <= 0.5) break;
      const amt = Math.min(c.value, need);
      const gain = c.known ? (c.gain * amt) / c.value : 0;
      let tax = 0;
      if (gain > 0) {
        let taxable = gain;
        if (c.group === 'equity' && c.long && exemption > 0) {
          const used = Math.min(exemption, gain);
          exemption -= used;
          taxable -= used;
        }
        tax = (taxable * c.rate) / 100;
      }
      const prev = sells.get(c.asset.id);
      sells.set(c.asset.id, {
        asset: c.asset,
        category: c.category,
        amount: (prev?.amount ?? 0) + amt,
        gain: (prev?.gain ?? 0) + gain,
        estTax: (prev?.estTax ?? 0) + tax,
        taxKnown: c.known && (prev?.taxKnown ?? true),
      });
      need -= amt;
    }
  }

  const sellList = [...sells.values()].sort((a, b) => b.amount - a.amount);
  const totalSell = sellList.reduce((s, x) => s + x.amount, 0);
  const totalTax = sellList.reduce((s, x) => s + x.estTax, 0);
  const netProceeds = Math.max(0, totalSell - totalTax);

  const under = rows.filter((r) => r.status === 'under' && r.adjust > 0);
  const gap = under.reduce((s, r) => s + r.adjust, 0);
  const buys: BuyLine[] = gap > 0 ? under.map((r) => ({ key: r.key, label: r.label, amount: Math.min(r.adjust, (r.adjust / gap) * netProceeds) })) : [];
  return { sells: sellList, buys, totalSell, totalTax, netProceeds };
}
