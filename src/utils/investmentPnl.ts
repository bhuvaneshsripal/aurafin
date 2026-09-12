/**
 * Investment Profit & Loss accounting engine — the single source of truth
 * for every number shown on the Investments → Profit & Loss page
 * (src/pages/InvestmentPnL.tsx).
 *
 * ACCOUNTING METHOD: moving weighted-average cost basis.
 * ------------------------------------------------------
 * Every buy lot (shareLots / purchaseLots) and every sale record
 * (saleLots) for a holding is walked in chronological order:
 *   - On a BUY, the running average cost is re-blended:
 *       avgCost = (heldQty * avgCost + lotQty * lotPrice) / (heldQty + lotQty)
 *   - On a SELL, the realized P&L for that sale is locked in using
 *     whatever the running average cost is *at that moment* — selling
 *     never changes the average cost of what's left behind.
 * This is the standard "moving weighted average" method used by most
 * brokers/portfolio trackers and correctly handles every buy/sell
 * ordering (multiple buys, partial sells, sell-then-buy-more, etc.)
 * without ever needing to touch/shrink the original buy lots — so a
 * holding's full purchase history is permanent and auditable.
 *
 * IMPORTANT: selling a holding (see the Sell flow in Wealth.tsx) must
 * NEVER delete or mutate shareLots/purchaseLots. It should only ever
 * *append* a new entry to `asset.saleLots`. Remaining quantity is always
 * derived as (total ever bought) − (total ever sold), never stored/edited
 * directly.
 */
import type { Asset, AssetClass } from '../types';
import { resolveAssetValues } from './assetValues';
import type { SipLiveEntry } from '../store/livePricesStore';
import { SYMBOL_ENABLED_CLASSES, WEIGHT_TRACKED_CLASSES, SIP_CLASSES } from './taxonomy';

/** Asset classes with a real, discrete buy/sell lot history (unit-tracked
 *  equities/funds/crypto via shareLots, or weight-tracked commodities via
 *  purchaseLots) — these get the full Buy/Sell/Avg-Cost/Sold-Investments
 *  treatment. SIPs are excluded: they're priced off an auto-calculated
 *  installment schedule, not discrete buy/sell lots, and don't currently
 *  support a "Sell" action. */
export const LOT_TRACKED_CLASSES = new Set<AssetClass>(
  [...SYMBOL_ENABLED_CLASSES, ...WEIGHT_TRACKED_CLASSES].filter((c) => !SIP_CLASSES.has(c))
);
/** @deprecated kept as an alias — prefer LOT_TRACKED_CLASSES, which is more
 *  precise now that the P&L page also covers non-lot-tracked investments
 *  (FDs, RDs, bonds, PPF, etc.) via computeGenericHoldingPnl below. */
export const INVESTMENT_HOLDING_CLASSES = LOT_TRACKED_CLASSES;

export function isInvestmentHolding(asset: Asset): boolean {
  return LOT_TRACKED_CLASSES.has(asset.assetClass);
}

/** Every asset class counts toward the portfolio's Total Invested/Current
 *  Value/P&L except plain Cash — cash sitting in an account isn't an
 *  "investment" with a cost basis or a return. Everything else (equities,
 *  funds, commodities, crypto, FDs/RDs, PPF/EPF/NPS, bonds, real estate,
 *  alternatives, etc.) genuinely represents deployed capital the person
 *  wants reflected in their complete investment P&L picture. */
export function isInvestable(asset: Asset): boolean {
  return asset.assetClass !== 'cash';
}

const EPS = 0.0001;

/** A single chronological buy or sell event, normalized from either
 *  shareLots (unit-tracked) or purchaseLots (weight-tracked, grams). */
interface LotEvent {
  type: 'buy' | 'sell';
  id: string;
  date: string;
  qty: number;
  price: number;
  fees: number;
  /** Only present on sell events — bank/cash account proceeds were credited to. */
  accountId?: string;
}

/** Merges an asset's buy lots (shareLots or purchaseLots) with its
 *  saleLots into one chronologically-ordered event list. Undated lots
 *  fall back to their array position (oldest-added first), matching the
 *  behavior the rest of the app already uses for FIFO-style ordering. */
