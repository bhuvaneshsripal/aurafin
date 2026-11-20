import type { Asset } from '../types';
import {
  buildCapAllocation,
  buildSectorAllocation,
  classifyAsset,
  isSectorAsset,
  type SectorDef,
  type SectorProfile,
} from './sectors';
import type { TargetRange } from '../store/sectorTargetsStore';
import type { HoldingPnl } from './investmentPnl';

/**
 * Portfolio score (0-100) for your stocks & ETFs, built from seven checks.
 * Everything is computed from your own holdings at current value; nothing is
 * invented. A check with nothing to measure (e.g. no stocks, no sector targets
 * in that group) is left out and the rest are scaled back up to 100.
 */

export const SINGLE_STOCK_LIMIT_PCT = 5;
export const WEAK_LOSS_PCT = 10; // a holding this far below cost counts as "weak"
export const MIN_HOLDINGS = 15;
export const CAP_TARGETS: Record<'large' | 'mid' | 'small', TargetRange> = {
  large: { min: 60, max: 80 },
  mid: { min: 20, max: 40 },
  small: { min: 0, max: 30 },
};
const BASIC_SECTORS = ['banking', 'financial', 'capmarket'];
const MAJOR_SECTORS = ['auto', 'it', 'capgoods', 'defence', 'pharma', 'power'];

export type Band = 'less' | 'adequate' | 'more';
export interface Finding {
  label: string;
  /** What to show next to the label, e.g. "5.2%" */
  detail: string;
  band?: Band;
  /** Red/green hint for the row. */
  tone?: 'good' | 'bad' | 'neutral';
}
export interface Criterion {
  key: string;
  title: string;
  /** Points earned and available (before the scale-up to 100). */
  score: number;
  max: number;
  summary: string;
  findings: Finding[];
  how: string;
}
export interface PortfolioScore {
  /** 0-100, whole number. */
  total: number;
  rating: { label: string; tone: 'bad' | 'warn' | 'ok' | 'good' | 'great' };
  criteria: Criterion[];
  hasData: boolean;
}

export function ratingFor(score: number): PortfolioScore['rating'] {
  if (score < 30) return { label: 'Very poor', tone: 'bad' };
  if (score < 60) return { label: 'Poor', tone: 'warn' };
  if (score < 80) return { label: 'Average', tone: 'ok' };
  if (score < 90) return { label: 'Good', tone: 'good' };
  return { label: 'Excellent', tone: 'great' };
}

const pct1 = (p: number) => `${p.toFixed(p < 10 ? 2 : 1)}%`;

/** 1 inside [min,max]; otherwise falls off in proportion to how far outside it is. */
export function rangeCredit(pct: number, r: TargetRange): number {
  if (pct >= r.min && pct <= r.max) return 1;
  if (pct < r.min) return r.min > 0 ? Math.max(0, pct / r.min) : 1;
  return Math.max(0, 1 - (pct - r.max) / Math.max(1, 100 - r.max));
}
const bandOf = (pct: number, r: TargetRange): Band => (pct < r.min ? 'less' : pct > r.max ? 'more' : 'adequate');

