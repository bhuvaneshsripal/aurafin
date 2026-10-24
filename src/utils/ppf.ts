import type { Asset, PpfDetails } from '../types';

/**
 * Public Provident Fund maths, following how the scheme actually works rather than a
 * generic compound-interest formula:
 *
 *  - Deposits: ₹500 minimum and ₹1.5 lakh maximum per financial year (Apr–Mar). Anything
 *    above the limit earns no interest.
 *  - Interest is worked out every month on the lowest balance between the 5th and the end of
 *    that month — so a deposit made by the 5th earns for that month, one made later only
 *    starts earning from the next month.
 *  - Interest is NOT added to the balance each month: it is credited once, on 31 March, and
 *    only then starts earning interest itself (annual compounding).
 *  - The account matures 15 years after the end of the financial year it was opened in, and can
 *    then be extended in 5-year blocks, with or without fresh deposits.
 *  - Loan: from the 3rd to the 6th financial year, up to 25% of the balance at the end of the
 *    2nd preceding year. Partial withdrawal: from the 7th financial year, up to 50% of the
 *    balance at the end of the 4th preceding year or the last year, whichever is lower.
 *
 * The government resets the rate every quarter; one rate is applied to the whole period here
 * (a good estimate while the rate is steady — passbook figures will differ by a little).
 * Everything is an estimate, never a bank statement.
 */

export const PPF_MIN_DEPOSIT = 500;
export const PPF_MAX_DEPOSIT = 150000;
/** Rate for Oct–Dec 2026 (unchanged for ten straight quarters) — always editable. */
export const DEFAULT_PPF_RATE = 7.1;
export const PPF_TERM_YEARS = 15;
export const PPF_EXTENSION_YEARS = 5;
/** Health & education cess on the 80C saving. */
const CESS = 1.04;
/** Deposits made on or before this day of the month earn interest for that month. */
const CUTOFF_DAY = 5;

