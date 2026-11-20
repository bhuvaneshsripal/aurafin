import type { Snapshot } from '../types';

/**
 * Removes saved snapshots that are clearly bad readings: a short run (up to 3
 * days) that jumps far away from the line and then comes straight back, e.g.
 * a day saved from a wrong price (₹1.7L between two days at ~₹1.2L). Real
 * changes that stick (a new asset, a sale, a market move that stays) are kept,
 * because the points on either side of them do NOT agree with each other.
 * The newest point is the live value and is never removed.
 */
export function dropSpikes(points: Snapshot[]): Snapshot[] {
  const TOL = 0.2; // a point is "off the line" when it differs by more than 20%
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1);
  const out = [...points];
  const bad = new Set<number>();
  let prev = 0; // index of the last point kept, the baseline for what follows
  for (let i = 1; i < out.length; i++) {
    let dropped = 0;
    for (let len = 1; len <= 3 && i + len < out.length; len++) {
      const before = out[prev].netWorth;
      if (rel(out[i + len].netWorth, before) > TOL) continue; // the line did not come back: a real move
      let allOff = true;
      for (let k = i; k < i + len; k++) if (rel(out[k].netWorth, before) <= TOL) allOff = false;
      if (allOff) {
        for (let k = i; k < i + len; k++) bad.add(k);
        dropped = len;
        break;
      }
    }
    if (dropped) i += dropped - 1;
    else prev = i;
  }
  return bad.size ? out.filter((_, i) => !bad.has(i)) : out;
}
