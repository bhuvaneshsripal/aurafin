/**
 * Rule-based "smart insights": plain-English observations about the portfolio,
 * ranked by urgency. Pure function; the caller supplies already-resolved data
 * and a money formatter (so privacy mode is respected).
 */
import type { Goal } from '../types';
import type { UpcomingEvent } from './upcomingEvents';
import type { CategorySlice, DriftRow, RiskReport } from './portfolioAnalytics';
import type { UnrealisedLot } from './capitalGains';

export type InsightLevel = 'act' | 'watch' | 'good';

export interface Insight {
  id: string;
  level: InsightLevel;
  title: string;
  detail: string;
  /** In-app route that opens the relevant screen. */
  to?: string;
}

export interface InsightInput {
  total: number;
  slices: CategorySlice[];
  risk: RiskReport;
  liquid: number;
  monthlyExpense: number;
  liabilities: number;
  drift: DriftRow[];
  hasTargets: boolean;
  events: UpcomingEvent[];
  goals: Goal[];
  lots: UnrealisedLot[];
  today: Date;
  fmt: (v: number) => string;
}

const RANK: Record<InsightLevel, number> = { act: 0, watch: 1, good: 2 };

export function buildInsights(i: InsightInput): Insight[] {
  const out: Insight[] = [];
  if (i.total <= 0) return out;

  const top = i.risk.holdings[0];
  if (top && top.pct > 20) {
    out.push({ id: `conc-${top.asset.id}`, level: top.pct > 30 ? 'act' : 'watch', title: `${top.asset.name} is ${top.pct.toFixed(0)}% of your portfolio`, detail: 'One position this large can swing your whole net worth. Consider trimming toward 10-15%.', to: '/wealth?tab=analytics&view=risk' });
  }

  if (i.monthlyExpense > 0) {
    const runway = i.liquid / i.monthlyExpense;
    if (runway < 3) {
      out.push({ id: 'ef-low', level: 'act', title: `Emergency fund covers ${runway.toFixed(1)} months`, detail: `Aim for at least 6 months of expenses (about ${i.fmt(i.monthlyExpense * 6)}) in cash, FDs or liquid funds.`, to: '/essentials' });
    } else if (runway > 18 && i.liquid / i.total > 0.25) {
      out.push({ id: 'cash-idle', level: 'watch', title: `${runway.toFixed(0)} months of expenses sitting in liquid assets`, detail: 'Beyond a 6-12 month cushion, extra cash loses to inflation. Consider moving some into long-term investments.', to: '/wealth?tab=analytics&view=allocation' });
    }
  }

  if (i.hasTargets) {
    const off = i.drift.filter((r) => r.status !== 'on_track');
    if (off.length > 0) {
      const w = off[0];
      out.push({ id: `drift-${off.map((r) => r.key).join('')}`, level: Math.abs(w.driftPct) > 10 ? 'act' : 'watch', title: `${off.length} asset class${off.length === 1 ? ' is' : 'es are'} off target`, detail: `${w.label} is ${Math.abs(w.driftPct).toFixed(0)} points ${w.driftPct > 0 ? 'over' : 'under'} its target. New money can fix this without selling.`, to: '/wealth?tab=analytics&view=allocation' });
    }
  }

  const soon = i.events.filter((e) => e.kind === 'maturity' && e.daysAway <= 14);
  for (const e of soon.slice(0, 2)) {
    out.push({ id: `evt-${e.id}`, level: e.daysAway <= 3 ? 'act' : 'watch', title: `${e.title} ${e.daysAway === 0 ? 'today' : `in ${e.daysAway} day${e.daysAway === 1 ? '' : 's'}`}`, detail: e.amount ? `About ${i.fmt(e.amount)} comes due. Decide now whether to renew or reinvest.` : 'Decide whether to renew or reinvest.', to: '/wealth?tab=analytics&view=calendar' });
  }

  for (const g of i.goals) {
    if (!g.targetDate || g.targetAmount <= 0 || g.currentAmount >= g.targetAmount) continue;
    const days = Math.round((new Date(g.targetDate).getTime() - i.today.getTime()) / 86400000);
    const funded = g.currentAmount / g.targetAmount;
    if (days >= 0 && days <= 120 && funded < 0.8) {
      out.push({ id: `goal-${g.id}`, level: 'act', title: `${g.name} is ${(funded * 100).toFixed(0)}% funded with ${days} days left`, detail: `${i.fmt(g.targetAmount - g.currentAmount)} is still needed.`, to: '/essentials' });
    }
  }

  // India's tax year ends on 31 March: Jan-Mar is the window to harvest.
  const month = i.today.getMonth();
  const taxWindow = month >= 0 && month <= 2;
  const losses = i.lots.filter((l) => l.gain < -1);
  const lossTotal = losses.reduce((s, l) => s + -l.gain, 0);
  if (taxWindow && lossTotal > 0) {
    out.push({ id: 'tax-harvest', level: 'watch', title: `${i.fmt(lossTotal)} of unrealised losses could offset gains`, detail: 'The financial year ends on 31 March. Booking losses before then can reduce tax on gains.', to: '/wealth?tab=analytics&view=tax' });
  }
  const ltGain = i.lots.filter((l) => l.group === 'equity' && l.term === 'long' && l.gain > 0).reduce((s, l) => s + l.gain, 0);
  if (taxWindow && ltGain > 25000) {
    out.push({ id: 'tax-exempt', level: 'watch', title: 'Use the tax-free long-term gain allowance', detail: `You hold about ${i.fmt(ltGain)} of long-term equity gains. Selling and rebuying up to the yearly exemption resets your cost price tax-free.`, to: '/wealth?tab=analytics&view=tax' });
  }

  if (i.liabilities > 0 && i.liabilities / (i.total + i.liabilities) > 0.5) {
    out.push({ id: 'debt-high', level: 'watch', title: 'Debt is over half of what you own', detail: 'Paying down the most expensive loan first usually beats most investment returns.', to: '/wealth?tab=liabilities' });
  }

  if (out.length === 0) {
    out.push({ id: 'all-good', level: 'good', title: 'Nothing needs attention', detail: 'Concentration, cash cushion and upcoming dates all look fine.' });
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
}