function buildLotEvents(asset: Asset): LotEvent[] {
  const buys: LotEvent[] = [];

  if (asset.shareLots && asset.shareLots.length > 0) {
    asset.shareLots.forEach((l, i) => {
      if (l.quantity > 0) {
        buys.push({ type: 'buy', id: l.id, date: l.date ?? `0000-${String(i).padStart(4, '0')}`, qty: l.quantity, price: l.price, fees: 0 });
      }
    });
  } else if (asset.purchaseLots && asset.purchaseLots.length > 0) {
    asset.purchaseLots.forEach((l, i) => {
      if (l.grams > 0) {
        buys.push({
          type: 'buy',
          id: l.id,
          date: l.date ?? `0000-${String(i).padStart(4, '0')}`,
          qty: l.grams,
          price: l.grams > 0 ? l.amount / l.grams : 0,
          fees: 0,
        });
      }
    });
  } else if (asset.quantity && asset.quantity > 0 && (asset.avgCost || asset.investedValue)) {
    // Legacy single-lot asset (saved before per-lot tracking existed).
    const price = asset.avgCost ?? asset.investedValue! / asset.quantity;
    buys.push({
      type: 'buy',
      id: asset.id,
      date: asset.startDate ?? '0000-0000',
      qty: asset.quantity,
      price,
      fees: 0,
    });
  }

  const sells: LotEvent[] = (asset.saleLots ?? [])
    .filter((l) => l.quantity > 0)
    .map((l, i) => ({
      type: 'sell' as const,
      id: l.id,
      date: l.date ?? `9999-${String(i).padStart(4, '0')}`,
      qty: l.quantity,
      price: l.price,
      fees: l.fees ?? 0,
      accountId: l.accountId,
    }));

  return [...buys, ...sells].sort((a, b) => a.date.localeCompare(b.date));
}

export interface RealizedSaleDetail {
  id: string;
  date?: string;
  quantity: number;
  sellPrice: number;
  saleValue: number;
  costBasis: number;
  costOfSold: number;
  realizedPnl: number;
  realizedPnlPercent: number | undefined;
  fees: number;
}

export type HoldingStatus = 'active' | 'partial' | 'sold';
export type HoldingKind = 'lot' | 'generic';

export interface HoldingPnl {
  asset: Asset;
  status: HoldingStatus;
  /** 'lot' = has real buy/sell lot history (stocks, ETFs, funds, gold,
   *  crypto — the Buy/Sell modal in Wealth.tsx). 'generic' = everything
   *  else counted toward the portfolio totals (FDs, RDs, PPF/EPF/NPS,
   *  bonds, real estate, alternatives, etc.) using whatever
   *  invested/current-value figures the asset already tracks — these
   *  don't have a quantity/avg-cost/buy-sell-lot concept, so the UI shows
   *  "—" for those columns and skips Sold/Activity treatment for them. */
  kind: HoldingKind;
  unitLabel: string;

  /** Every buy this holding has ever had — permanent, never shrinks. */
  totalBoughtQty: number;
  totalBoughtAmount: number;
  /** Weighted-average cost across every buy lot, lifetime (unaffected by sells). */
  lifetimeAvgBuyCost: number;

  /** What's left today. */
  remainingQty: number;
  /** Moving-average cost of the remaining quantity (see module docs). */
  avgBuyCost: number;
  investedValue: number; // cost basis of remainingQty
  currentPrice: number | undefined;
  currentValue: number;
  isLive: boolean;

  unrealizedPnl: number | undefined;
  unrealizedPnlPercent: number | undefined;

  totalSoldQty: number;
  totalSaleProceeds: number;
  totalCostOfSold: number;
  realizedPnl: number;
  realizedPnlPercent: number | undefined;

  totalPnl: number | undefined;
  /** Lifetime return — total P&L over every rupee ever put into this
   *  holding (totalBoughtAmount), the same "correct cost basis" style used
   *  for the portfolio-level Total Return card. Stays defined even for
   *  fully-sold holdings (where currentValue is 0), so Best/Worst
   *  Performers can rank sold and active holdings on one consistent scale. */
  lifetimeReturnPercent: number | undefined;

