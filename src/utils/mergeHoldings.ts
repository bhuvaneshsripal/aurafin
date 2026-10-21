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

/** Company name reduced to its essence: "YES BANK LIMITED" -> "YESBANK". */
function normName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(LIMITED|LTD|CORPORATION|CORP|INC)\b\.?/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

/** Identity keys of a holding. Two rows are the same stock when they share any
 *  key: the trading symbol, the ISIN, or the company name (so "YESBANK" and
 *  "YES BANK LIMITED" merge even if one row's symbol differs or is missing).
 *  Empty when it can't be matched safely (not a unit-tracked class). */
export function holdingKeys(a: Asset): string[] {
  if (!isUnitTracked(a)) return [];
  const scope = [a.profileId ?? '', a.currency, a.market ?? 'IN'].join('|');
  const keys: string[] = [];
  if (a.symbol?.trim()) keys.push(`${scope}|S|${normSymbol(a.symbol)}`);
  if (a.isin?.trim()) keys.push(`${scope}|I|${a.isin.trim().toUpperCase()}`);
  const n = normName(a.name ?? '');
  if (n.length >= 3) keys.push(`${scope}|S|${n}`); // name doubles as a symbol-like key
  return keys;
}

/** Finds the existing, still-held holding that `incoming` should merge into. */
export function findMergeTarget(incoming: Asset, existing: Asset[]): Asset | undefined {
  const keys = new Set(holdingKeys(incoming));
  if (keys.size === 0) return undefined;
  return existing.find((a) => a.id !== incoming.id && !isFullySold(a) && holdingKeys(a).some((k) => keys.has(k)));
}

/** Groups of 2+ currently-held rows that are really the same stock. */
export function findDuplicateGroups(assets: Asset[]): Asset[][] {
  const held = assets.filter((a) => !isFullySold(a) && holdingKeys(a).length > 0);
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  for (const a of held) parent.set(a.id, a.id);
  const owner = new Map<string, string>(); // key -> first asset id seen
  for (const a of held) {
    for (const k of holdingKeys(a)) {
      const o = owner.get(k);
      if (o === undefined) owner.set(k, a.id);
      else parent.set(find(a.id), find(o));
    }
  }
  const groups = new Map<string, Asset[]>();
  for (const a of held) {
    const r = find(a.id);
    groups.set(r, [...(groups.get(r) ?? []), a]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
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
    symbol: primary.symbol || others.find((o) => o.symbol)?.symbol,
    isin: primary.isin || others.find((o) => o.isin)?.isin,
    shareLots,
    saleLots: saleLots.length > 0 ? saleLots : undefined,
    // Fallback for holdings without a live price; live prices recompute it.
    value: all.reduce((sum, a) => sum + (a.value || 0), 0),
    notes: notes || undefined,
    updatedAt: Date.now(),
  };
  if (merged.saleLots === undefined) delete merged.saleLots;
  if (!merged.symbol) delete merged.symbol;
  if (!merged.isin) delete merged.isin;
  if (!merged.notes) delete merged.notes;

  const { remainingQty, avgBuyCost, investedValue } = computeHoldingPnl(merged, undefined, false);
  return { ...merged, quantity: remainingQty, avgCost: avgBuyCost, investedValue };
}
