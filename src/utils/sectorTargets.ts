import type { SectorRow } from './sectors';
import type { TargetRange } from '../store/sectorTargetsStore';

export type TargetStatus = 'low' | 'high' | 'ok';

export interface TargetCheck {
  key: string;
  label: string;
  pct: number;
  range: TargetRange;
  status: TargetStatus;
  /** Rough rupees to add (low) or trim (high) to get back inside the range. */
  amount: number;
}

/** Where `pct` sits against `range`, and about how much money moves it back inside. */
export function checkRange(key: string, label: string, value: number, total: number, range: TargetRange): TargetCheck {
  const pct = total > 0 ? (value / total) * 100 : 0;
  let status: TargetStatus = 'ok';
  let amount = 0;
  if (total > 0 && pct < range.min - 0.05) {
    status = 'low';
    // Money added to this sector also grows the total: (v + x) / (T + x) = min
    const m = range.min / 100;
    amount = Math.max(0, (m * total - value) / (1 - m));
  } else if (total > 0 && pct > range.max + 0.05) {
    status = 'high';
    // Selling x from this sector shrinks the total too: (v - x) / (T - x) = max
    const M = range.max / 100;
    amount = Math.max(0, (value - M * total) / (1 - M));
  }
  return { key, label, pct, range, status, amount };
}

/** Checks every sector that has a target. */
export function checkTargets(
  rows: SectorRow[],
  total: number,
  targets: Record<string, TargetRange>
): { bySector: Map<string, TargetCheck>; off: TargetCheck[] } {
  const bySector = new Map<string, TargetCheck>();
  for (const r of rows) {
    const t = targets[r.key];
    if (t) bySector.set(r.key, checkRange(r.key, r.label, r.value, total, t));
  }
  return { bySector, off: [...bySector.values()].filter((c) => c.status !== 'ok') };
}
