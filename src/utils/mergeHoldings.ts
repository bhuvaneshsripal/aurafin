import type { Asset } from '../types';
import { SYMBOL_ENABLED_CLASSES, SIP_CLASSES } from './taxonomy';
import { computeHoldingPnl, isFullySold } from './investmentPnl';

/**
 * Brokers (Zerodha, Groww) show one position per stock: buying the same
 * share again — say, on a dip — doesn't create a second row, it adds a buy
 * lot to the existing holding and the average cost is re-weighted. These
 * helpers give the Wealth page the same behaviour.
 */

const isUnitTracked = (a: Asset) => SYMBOL_ENABLED_CLASSES.has(a.assetClass) && !SIP_CLASSES.has(a.assetClass);

/** Same stock regardless of exchange suffix or case: "kalyankjil.ns" === "KALYANKJIL". */
function normSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\.(NS|BO)$/, '');
}

/** Identity of a holding. Undefined when it can't be matched safely
 *  (no symbol, or not a unit-tracked class like stocks/ETFs). */
export function holdingKey(a: Asset): string | undefined {
  if (!isUnitTracked(a) || !a.symbol?.trim()) return undefined;
  return [a.profileId ?? '', a.assetClass, a.currency, a.market ?? 'IN', normSymbol(a.symbol)].join('|');
}

/** Finds the existing, still-held holding that `incoming` should merge into. */
export function findMergeTarget(incoming: Asset, existing: Asset[]): Asset | undefined {
  const key = holdingKey(incoming);
  if (!key) return undefined;
  return existing.find((a) => a.id !== incoming.id && holdingKey(a) === key && !isFullySold(a));
}

/** Groups of 2+ currently-held rows that are really the same stock. */
export function findDuplicateGroups(assets: Asset[]): Asset[][] {
  const map = new Map<string, Asset[]>();
  for (const a of assets) {
    const key = holdingKey(a);
    if (!key || isFullySold(a)) continue;
    const list = map.get(key) ?? [];
    list.push(a);
    map.set(key, list);
  }
  return [...map.values()].filter((g) => g.length > 1);
}

/** Buy lots of an asset; legacy single-entry holdings become one lot. */
function lotsOf(a: Asset): NonNullable<Asset['shareLots']> {
  if (a.shareLots && a.shareLots.length > 0) return a.shareLots;
  if (a.quantity && a.quantity > 0 && (a.avgCost || a.investedValue)) {
    return [
      {
        id: a.id,
        date: a.startDate,
        quantity: a.quantity,
        price: a.avgCost ?? (a.investedValue as number) / a.quantity,
      },
    ];
  }
  return [];
}

/**
 * Folds `others` into `primary`: every buy lot (and sale) is kept, then
 * quantity / weighted-average cost / invested value are recomputed with the
 * app's usual moving-average math. E.g. 10 @ ₹100 + 10 @ ₹80 → 20 @ ₹90.
 */
export function mergeHoldings(primary: Asset, others: Asset[]): Asset {
  const all = [primary, ...others];
  const seen = new Set<string>();
  const shareLots = all.flatMap(lotsOf).map((l) => {
    const id = seen.has(l.id) ? crypto.randomUUID() : l.id;
    seen.add(id);
    return { ...l, id };
  });
  // Oldest purchase first (stable, so undated lots keep their order).
  shareLots.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const saleLots = all.flatMap((a) => a.saleLots ?? []);
  const notes = [...new Set(all.map((a) => a.notes?.trim()).filter((n): n is string => !!n))].join('\n');

  const merged: Asset = {
    ...primary,
    shareLots,
    saleLots: saleLots.length > 0 ? saleLots : undefined,
    // Fallback for holdings without a live price; live prices recompute it.
    value: all.reduce((sum, a) => sum + (a.value || 0), 0),
    notes: notes || undefined,
    updatedAt: Date.now(),
  };
  if (merged.saleLots === undefined) delete merged.saleLots;
  if (!merged.notes) delete merged.notes;

  const { remainingQty, avgBuyCost, investedValue } = computeHoldingPnl(merged, undefined, false);
  return { ...merged, quantity: remainingQty, avgCost: avgBuyCost, investedValue };
}