  sales: RealizedSaleDetail[];
  buyLots: { id: string; date?: string; qty: number; price: number; amount: number }[];
}

/**
 * Computes the complete P&L picture for one holding, given its current
 * market price (pass `resolveAssetValues(asset, ...).currentPrice` so this
 * stays consistent with every other live-price-aware figure in the app).
 */
export function computeHoldingPnl(asset: Asset, currentPrice: number | undefined, isLive: boolean): HoldingPnl {
  const isWeightTracked = WEIGHT_TRACKED_CLASSES.has(asset.assetClass);
  const unitLabel = isWeightTracked ? 'g' : 'units';
  const events = buildLotEvents(asset);

  let heldQty = 0;
  let avgCost = 0;
  let totalBoughtQty = 0;
  let totalBoughtAmount = 0;
  let totalSoldQty = 0;
  let totalSaleProceeds = 0;
  let totalCostOfSold = 0;
  const sales: RealizedSaleDetail[] = [];
  const buyLots: HoldingPnl['buyLots'] = [];

  for (const ev of events) {
    if (ev.type === 'buy') {
      const newQty = heldQty + ev.qty;
      avgCost = newQty > 0 ? (heldQty * avgCost + ev.qty * ev.price) / newQty : 0;
      heldQty = newQty;
      totalBoughtQty += ev.qty;
      totalBoughtAmount += ev.qty * ev.price;
      buyLots.push({ id: ev.id, date: ev.date.startsWith('0000') ? undefined : ev.date, qty: ev.qty, price: ev.price, amount: ev.qty * ev.price });
    } else {
      // Sell — cap at what's actually held so a stray/duplicate record
      // can't drive remaining quantity negative.
      const qty = Math.min(ev.qty, heldQty + EPS);
      const costBasis = avgCost;
      const costOfSold = qty * costBasis;
      const saleValue = qty * ev.price - ev.fees;
      const realizedPnl = saleValue - costOfSold;
      heldQty = Math.max(0, heldQty - qty);
      totalSoldQty += qty;
      totalSaleProceeds += saleValue;
      totalCostOfSold += costOfSold;
      sales.push({
        id: ev.id,
        date: ev.date.startsWith('9999') ? undefined : ev.date,
        quantity: qty,
        sellPrice: ev.price,
        saleValue,
        costBasis,
        costOfSold,
        realizedPnl,
        realizedPnlPercent: costOfSold > 0 ? (realizedPnl / costOfSold) * 100 : undefined,
        fees: ev.fees,
      });
      // avgCost of what remains is unaffected by a sale.
    }
  }

  const remainingQty = Math.round(heldQty * 1e6) / 1e6;
  const investedValue = remainingQty * avgCost;
  const currentValue = currentPrice !== undefined ? remainingQty * currentPrice : investedValue;
  const unrealizedPnl = currentPrice !== undefined ? currentValue - investedValue : undefined;
  const unrealizedPnlPercent =
    unrealizedPnl !== undefined && investedValue > 0 ? (unrealizedPnl / investedValue) * 100 : undefined;

  const realizedPnl = totalSaleProceeds - totalCostOfSold;
  const realizedPnlPercent = totalCostOfSold > 0 ? (realizedPnl / totalCostOfSold) * 100 : undefined;

  const totalPnl = unrealizedPnl !== undefined ? realizedPnl + unrealizedPnl : totalSoldQty > 0 ? realizedPnl : undefined;
  const lifetimeReturnPercent = totalBoughtAmount > 0 && totalPnl !== undefined ? (totalPnl / totalBoughtAmount) * 100 : undefined;

  const status: HoldingStatus = remainingQty <= EPS ? 'sold' : totalSoldQty > EPS ? 'partial' : 'active';

  return {
    asset,
    status,
    kind: 'lot',
    unitLabel,
    totalBoughtQty,
    totalBoughtAmount,
    lifetimeAvgBuyCost: totalBoughtQty > 0 ? totalBoughtAmount / totalBoughtQty : 0,
    remainingQty,
    avgBuyCost: avgCost,
    investedValue,
    currentPrice,
    currentValue,
    isLive,
    unrealizedPnl,
    unrealizedPnlPercent,
    totalSoldQty,
    totalSaleProceeds,
    totalCostOfSold,
    realizedPnl,
    realizedPnlPercent,
    totalPnl,
    lifetimeReturnPercent,
    sales,
    buyLots,
  };
}