const pad2 = (n: number) => String(n).padStart(2, '0');
/** A real calendar date in yyyy-mm-dd form (rejects things like 2026-02-31 or 2026-13-01). */
const isoOk = (v?: string): v is string => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const y = +v.slice(0, 4);
  const m = +v.slice(5, 7);
  const d = +v.slice(8, 10);
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate();
};
const toIso = (y: number, m0: number, d: number) => `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
const parse = (iso: string) => ({ y: +iso.slice(0, 4), m0: +iso.slice(5, 7) - 1, d: +iso.slice(8, 10) });
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

/** Absolute month number (year × 12 + zero-based month). */
const monthIdx = (y: number, m0: number) => y * 12 + m0;
const idxYear = (i: number) => Math.floor(i / 12);
const idxMonth = (i: number) => i % 12;
/** Financial year a month belongs to, named by the calendar year it starts in. */
const fyOfIdx = (i: number) => (idxMonth(i) >= 3 ? idxYear(i) : idxYear(i) - 1);

export const fyLabel = (fyStart: number) => `${fyStart}-${pad2((fyStart + 1) % 100)}`;
export const fyOfIso = (iso: string) => {
  const { y, m0 } = parse(iso);
  return fyOfIdx(monthIdx(y, m0));
};

/** 31 March at the end of the term (15 years after the end of the opening financial year). */
export function ppfMaturityDate(openingDate?: string): string | undefined {
  if (!isoOk(openingDate)) return undefined;
  return toIso(fyOfIso(openingDate) + 1 + PPF_TERM_YEARS, 2, 31);
}

/* ------------------------------------------------------------------------------------------ */
/* Month-by-month engine                                                                       */
/* ------------------------------------------------------------------------------------------ */

interface Sim {
  /** Balance that earns interest — deposits plus interest already credited on past 31 Marches. */
  bal: number;
  /** Interest earned this financial year, credited on 31 March. */
  accrued: number;
  deposited: number;
  fyDep: Record<number, number>;
  fyInt: Record<number, number>;
  /** Balance right after each 31 March credit, keyed by the financial year that ended. */
  closing: Record<number, number>;
  /** Running total deposited at each of those year-ends. */
  closingDep: Record<number, number>;
}

const newSim = (bal = 0, deposited = 0): Sim => ({ bal, accrued: 0, deposited, fyDep: {}, fyInt: {}, closing: {}, closingDep: {} });

interface MonthDep {
  early: number; // on or before the 5th — earns for this month
  late: number; // after the 5th — earns from next month
}

function stepMonth(st: Sim, i: number, dep: MonthDep, fraction: number, ratePct: number) {
  const fy = fyOfIdx(i);
  const room = () => Math.max(0, PPF_MAX_DEPOSIT - (st.fyDep[fy] ?? 0));
  const add = (amount: number) => {
    const a = Math.min(Math.max(0, amount), room());
    if (a <= 0) return;
    st.bal += a;
    st.deposited += a;
    st.fyDep[fy] = (st.fyDep[fy] ?? 0) + a;
  };
  add(dep.early);
  const interest = (st.bal * ratePct) / 1200 * fraction;
  st.accrued += interest;
  st.fyInt[fy] = (st.fyInt[fy] ?? 0) + interest;
  add(dep.late);
  if (idxMonth(i) === 2 && fraction >= 1) {
    st.bal += st.accrued;
    st.accrued = 0;
    st.closing[fy] = st.bal;
    st.closingDep[fy] = st.deposited;
  }
}

/** Real deposits in the ledger, bucketed by month, up to (and including) today. */
function bucketLedger(details: PpfDetails, todayIso: string, startMi: number): { map: Map<number, MonthDep>; ignored: number } {
  const map = new Map<number, MonthDep>();
  let ignored = 0;
  for (const d of details.deposits ?? []) {
    if (!isoOk(d.date) || !(d.amount > 0) || d.date > todayIso) continue;
    const { y, m0, d: day } = parse(d.date);
    const i = monthIdx(y, m0);
    if (i < startMi) {
      ignored++;
      continue;
    }
    const cur = map.get(i) ?? { early: 0, late: 0 };
    if (day <= CUTOFF_DAY) cur.early += d.amount;
    else cur.late += d.amount;
    map.set(i, cur);
  }
  return { map, ignored };
}

function startOf(details: PpfDetails): { startMi: number; bal0: number; dep0: number; checkpointFy?: number } | null {
  if (details.checkpointFy && (details.checkpointBalance ?? 0) > 0) {
    const bal = details.checkpointBalance as number;
    return {
      startMi: monthIdx(details.checkpointFy, 3),
      bal0: bal,
      dep0: details.depositedToCheckpoint && details.depositedToCheckpoint > 0 ? details.depositedToCheckpoint : bal,
      checkpointFy: details.checkpointFy,
    };
  }
  const dates = (details.deposits ?? []).filter((d) => isoOk(d.date) && d.amount > 0).map((d) => d.date).sort();
  const first = [details.openingDate, dates[0]].filter(isoOk).sort()[0];
  if (!first || !dates.length) return null;
  const { y, m0 } = parse(first);
  return { startMi: monthIdx(y, m0), bal0: 0, dep0: 0 };
}

function runHistory(details: PpfDetails, ratePct: number, today: Date, wholeCurrentMonth: boolean) {
  const start = startOf(details);
  if (!start) return null;
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
  const curMi = monthIdx(today.getFullYear(), today.getMonth());
  const { map, ignored } = bucketLedger(details, todayIso, start.startMi);
  const st = newSim(start.bal0, start.dep0);
  if (start.checkpointFy) {
    st.closing[start.checkpointFy - 1] = start.bal0;
    st.closingDep[start.checkpointFy - 1] = start.dep0;
  }
  const dim = daysInMonth(today.getFullYear(), today.getMonth());
  const curFraction = wholeCurrentMonth ? 1 : today.getDate() / dim;
  for (let i = start.startMi; i <= curMi; i++) {
    stepMonth(st, i, map.get(i) ?? { early: 0, late: 0 }, i === curMi ? curFraction : 1, ratePct);
  }
  return { st, ignored, start, curMi };
}

/* ------------------------------------------------------------------------------------------ */
/* Where the account stands today                                                              */
/* ------------------------------------------------------------------------------------------ */

export interface PpfNow {
  /** Credited balance plus interest earned so far this financial year (credited on 31 March). */
  currentValue: number;
  /** What the passbook would show: deposits + interest credited up to the last 31 March. */
  creditedBalance: number;
  accruedInterest: number;
  invested: number;
  interestEarned: number;
  fyDeposited: number;
  closing: Record<number, number>;
  ignoredDeposits: number;
}

export function computePpfNow(details: PpfDetails | undefined, ratePct: number, today = new Date()): PpfNow | null {
  if (!details) return null;
  const h = runHistory(details, ratePct, today, false);
  if (!h) return null;
  const { st, ignored, curMi } = h;
  const currentValue = st.bal + st.accrued;
  return {
    currentValue,
    creditedBalance: st.bal,
    accruedInterest: st.accrued,
    invested: st.deposited,
    interestEarned: Math.max(0, currentValue - st.deposited),
    fyDeposited: st.fyDep[fyOfIdx(curMi)] ?? 0,
    closing: st.closing,
    ignoredDeposits: ignored,
  };
}

/** The interest rate to use for an asset: its own, else the current declared rate. */
export const ppfRate = (rate?: number | string | null) => (Number(rate) > 0 ? Number(rate) : DEFAULT_PPF_RATE);

/* ------------------------------------------------------------------------------------------ */
/* Term, loan and withdrawal windows                                                           */
/* ------------------------------------------------------------------------------------------ */

type WindowState = 'before' | 'open' | 'closed';

export interface PpfStatus {
  openFy: number;
  /** 1 in the financial year the account was opened, 2 in the next, and so on. */
  fyIndex: number;
  maturityDate: string;
  withdrawableFrom: string;
  isMatured: boolean;
  /** Whole months left until maturity (0 once matured). */
  monthsLeft: number;
  /** Share of the 15-year term that has passed, 0–1. */
  termProgress: number;
  loan: { state: WindowState; from: string; to: string; max?: number; approx?: boolean };
  withdrawal: { state: 'before' | 'open'; from: string; max?: number; approx?: boolean };
}

export function ppfStatus(openingDate: string | undefined, now: PpfNow | null, today = new Date()): PpfStatus | null {
  if (!isoOk(openingDate)) return null;
  const openFy = fyOfIso(openingDate);
  const curFy = fyOfIdx(monthIdx(today.getFullYear(), today.getMonth()));
  const fyIndex = curFy - openFy + 1;
  const maturityDate = toIso(openFy + 1 + PPF_TERM_YEARS, 2, 31);
  const todayIso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
  const isMatured = todayIso > maturityDate;
  const mat = parse(maturityDate);
  const monthsLeft = isMatured ? 0 : Math.max(0, monthIdx(mat.y, mat.m0) - monthIdx(today.getFullYear(), today.getMonth()));
  const open = parse(openingDate);
  const totalMonths = Math.max(1, monthIdx(mat.y, mat.m0) - monthIdx(open.y, open.m0));
  const done = monthIdx(today.getFullYear(), today.getMonth()) - monthIdx(open.y, open.m0);

  const loanFrom = toIso(openFy + 2, 3, 1);
  const loanTo = toIso(openFy + 6, 2, 31);
  const loanState: WindowState = fyIndex < 3 ? 'before' : fyIndex <= 6 ? 'open' : 'closed';
  const loanBase = now?.closing[curFy - 2];

  const wdFrom = toIso(openFy + 6, 3, 1);
  const a = now?.closing[curFy - 4];
  const b = now?.closing[curFy - 1];
  const known = [a, b].filter((v): v is number => v !== undefined);

  return {
    openFy,
    fyIndex,
    maturityDate,
    // The day after maturity (1 April following the 31 March maturity date).
    withdrawableFrom: toIso(openFy + 1 + PPF_TERM_YEARS, 3, 1),
    isMatured,
    monthsLeft,
    termProgress: Math.min(1, Math.max(0, done / totalMonths)),
    loan: {
      state: loanState,
      from: loanFrom,
      to: loanTo,
      max: loanState === 'open' && loanBase !== undefined ? loanBase * 0.25 : undefined,
    },
    withdrawal: {
      state: fyIndex >= 7 ? 'open' : 'before',
      from: wdFrom,
      max: fyIndex >= 7 && known.length ? Math.min(...known) * 0.5 : undefined,
      approx: fyIndex >= 7 && known.length > 0 && known.length < 2,
    },
  };
}

/* ------------------------------------------------------------------------------------------ */
/* This financial year                                                                         */
/* ------------------------------------------------------------------------------------------ */

export interface PpfYearAdvice {
  fyLabel: string;
  deposited: number;
  headroom: number;
  belowMinimum: boolean;
  /** Next date a deposit still earns interest for that whole month. */
  nextCutoff: string;
  /** Instalments left (each by the 5th) between now and March. */
  instalmentsLeft: number;
  suggestedMonthly?: number;
  daysLeftInFy: number;
}

export function yearAdvice(fyDeposited: number, today = new Date()): PpfYearAdvice {
  const y = today.getFullYear();
  const m0 = today.getMonth();
  const fy = fyOfIdx(monthIdx(y, m0));
  const marchIdx = monthIdx(fy + 1, 2);
  const curIdx = monthIdx(y, m0);
  const instalmentsLeft = marchIdx - curIdx + (today.getDate() <= CUTOFF_DAY ? 1 : 0);
  const headroom = Math.max(0, PPF_MAX_DEPOSIT - fyDeposited);
  const cutIdx = today.getDate() <= CUTOFF_DAY ? curIdx : curIdx + 1;
  const endOfFy = Date.UTC(fy + 1, 2, 31);
  return {
    fyLabel: fyLabel(fy),
    deposited: fyDeposited,
    headroom,
    belowMinimum: fyDeposited < PPF_MIN_DEPOSIT,
    nextCutoff: toIso(idxYear(cutIdx), idxMonth(cutIdx), CUTOFF_DAY),
    instalmentsLeft,
    suggestedMonthly: instalmentsLeft > 0 && headroom > 0 ? headroom / instalmentsLeft : undefined,
    daysLeftInFy: Math.max(0, Math.round((endOfFy - Date.UTC(y, m0, today.getDate())) / 86_400_000)),
  };
}

/** Deposits beyond the yearly limit, per financial year — these earn nothing and aren't allowed. */
export function excessDeposits(details: PpfDetails | undefined): { fy: number; label: string; excess: number }[] {
  const totals: Record<number, number> = {};
  for (const d of details?.deposits ?? []) {
    if (!isoOk(d.date) || !(d.amount > 0)) continue;
    const fy = fyOfIso(d.date);
    totals[fy] = (totals[fy] ?? 0) + d.amount;
  }
  return Object.entries(totals)
    .filter(([, t]) => t > PPF_MAX_DEPOSIT)
    .map(([fy, t]) => ({ fy: +fy, label: fyLabel(+fy), excess: t - PPF_MAX_DEPOSIT }))
    .sort((x, y) => x.fy - y.fy);
}

/* ------------------------------------------------------------------------------------------ */
/* Projection                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface PpfYearRow {
  fy: number;
  label: string;
  deposited: number;
  interest: number;
  closing: number;
}

export interface PpfMilestone {
  label: string;
  date: string;
  balance: number;
  depositsFromNow: number;
  interestFromNow: number;
}

export interface PpfProjection {
  rows: PpfYearRow[];
  milestones: PpfMilestone[];
  /** Tax saved each year under old-regime 80C at the full limit, if a slab was given. */
  taxSavedPerYear?: number;
  taxSavedOverPlan?: number;
}

export function projectPpf(details: PpfDetails | undefined, ratePct: number, today = new Date()): PpfProjection | null {
  if (!details || !isoOk(details.openingDate)) return null;
  const h = runHistory(details, ratePct, today, true);
  const startMissing = !h;
  const st = h ? h.st : newSim();
  const curMi = monthIdx(today.getFullYear(), today.getMonth());
  const curFy = fyOfIdx(curMi);
  const openFy = fyOfIso(details.openingDate);
  const termEndFy = openFy + PPF_TERM_YEARS;
  const blocks = details.extensionBlocks ?? 0;
  const withDeposits = !!details.extensionWithDeposits;
  const endFy = termEndFy + PPF_EXTENSION_YEARS * blocks;
  if (endFy < curFy) return null;
  // Nothing to build on yet: with no passbook balance or deposits there is only the plan itself.
  if (startMissing && !(details.plannedYearlyDeposit && details.plannedYearlyDeposit > 0)) return null;

  const planned = Math.max(0, details.plannedYearlyDeposit ?? 0);
  const growth = Math.max(0, details.depositStepUpPct ?? 0) / 100;
  const mode = details.depositMode ?? 'lump';
  const targetFor = (fy: number) => Math.min(PPF_MAX_DEPOSIT, planned * Math.pow(1 + growth, Math.max(0, fy - curFy)));
  const depositsAllowed = (fy: number) => fy <= termEndFy || (blocks > 0 && withDeposits && fy <= endFy);

  const baseValue = st.bal + st.accrued;
  const baseDeposited = st.deposited;
  const curMarchIdx = monthIdx(curFy + 1, 2);
  const curHeadroom = Math.max(0, targetFor(curFy) - (st.fyDep[curFy] ?? 0));
  const monthsLeftCurFy = Math.max(1, curMarchIdx - curMi);

  const lastIdx = monthIdx(endFy + 1, 2);
  for (let i = curMi + 1; i <= lastIdx; i++) {
    const fy = fyOfIdx(i);
    let early = 0;
    if (depositsAllowed(fy) && planned > 0) {
      if (mode === 'monthly') {
        early = fy === curFy ? curHeadroom / monthsLeftCurFy : targetFor(fy) / 12;
      } else if (fy === curFy ? i === curMi + 1 : idxMonth(i) === 3) {
        early = fy === curFy ? curHeadroom : targetFor(fy);
      }
    }
    stepMonth(st, i, { early, late: 0 }, 1, ratePct);
  }

  const rows: PpfYearRow[] = [];
  for (let fy = curFy; fy <= endFy; fy++) {
    if (st.closing[fy] === undefined) continue;
    rows.push({ fy, label: fyLabel(fy), deposited: st.fyDep[fy] ?? 0, interest: st.fyInt[fy] ?? 0, closing: st.closing[fy] });
  }

  const milestones: PpfMilestone[] = [];
  const addMilestone = (fy: number, label: string) => {
    const bal = st.closing[fy];
    if (bal === undefined || fy < curFy) return;
    const depositsFromNow = (st.closingDep[fy] ?? baseDeposited) - baseDeposited;
    milestones.push({
      label,
      date: toIso(fy + 1, 2, 31),
      balance: bal,
      depositsFromNow,
      interestFromNow: Math.max(0, bal - baseValue - depositsFromNow),
    });
  };
  addMilestone(termEndFy, 'At maturity');
  for (let b = 1; b <= blocks; b++) addMilestone(termEndFy + PPF_EXTENSION_YEARS * b, `After ${b * PPF_EXTENSION_YEARS}-yr extension`);

  const slab = details.taxSlabPct ?? 0;
  let taxSavedPerYear: number | undefined;
  let taxSavedOverPlan: number | undefined;
  if (slab > 0) {
    taxSavedPerYear = (PPF_MAX_DEPOSIT * slab * CESS) / 100;
    let total = 0;
    for (const r of rows) total += (Math.min(r.deposited, PPF_MAX_DEPOSIT) * slab * CESS) / 100;
    taxSavedOverPlan = total;
  }

  return { rows, milestones, taxSavedPerYear, taxSavedOverPlan };
}

/** Tax saved so far this financial year (old regime 80C), if a slab was chosen. */
export const taxSavedSoFar = (fyDeposited: number, slabPct?: number) =>
  slabPct && slabPct > 0 ? (Math.min(fyDeposited, PPF_MAX_DEPOSIT) * slabPct * CESS) / 100 : undefined;

/* ------------------------------------------------------------------------------------------ */
/* Helpers for the rest of the app                                                             */
/* ------------------------------------------------------------------------------------------ */

/** Whether an asset carries enough PPF detail for the engine to own its value. */
export const hasPpfLedger = (asset: Asset) => !!computePpfNow(asset.ppf, ppfRate(asset.interestRate));

/** Maturity date + projected balance for reminders, without any extension. */
export function ppfMaturityInfo(asset: Asset, today = new Date()): { date?: string; amount?: number } {
  const date = ppfMaturityDate(asset.ppf?.openingDate ?? asset.startDate);
  const details = asset.ppf ? { ...asset.ppf, extensionBlocks: 0 as const } : undefined;
  const proj = projectPpf(details, ppfRate(asset.interestRate), today);
  return { date, amount: proj?.milestones[0]?.balance };
}

/** Old single-lump-sum PPF entries become a one-row ledger so nothing typed before is lost. */
export function migrateLegacyPpf(asset?: Asset | null): PpfDetails {
  if (!asset || asset.assetClass !== 'ppf') return {};
  const out: PpfDetails = {};
  if (isoOk(asset.startDate)) out.openingDate = asset.startDate;
  const principal = asset.investedValue ?? 0;
  if (isoOk(asset.startDate) && principal > 0) {
    out.deposits = [{ id: 'legacy-1', date: asset.startDate, amount: Math.min(principal, PPF_MAX_DEPOSIT) }];
  }
  return out;
}

/** Calendar years of the 31 Marches a passbook year-end balance can be taken from, newest first. */
export function checkpointYears(openingDate?: string, today = new Date()): number[] {
  const latest =
    today.getMonth() > 2 || (today.getMonth() === 2 && today.getDate() === 31) ? today.getFullYear() : today.getFullYear() - 1;
  const first = isoOk(openingDate) ? fyOfIso(openingDate) + 1 : latest - 20;
  const out: number[] = [];
  for (let y = latest; y >= Math.max(first, latest - 40); y--) out.push(y);
  return out;
}
