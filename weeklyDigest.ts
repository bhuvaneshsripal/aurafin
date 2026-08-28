import type { Asset, Liability, Snapshot } from '../types';
import type { SipLiveEntry } from '../store/livePricesStore';
import { resolveAssetValues, type ResolvedAssetValues } from './assetValues';
import { formatCurrency } from './currency';
import { ASSET_CLASS_TO_CATEGORY } from './taxonomy';
import type { WeeklyDigestEmailParams } from './otp';

const DAY_MS = 24 * 60 * 60_000;
const WEEK_MS = 7 * DAY_MS;
// A snapshot is only usable as "a week ago" if it's within a day or so of
// exactly 7 days back — otherwise (e.g. the person's oldest snapshot is a
// month old) we'd be silently comparing against the wrong baseline instead
// of just omitting the week-over-week figure.
const WEEK_SNAPSHOT_TOLERANCE_MS = 1.5 * DAY_MS;
// Max holdings/updates listed per section so the email doesn't turn into
// a wall of text for people with large portfolios.
const MAX_LIST_ITEMS = 5;

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatWeekRange(now: Date) {
  const start = new Date(now.getTime() - 6 * DAY_MS);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `${fmt(start)} \u2013 ${fmt(now)}, ${now.getFullYear()}`;
}

// Asset names are free text the person typed themselves, and they get
// dropped straight into an HTML email by EmailJS (no escaping happens on
// EmailJS's end). Escaping here stops a name like "Fund <b>X</b>" or
// "AT&T" from breaking the layout or being rendered as markup.
function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface WeeklyDigestInputs {
  toName: string;
  assets: Asset[];
  liabilities: Liability[];
  livePrices: Record<string, number>;
  sipValues: Record<string, SipLiveEntry>;
  goldPricePerGram: number | null;
  snapshots: Snapshot[];
  now?: Date;
}

/**
 * Computes every field the weekly digest email template needs from the
 * current portfolio state. Pure and side-effect free so it can be called
 * both by the Saturday 10 AM auto-scheduler and by a manual "send test
 * digest" button, guaranteeing they always show identical, real numbers
 * rather than one of them falling back to placeholder/zero values.
 */