/** True once a holding has been sold down to (effectively) zero — used to
 *  hide it from the normal Wealth grid (it lives on permanently in
 *  Investments → Profit & Loss → Sold Investments instead of appearing as
 *  a ghost "0 shares" card). */
export function isFullySold(asset: Asset): boolean {
  if (!isInvestmentHolding(asset)) return false;
  if (!asset.saleLots || asset.saleLots.length === 0) return false;
  return computeHoldingPnl(asset, undefined, false).status === 'sold';
}

/**
 * Builds a HoldingPnl-shaped summary for assets that don't have discrete
 * buy/sell lots (FDs, RDs, PPF/EPF/NPS, bonds, real estate, alternatives,
 * etc.) so they can sit in the same portfolio totals as lot-tracked
 * holdings. Invested/current value come straight from `resolveAssetValues`
 * — already correct for these classes (deposit interest accrual, or the
 * asset's own recorded invested value/current value as a fallback) — there
 * just isn't a quantity/avg-cost/lot history to show, and these never
 * become "sold" through this feature (they mature or get edited/deleted
 * directly in Wealth instead of being "sold" the way a stock is).
 */
export function computeGenericHoldingPnl(
  asset: Asset,
  currentPrice: number | undefined,
  invested: number | undefined,
  value: number,
  isLive: boolean
): HoldingPnl {
  const investedValue = invested ?? 0;
  const unrealizedPnl = investedValue > 0 ? value - investedValue : undefined;
  const unrealizedPnlPercent = unrealizedPnl !== undefined && investedValue > 0 ? (unrealizedPnl / investedValue) * 100 : undefined;

  return {
    asset,
    status: 'active',
    kind: 'generic',
    unitLabel: '',
    totalBoughtQty: 0,
    totalBoughtAmount: investedValue,
    lifetimeAvgBuyCost: 0,
    remainingQty: 0,
    avgBuyCost: 0,
    investedValue,
    currentPrice,
    currentValue: value,
    isLive,
    unrealizedPnl,
    unrealizedPnlPercent,
    totalSoldQty: 0,
    totalSaleProceeds: 0,
    totalCostOfSold: 0,
    realizedPnl: 0,
    realizedPnlPercent: undefined,
    totalPnl: unrealizedPnl,
    lifetimeReturnPercent: unrealizedPnlPercent,
    sales: [],
    buyLots: [],
  };
}

export interface PortfolioPnl {
  holdings: HoldingPnl[];
  active: HoldingPnl[]; // active + partial (remainingQty > 0)
  sold: HoldingPnl[]; // fully sold out
  /** Cost basis of everything currently held — "Total Invested" card. */
  totalInvested: number;
  /** Market value of everything currently held. */
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number | undefined;
  /** Sum of realized P&L across every holding, active or sold. */
  realizedPnl: number;
  totalPnl: number;
  /** Every rupee ever deployed into an investment, across sold + active. */
  lifetimeCapitalDeployed: number;
  totalReturnPercent: number | undefined;
  profitableCount: number;
  lossMakingCount: number;
  completedCount: number;
  winRatePercent: number | undefined;
}

/**
 * Aggregates every investment-holding asset in `assets` into one
 * portfolio-level P&L summary. Only assets sharing `currency` are
 * included — callers should scope this to one currency at a time (see
 * the currency picker on the P&L page) since amounts in different
 * currencies can't be summed without a conversion the app doesn't
 * currently perform for aggregate totals (same approach Wealth.tsx's own
 * "Total Value" card already uses).
 */
