/** Upcoming money events: deposit maturities, SIP/RD debits and goal deadlines. */
import type { Asset, Goal } from '../types';
import { computeMaturityInfo, computeSipProgress, shiftMonths } from './assetValues';
import { DEPOSIT_LIKE_CLASSES, RECURRING_DEPOSIT_CLASSES, SIP_CLASSES } from './taxonomy';
import { toIsoDate } from './date';

export type EventKind = 'maturity' | 'sip' | 'rd' | 'goal';

export interface UpcomingEvent {
  id: string;
  kind: EventKind;
  date: string; // ISO
  title: string;
  subtitle?: string;
  /** Money coming in (+) or going out (-). Undefined when unknown. */
  amount?: number;
  currency: string;
  daysAway: number;
}

function daysFromToday(iso: string, today: Date): number {
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const b = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function buildUpcomingEvents(assets: Asset[], goals: Goal[], horizonDays: number, today = new Date()): UpcomingEvent[] {
  const out: UpcomingEvent[] = [];
  const push = (e: Omit<UpcomingEvent, 'daysAway'>) => {
    const d = daysFromToday(e.date, today);
    if (d >= 0 && d <= horizonDays) out.push({ ...e, daysAway: d });
  };

  for (const a of assets) {
    if (DEPOSIT_LIKE_CLASSES.has(a.assetClass) && a.maturityDate) {
      const m = computeMaturityInfo(a);
      push({
        id: `mat-${a.id}`,
        kind: 'maturity',
        date: a.maturityDate.slice(0, 10),
        title: `${a.name} matures`,
        subtitle: a.institution,
        amount: m.maturityAmount ?? a.value,
        currency: a.currency,
      });
    }
    if (SIP_CLASSES.has(a.assetClass) && a.sipAmount) {
      const p = computeSipProgress(a, today);
      if (p.nextInstallmentDate) {
        push({ id: `sip-${a.id}`, kind: 'sip', date: p.nextInstallmentDate, title: `${a.name} SIP`, subtitle: a.sipFrequency === 'quarterly' ? 'Quarterly SIP' : 'Monthly SIP', amount: -a.sipAmount, currency: a.currency });
      }
    }
    if (RECURRING_DEPOSIT_CLASSES.has(a.assetClass) && a.monthlyInstallment && a.startDate) {
      const day = +a.startDate.slice(8, 10) || 1;
      const end = a.maturityDate ? new Date(a.maturityDate).getTime() : Infinity;
      for (let i = 0; i < 24; i++) {
        const d = shiftMonths(today.getFullYear(), today.getMonth(), day, i);
        if (d.getTime() > end) break;
        const iso = toIsoDate(d);
        if (daysFromToday(iso, today) < 0) continue;
        push({ id: `rd-${a.id}-${iso}`, kind: 'rd', date: iso, title: `${a.name} instalment`, subtitle: 'Recurring deposit', amount: -a.monthlyInstallment, currency: a.currency });
      }
    }
  }
  for (const g of goals) {
    if (g.targetDate) {
      push({ id: `goal-${g.id}`, kind: 'goal', date: g.targetDate.slice(0, 10), title: `Goal: ${g.name}`, subtitle: 'Target date', amount: g.targetAmount, currency: g.currency });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