export function computePortfolioScore(input: {
  items: { asset: Asset; value: number }[];
  profiles: Record<string, SectorProfile | null | undefined>;
  targets: Record<string, TargetRange>;
  customs: SectorDef[];
  holdings: HoldingPnl[];
}): PortfolioScore {
  const { profiles, targets, customs, holdings } = input;
  const eligible = input.items.filter((i) => isSectorAsset(i.asset) && i.value > 0);
  const total = eligible.reduce((s, i) => s + i.value, 0);
  if (total <= 0) return { total: 0, rating: ratingFor(0), criteria: [], hasData: false };

  const criteria: Criterion[] = [];

  // 1 ── Single stock max 5% ------------------------------------------------
  const stocks = eligible.filter((i) => i.asset.assetClass !== 'etf');
  const stockTotal = stocks.reduce((s, i) => s + i.value, 0);
  if (stockTotal > 0) {
    const rows = stocks
      .map((i) => ({ name: i.asset.name, pct: (i.value / stockTotal) * 100 }))
      .sort((a, b) => b.pct - a.pct);
    const over = rows.filter((r) => r.pct > SINGLE_STOCK_LIMIT_PCT);
    const excess = over.reduce((s, r) => s + (r.pct - SINGLE_STOCK_LIMIT_PCT), 0);
    const credit = Math.max(0, 1 - excess / 30);
    criteria.push({
      key: 'single',
      title: `Single stock max ${SINGLE_STOCK_LIMIT_PCT}%`,
      max: 15,
      score: 15 * credit,
      summary: over.length ? `${over.length} stock${over.length === 1 ? ' is' : 's are'} above the limit` : 'No stock is above the limit',
      findings: over.map((r) => ({ label: r.name, detail: pct1(r.pct), tone: 'bad' as const })),
      how: `Keep each stock at or below ${SINGLE_STOCK_LIMIT_PCT}% of your stocks. Trim the heaviest ones or add to the rest. Each extra point above the limit costs score (30 points of excess = zero).`,
    });
  }

  // Sector shares (stocks + ETFs) ------------------------------------------
  const trackedKeys = Object.keys(targets);
  const { rows: sectorRows } = buildSectorAllocation(eligible, profiles, trackedKeys, customs);
  const sectorGroup = (key: string, title: string, keys: string[], how: string) => {
    const group = sectorRows.filter((r) => keys.includes(r.key) && targets[r.key]);
    if (group.length === 0) return;
    let credit = 0;
    const findings: Finding[] = [];
    for (const r of group) {
      const range = targets[r.key];
      credit += rangeCredit(r.pct, range);
      const band = bandOf(r.pct, range);
      findings.push({
        label: r.label,
        detail: `${pct1(r.pct)}  (target ${range.min}–${range.max}%)`,
        band,
        tone: band === 'adequate' ? 'good' : 'bad',
      });
    }
    criteria.push({
      key,
      title,
      max: 10,
      score: (10 * credit) / group.length,
      summary: `${findings.filter((f) => f.band === 'adequate').length} of ${group.length} sectors inside their target`,
      findings,
      how,
    });
  };
  sectorGroup('basic', 'Basic sectors (financial)', BASIC_SECTORS, 'Banking, finance and capital markets should each sit inside their target range. Change the ranges from Sector allocation → targets.');
  sectorGroup('major', 'Major sectors', MAJOR_SECTORS, 'Auto, IT, capital goods, defence, pharma and power: bring each one inside its target range.');
  const otherKeys = trackedKeys.filter((k) => !BASIC_SECTORS.includes(k) && !MAJOR_SECTORS.includes(k));
  sectorGroup('other', 'Other sectors', otherKeys, 'Gold and any sectors you added yourself should sit inside their target range.');

  // 5 ── Capital allocation ---------------------------------------------------
  const cap = buildCapAllocation(eligible, profiles);
  const sized = (['large', 'mid', 'small'] as const).map((k) => ({ k, row: cap.rows.find((r) => r.key === k) }));
  const sizedTotal = sized.reduce((s, x) => s + (x.row?.value ?? 0), 0);
  if (sizedTotal > 0) {
    let credit = 0;
    const findings: Finding[] = sized.map(({ k, row }) => {
      const p = ((row?.value ?? 0) / sizedTotal) * 100;
      const r = CAP_TARGETS[k];
      credit += rangeCredit(p, r);
      const band = bandOf(p, r);
      return {
        label: row?.label ?? k,
        detail: `${pct1(p)}  [${r.min}–${r.max}%]`,
        band,
        tone: band === 'adequate' ? 'good' : 'bad',
      };
    });
    criteria.push({
      key: 'cap',
      title: 'Capital allocation',
      max: 10,
      score: (10 * credit) / 3,
      summary: `${findings.filter((f) => f.band === 'adequate').length} of 3 size bands inside range`,
      findings,
      how: 'Aim for roughly 60–80% large cap, 20–40% mid cap and at most 30% small cap (ETFs are left out of this mix).',
    });
  }

  // 6 ── Enough holdings -----------------------------------------------------
  {
    const n = stocks.length;
    const credit = Math.min(1, n / MIN_HOLDINGS);
    criteria.push({
      key: 'count',
      title: `Spread across ${MIN_HOLDINGS}+ stocks`,
      max: 15,
      score: 15 * credit,
      summary: `${n} stock${n === 1 ? '' : 's'} held`,
      findings: [{ label: 'Stocks held', detail: `${n} / ${MIN_HOLDINGS}`, tone: n >= MIN_HOLDINGS ? 'good' : 'bad' }],
      how: `Holding at least ${MIN_HOLDINGS} different stocks keeps one bad company from sinking the portfolio.`,
    });
  }

  // 7 ── Potential stocks (losers) -------------------------------------------
  {
    const byId = new Map(stocks.map((i) => [i.asset.id, i.value]));
    const rows = holdings
      .filter((h) => byId.has(h.asset.id) && h.remainingQty > 0 && h.unrealizedPnlPercent !== undefined)
      .map((h) => ({ h, value: byId.get(h.asset.id) ?? 0, pnl: h.unrealizedPnlPercent as number }));
    if (rows.length > 0) {
      const base = rows.reduce((s, r) => s + r.value, 0);
      const weak = rows.filter((r) => r.pnl <= -WEAK_LOSS_PCT);
      const weakShare = base > 0 ? weak.reduce((s, r) => s + r.value, 0) / base : 0;
      const credit = Math.max(0, 1 - weakShare / 0.4);
      const losers = rows.filter((r) => r.pnl < 0).sort((a, b) => a.pnl - b.pnl);
      criteria.push({
        key: 'potential',
        title: 'Potential stocks',
        max: 30,
        score: 30 * credit,
        summary: weak.length
          ? `${weak.length} holding${weak.length === 1 ? ' is' : 's are'} down ${WEAK_LOSS_PCT}%+ from your cost`
          : 'No holding is down more than ' + WEAK_LOSS_PCT + '%',
        findings: losers.map((r) => ({
          label: r.h.asset.name,
          detail: `${r.pnl.toFixed(0)}%${r.h.currentPrice ? ` · CMP ${r.h.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''} · Qty ${r.h.remainingQty}`,
          tone: r.pnl <= -WEAK_LOSS_PCT ? ('bad' as const) : ('neutral' as const),
        })),
        how: `Review stocks trading more than ${WEAK_LOSS_PCT}% below your average cost. Score drops as the share of money in such stocks rises (40% of the portfolio = zero).`,
      });
    }
  }

  const max = criteria.reduce((s, c) => s + c.max, 0);
  const got = criteria.reduce((s, c) => s + c.score, 0);
  const totalScore = max > 0 ? Math.round((got / max) * 100) : 0;
  return { total: totalScore, rating: ratingFor(totalScore), criteria, hasData: true };
}

// re-export for convenience in the card
export { classifyAsset };