export function computePortfolioPnl(
  assets: Asset[],
  currency: string,
  livePrices: Record<string, number>,
  sipValues: Record<string, SipLiveEntry>,
  goldPricePerGram: number | null
): PortfolioPnl {
  const lotHoldings = assets
    .filter((a) => isInvestmentHolding(a) && a.currency === currency)
    .map((a) => {
      const resolved = resolveAssetValues(a, livePrices, sipValues, goldPricePerGram);
      return computeHoldingPnl(a, resolved.currentPrice, resolved.isLive);
    })
    // Drop assets with no recorded buy history at all (nothing to show).
    .filter((h) => h.totalBoughtQty > 0);

  // Everything else that still counts as "invested" (FDs, RDs, PPF/EPF/NPS,
  // bonds, real estate, alternatives, etc.) — no buy/sell lots, so these
  // ride along in the totals via their own tracked invested/current value
  // instead of participating in the Buy/Sell/Sold-Investments machinery.
  const genericHoldings = assets
    .filter((a) => !isInvestmentHolding(a) && isInvestable(a) && a.currency === currency)
    .map((a) => {
      const resolved = resolveAssetValues(a, livePrices, sipValues, goldPricePerGram);
      return computeGenericHoldingPnl(a, resolved.currentPrice, resolved.invested, resolved.value, resolved.isLive);
    })
    .filter((h) => h.investedValue > 0 || h.currentValue > 0);

  const holdings = [...lotHoldings, ...genericHoldings];

  const active = holdings.filter((h) => h.status !== 'sold');
  const sold = holdings.filter((h) => h.status === 'sold');

  const totalInvested = active.reduce((s, h) => s + h.investedValue, 0);
  const currentValue = active.reduce((s, h) => s + h.currentValue, 0);
  const unrealizedPnl = currentValue - totalInvested;
  const unrealizedPnlPercent = totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : undefined;

  const realizedPnl = holdings.reduce((s, h) => s + h.realizedPnl, 0);
  const totalPnl = realizedPnl + unrealizedPnl;

  const lifetimeCapitalDeployed = holdings.reduce((s, h) => s + h.totalBoughtAmount, 0);
  const totalReturnPercent = lifetimeCapitalDeployed > 0 ? (totalPnl / lifetimeCapitalDeployed) * 100 : undefined;

  // Win rate: only positions that are fully closed out (status === 'sold'),
  // per spec — active/partial holdings don't count as a "win" or "loss"
  // yet since they haven't been realized.
  const completed = sold;
  const profitableCount = completed.filter((h) => h.realizedPnl > EPS).length;
  const lossMakingCount = completed.filter((h) => h.realizedPnl < -EPS).length;
  const completedCount = completed.length;
  const winRatePercent = completedCount > 0 ? (profitableCount / completedCount) * 100 : undefined;

  return {
    holdings,
    active,
    sold,
    totalInvested,
    currentValue,
    unrealizedPnl,
    unrealizedPnlPercent,
    realizedPnl,
    totalPnl,
    lifetimeCapitalDeployed,
    totalReturnPercent,
    profitableCount,
    lossMakingCount,
    completedCount,
    winRatePercent,
  };
}

export interface ActivityEntry {
  key: string;
  asset: Asset;
  type: 'buy' | 'sell';
  date: string | undefined;
  quantity: number;
  price: number;
  grossAmount: number;
  fees: number;
  netAmount: number;
  realizedPnl?: number;
  unitLabel: string;
}

/** Flattens every buy/sell lot across `holdings` into one chronological
 *  (newest first) transaction feed for the "Investment Activity" section. */
export function buildActivityFeed(holdings: HoldingPnl[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];
  for (const h of holdings) {
    h.buyLots.forEach((lot) => {
      entries.push({
        key: `buy-${h.asset.id}-${lot.id}`,
        asset: h.asset,
        type: 'buy',
        date: lot.date,
        quantity: lot.qty,
        price: lot.price,
        grossAmount: lot.amount,
        fees: 0,
        netAmount: lot.amount,
        unitLabel: h.unitLabel,
      });
    });
    h.sales.forEach((sale) => {
      entries.push({
        key: `sell-${h.asset.id}-${sale.id}`,
        asset: h.asset,
        type: 'sell',
        date: sale.date,
        quantity: sale.quantity,
        price: sale.sellPrice,
        grossAmount: sale.quantity * sale.sellPrice,
        fees: sale.fees,
        netAmount: sale.saleValue,
        realizedPnl: sale.realizedPnl,
        unitLabel: h.unitLabel,
      });
    });
  }
  return entries.sort((a, b) => (b.date ?? '0000').localeCompare(a.date ?? '0000'));
}