export function buildWeeklyDigestPayload(
  inputs: WeeklyDigestInputs
): Omit<WeeklyDigestEmailParams, 'toEmail'> {
  const { toName, assets, liabilities, livePrices, sipValues, goldPricePerGram, snapshots } = inputs;
  const now = inputs.now ?? new Date();

  // Resolve every asset's live value/invested/P&L once, the same way the
  // Dashboard does (including SIP and gold live pricing) — every figure
  // below is derived from this single pass.
  const resolved: { asset: Asset; r: ResolvedAssetValues }[] = assets.map((asset) => ({
    asset,
    r: resolveAssetValues(asset, livePrices, sipValues, goldPricePerGram),
  }));

  const totalAssets = resolved.reduce((s, { r }) => s + r.value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const totalInvested = resolved.reduce((s, { asset, r }) => s + (r.invested ?? asset.value), 0);
  const totalPnl = totalAssets - totalInvested;
  const overallReturnPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Look for a snapshot taken ~7 days ago to show the week's move, like
  // Zerodha's digest does. Snapshots are taken manually in this app (not
  // automatic daily ones), so there's no guarantee one exists at exactly
  // the right distance — if none is close enough, the digest just omits
  // the week-over-week figures rather than showing a misleading number.
  const weekAgoSnapshot = snapshots
    .map((snap) => ({ snap, age: Math.abs(now.getTime() - new Date(snap.date).getTime() - WEEK_MS) }))
    .filter(({ age }) => age <= WEEK_SNAPSHOT_TOLERANCE_MS)
    .sort((a, b) => a.age - b.age)[0]?.snap;

  const weeklyPnl = weekAgoSnapshot ? totalAssets - weekAgoSnapshot.totalAssets : null;
  const weeklyReturnPercent =
    weeklyPnl !== null && weekAgoSnapshot!.totalAssets !== 0
      ? (weeklyPnl / weekAgoSnapshot!.totalAssets) * 100
      : null;

  // Best/worst performer: there's no per-asset price history, only today's
  // live numbers, so this ranks by each holding's all-time return rather
  // than its move this specific week.
  const ranked = resolved
    .filter(({ r }) => r.pnlPercent !== undefined && Number.isFinite(r.pnlPercent))
    .sort((a, b) => b.r.pnlPercent! - a.r.pnlPercent!);
  const best = ranked[0];
  const worst = ranked.length > 1 ? ranked[ranked.length - 1] : undefined;

  const stocksUp = resolved.filter(({ r }) => r.pnl !== undefined && r.pnl > 0).length;
  const stocksDown = resolved.filter(({ r }) => r.pnl !== undefined && r.pnl < 0).length;

  const topHoldings =
    [...resolved]
      .sort((a, b) => b.r.value - a.r.value)
      .slice(0, MAX_LIST_ITEMS)
      .map(({ asset, r }) => {
        const pct = r.pnlPercent !== undefined ? ` (${formatPercent(r.pnlPercent)})` : '';
        return `${escapeHtml(asset.name)} \u2014 ${formatCurrency(r.value)}${pct}`;
      })
      .join('<br>') || 'No holdings yet';

  const categoryTotals = new Map<string, number>();
  resolved.forEach(({ asset, r }) => {
    const label = ASSET_CLASS_TO_CATEGORY[asset.assetClass]?.label ?? 'Other';
    categoryTotals.set(label, (categoryTotals.get(label) ?? 0) + r.value);
  });
  const sectorAllocation =
    totalAssets > 0
      ? [...categoryTotals.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, value]) => `${label}: ${((value / totalAssets) * 100).toFixed(1)}%`)
          .join('<br>')
      : 'No holdings yet';

  const transactions =
    assets
      .filter((a) => now.getTime() - a.updatedAt <= WEEK_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_LIST_ITEMS)
      .map(
        (a) =>
          `${escapeHtml(a.name)} \u2014 updated ${new Date(a.updatedAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
          })}`
      )
      .join('<br>') || 'No changes to your holdings this week';

  const insights = [
    weeklyPnl !== null
      ? weeklyPnl >= 0
        ? `Your portfolio is up ${formatCurrency(weeklyPnl)} this week.`
        : `Your portfolio is down ${formatCurrency(Math.abs(weeklyPnl))} this week.`
      : `Not enough snapshot history yet to show this week's move \u2014 take a snapshot regularly to unlock it.`,
    best ? `${escapeHtml(best.asset.name)} is your top performer, ${formatPercent(best.r.pnlPercent!)} overall.` : null,
    totalLiabilities > 0
      ? `You're carrying ${formatCurrency(totalLiabilities)} in liabilities against ${formatCurrency(totalAssets)} in assets.`
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    toName: escapeHtml(toName),
    week: formatWeekRange(now),
    portfolioValue: formatCurrency(totalAssets),
    totalInvested: formatCurrency(totalInvested),
    totalProfitLoss: formatCurrency(totalPnl),
    overallReturn: formatPercent(overallReturnPercent),
    weeklyProfitLoss: weeklyPnl !== null ? formatCurrency(weeklyPnl) : 'N/A',
    weeklyReturn: weeklyReturnPercent !== null ? formatPercent(weeklyReturnPercent) : 'N/A',
    bestPerformer: best ? `${escapeHtml(best.asset.name)} (${formatPercent(best.r.pnlPercent!)})` : 'N/A',
    worstPerformer: worst ? `${escapeHtml(worst.asset.name)} (${formatPercent(worst.r.pnlPercent!)})` : 'N/A',
    stocksUp: String(stocksUp),
    stocksDown: String(stocksDown),
    topHoldings,
    sectorAllocation,
    transactions,
    insights,
  };
}
