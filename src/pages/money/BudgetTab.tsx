import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  X,
  Wand2,
  Copy,
  Undo2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { useBudgetStore } from '../../store/budgetStore';
import { useTransactionsStore } from '../../store/transactionsStore';
import { useAuthStore } from '../../store/authStore';
import { useHouseholdProfilesStore } from '../../store/householdProfilesStore';
import { upsertDoc, removeDoc } from '../../hooks/useFirestoreSync';
import { BUDGET_CATEGORIES, budgetKey, canonicalCategory } from '../../utils/budgetCategories';
import { formatCurrency } from '../../utils/currency';
import { toIsoMonth } from '../../utils/date';
import { cn } from '../../components/ui/cn';
import type { BudgetItem } from '../../types';

// ---------------------------------------------------------------- helpers --

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function slugify(category: string) {
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'category';
}

const makeItem = (month: string, category: string, amount: number, currency = 'INR'): BudgetItem => ({
  id: `${month}-${slugify(category)}`,
  month,
  category,
  amount,
  currency,
});

type Basis = 'last' | 'avg3' | 'avg6';
const BASIS_LABEL: Record<Basis, string> = {
  last: 'Last month',
  avg3: '3-month average',
  avg6: '6-month average',
};
const BASIS_MONTHS: Record<Basis, number> = { last: 1, avg3: 3, avg6: 6 };
const ROUND_STEPS = [0, 10, 100, 500, 1000];
const BUFFERS = [0, 5, 10, 15, 20];
type SortKey = 'added' | 'amount' | 'used';
type Notice = { text: string; tone: 'ok' | 'warn'; undo?: BudgetItem[] };

const money = (n: number) => formatCurrency(n);

// -------------------------------------------------------------- component --

export default function BudgetTab() {
  const user = useAuthStore((s) => s.user);
  const budgetItems = useBudgetStore((s) => s.items);
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);

  const [month, setMonth] = useState(() => toIsoMonth());
  const [draft, setDraft] = useState<BudgetItem[]>([]);
  const [addOpen, setAddOpen] = useState(true);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>('added');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [panel, setPanel] = useState<null | 'suggest' | 'copy'>(null);

  // Auto-suggest options
  const [basis, setBasis] = useState<Basis>('avg3');
  const [buffer, setBuffer] = useState(0);
  const [roundTo, setRoundTo] = useState(100);
  const [overwrite, setOverwrite] = useState(false);
  const [addNew, setAddNew] = useState(true);

  // True once the person has touched this month's draft. Guards the resync
  // effect so a Firestore update mid-edit can't clobber unsaved changes.
  const [draftDirty, setDraftDirty] = useState(false);
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setDraftDirty(false);
    setPanel(null);
    setNotice(null);
  }, [month]);

  // (Re)load the draft when the month or its synced items change — see the
  // original note: Firestore may deliver after first mount, so we must not
  // lock in an empty draft. Skipped once the person is actively editing.
  useEffect(() => {
    if (draftDirty) return;
    const existing = budgetItems.filter((i) => i.month === month);
    setDraft(existing);
    setSavedIds(new Set(existing.map((i) => i.id)));
  }, [month, budgetItems, draftDirty]);

  const showNotice = (n: Notice) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(n);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 8000);
  };
  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  // Replace the draft, remembering the previous one so it can be undone.
  const commit = (next: BudgetItem[], text: string, tone: Notice['tone'] = 'ok') => {
    const prev = draft;
    setDraftDirty(true);
    setDraft(next);
    setPanel(null);
    showNotice({ text, tone, undo: prev });
  };

  // ---- unsaved-changes detection -----------------------------------------
  const savedForMonth = useMemo(() => budgetItems.filter((i) => i.month === month), [budgetItems, month]);
  const hasChanges = useMemo(() => {
    if (savedForMonth.length !== draft.length) return true;
    const saved = new Map(savedForMonth.map((i) => [i.id, i.amount]));
    return draft.some((i) => saved.get(i.id) !== (i.amount || 0));
  }, [savedForMonth, draft]);

  useEffect(() => {
    if (!hasChanges) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasChanges]);

  // ---- spending data (respects the active household profile) --------------
  const expenseTx = useMemo(
    () =>
      allTransactions.filter(
        (t) => t.type === 'expense' && (!activeProfileId || t.profileId === activeProfileId)
      ),
    [allTransactions, activeProfileId]
  );

  const incomeThisMonth = useMemo(
    () =>
      allTransactions
        .filter(
          (t) =>
            t.type === 'income' &&
            t.date.startsWith(month) &&
            (!activeProfileId || t.profileId === activeProfileId)
        )
        .reduce((s, t) => s + t.amount, 0),
    [allTransactions, activeProfileId, month]
  );

  // month -> categoryKey -> { name, total }
  const spendByMonth = useMemo(() => {
    const out = new Map<string, Map<string, { name: string; total: number }>>();
    for (const t of expenseTx) {
      const m = t.date.slice(0, 7);
      const key = budgetKey(t.category);
      if (!key) continue;
      let inner = out.get(m);
      if (!inner) out.set(m, (inner = new Map()));
      const e = inner.get(key);
      if (e) e.total += t.amount;
      else inner.set(key, { name: canonicalCategory(t.category), total: t.amount });
    }
    return out;
  }, [expenseTx]);

  const actualThisMonth = useMemo(
    () => spendByMonth.get(month) ?? new Map<string, { name: string; total: number }>(),
    [spendByMonth, month]
  );

  /** Historical monthly figure per category for a basis. A month only counts
   *  toward the divisor if there is any spending recorded in it, so a new
   *  user with 1 month of data isn't diluted by two empty months. */
  const historyFor = (b: Basis) => {
    const months = Array.from({ length: BASIS_MONTHS[b] }, (_, i) => shiftMonth(month, -(i + 1)));
    const active = months.filter((m) => (spendByMonth.get(m)?.size ?? 0) > 0);
    const totals = new Map<string, { name: string; total: number }>();
    for (const m of active) {
      spendByMonth.get(m)!.forEach((v, k) => {
        const e = totals.get(k);
        if (e) e.total += v.total;
        else totals.set(k, { name: v.name, total: v.total });
      });
    }
    const result = new Map<string, { name: string; amount: number }>();
    totals.forEach((v, k) => result.set(k, { name: v.name, amount: v.total / Math.max(active.length, 1) }));
    return { result, monthsUsed: active.length };
  };

  const avg3 = useMemo(() => historyFor('avg3').result, [spendByMonth, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyAdjust = (raw: number) => {
    let v = raw * (1 + buffer / 100);
    if (roundTo > 0) v = Math.round(v / roundTo) * roundTo;
    return Math.max(0, Math.round(v));
  };

  // ---- Auto-suggest preview ----------------------------------------------
  const suggestion = useMemo(() => {
    const { result, monthsUsed } = historyFor(basis);
    const draftByKey = new Map(draft.map((d) => [budgetKey(d.category), d]));
    const plan: { category: string; amount: number; kind: 'new' | 'fill' | 'replace' }[] = [];
    result.forEach((v, key) => {
      const amount = applyAdjust(v.amount);
      if (amount <= 0) return;
      const existing = draftByKey.get(key);
      if (!existing) {
        if (addNew) plan.push({ category: v.name, amount, kind: 'new' });
      } else if (!(existing.amount > 0)) {
        plan.push({ category: existing.category, amount, kind: 'fill' });
      } else if (overwrite && existing.amount !== amount) {
        plan.push({ category: existing.category, amount, kind: 'replace' });
      }
    });
    plan.sort((a, b) => b.amount - a.amount);
    return { plan, monthsUsed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spendByMonth, month, basis, buffer, roundTo, overwrite, addNew, draft]);

  const handleApplySuggest = () => {
    const next = [...draft];
    let added = 0;
    let updated = 0;
    for (const p of suggestion.plan) {
      const idx = next.findIndex((i) => budgetKey(i.category) === budgetKey(p.category));
      if (idx >= 0) {
        next[idx] = { ...next[idx], amount: p.amount };
        updated++;
      } else {
        next.push(makeItem(month, p.category, p.amount));
        added++;
      }
    }
    commit(
      next,
      `Auto-suggest (${BASIS_LABEL[basis].toLowerCase()}${buffer ? `, +${buffer}%` : ''}): ${added} added, ${updated} updated.`
    );
  };

  // ---- Copy from last month ----------------------------------------------
  // Uses the previous month; if that month has no budget, falls back to the
  // nearest earlier month that does, instead of silently doing nothing.
  const copySource = useMemo(() => {
    for (let n = 1; n <= 24; n++) {
      const m = shiftMonth(month, -n);
      const items = budgetItems.filter((i) => i.month === m && i.amount > 0);
      if (items.length) return { month: m, items };
    }
    return null;
  }, [budgetItems, month]);

  const draftHasAmounts = draft.some((i) => i.amount > 0);

  const doCopy = (mode: 'merge' | 'replace') => {
    if (!copySource) return;
    const next: BudgetItem[] = mode === 'replace' ? [] : [...draft];
    let added = 0;
    let filled = 0;
    for (const p of copySource.items) {
      const idx = next.findIndex((i) => budgetKey(i.category) === budgetKey(p.category));
      if (idx === -1) {
        next.push(makeItem(month, p.category, p.amount, p.currency));
        added++;
      } else if (!(next[idx].amount > 0)) {
        next[idx] = { ...next[idx], amount: p.amount };
        filled++;
      }
    }
    const total = copySource.items.reduce((s, i) => s + i.amount, 0);
    commit(
      next,
      mode === 'replace'
        ? `Copied ${copySource.items.length} categories (${money(total)}) from ${monthLabel(copySource.month)}.`
        : `Copied from ${monthLabel(copySource.month)}: ${added} added, ${filled} filled in. Existing amounts kept.`
    );
  };

  const handleCopyClick = () => {
    if (!copySource) {
      showNotice({ text: 'No earlier month has a saved budget to copy yet.', tone: 'warn' });
      return;
    }
    if (!draftHasAmounts) doCopy('replace');
    else setPanel((p) => (p === 'copy' ? null : 'copy'));
  };

  // ---- editing ------------------------------------------------------------
  const usedKeys = new Set(draft.map((d) => budgetKey(d.category)));
  const availableChips = BUDGET_CATEGORIES.filter((c) => !usedKeys.has(budgetKey(c)));

  const addCategory = (raw: string, amount = 0) => {
    const category = canonicalCategory(raw);
    if (!category || usedKeys.has(budgetKey(category))) return;
    setDraftDirty(true);
    setDraft((d) => [...d, makeItem(month, category, amount)]);
  };

  const updateAmount = (id: string, amount: number) => {
    setDraftDirty(true);
    setDraft((d) => d.map((i) => (i.id === id ? { ...i, amount: Math.max(0, amount || 0) } : i)));
  };

  const removeCategory = (id: string) => {
    const item = draft.find((i) => i.id === id);
    commit(
      draft.filter((i) => i.id !== id),
      `Removed ${item?.category ?? 'category'}.`
    );
  };

  const clearAll = () => {
    if (!draft.length) return;
    commit([], 'Cleared all categories.');
  };

  const discard = () => {
    setDraftDirty(false);
    setNotice(null);
    setPanel(null);
  };

  const undo = () => {
    if (!notice?.undo) return;
    setDraftDirty(true);
    setDraft(notice.undo);
    setNotice(null);
  };

  // ---- derived view-model --------------------------------------------------
  const total = draft.reduce((sum, i) => sum + (i.amount || 0), 0);
  const spentTotal = [...actualThisMonth.values()].reduce((s, v) => s + v.total, 0);
  const budgetedKeys = new Set(draft.map((d) => budgetKey(d.category)));
  const spentInPlan = [...actualThisMonth.entries()]
    .filter(([k]) => budgetedKeys.has(k))
    .reduce((s, [, v]) => s + v.total, 0);
  const unbudgeted = [...actualThisMonth.entries()]
    .filter(([k]) => !budgetedKeys.has(k))
    .map(([, v]) => v)
    .sort((a, b) => b.total - a.total);
  const unbudgetedTotal = unbudgeted.reduce((s, v) => s + v.total, 0);
  const remaining = total - spentInPlan;
  const usedPct = total > 0 ? (spentInPlan / total) * 100 : 0;
  const unallocated = incomeThisMonth - total;

  const rows = useMemo(() => {
    const list = draft.map((item, idx) => {
      const key = budgetKey(item.category);
      const spent = actualThisMonth.get(key)?.total ?? 0;
      const pct = item.amount > 0 ? (spent / item.amount) * 100 : spent > 0 ? Infinity : 0;
      return { item, idx, spent, pct, avg: avg3.get(key)?.amount ?? 0 };
    });
    if (sortKey === 'amount') list.sort((a, b) => b.item.amount - a.item.amount);
    else if (sortKey === 'used') list.sort((a, b) => b.pct - a.pct);
    return list;
  }, [draft, actualThisMonth, avg3, sortKey]);

  const overCount = rows.filter((r) => r.item.amount > 0 && r.spent > r.item.amount).length;

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const clean = draft.map((i) => ({ ...i, amount: i.amount || 0 }));
      const removedIds = [...savedIds].filter((id) => !clean.some((i) => i.id === id));
      await Promise.all([
        ...clean.map((i) => upsertDoc(user, 'budgets', i)),
        ...removedIds.map((id) => removeDoc(user, 'budgets', id)),
      ]);
      // Mirror locally right away so the resync below can't briefly show the
      // old values before Firestore's snapshot arrives.
      const store = useBudgetStore.getState();
      clean.forEach((i) => store.addOrUpdate(i));
      removedIds.forEach((id) => store.remove(id));
      setSavedIds(new Set(clean.map((i) => i.id)));
      setDraftDirty(false);
      showNotice({ text: `Budget for ${monthLabel(month)} saved.`, tone: 'ok' });
    } catch {
      showNotice({ text: 'Could not save the budget. Check your connection and try again.', tone: 'warn' });
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------- UI --

  const btn =
    'flex items-center gap-1.5 border border-line hover:bg-surface-hover text-ink-2 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50';
  const selectCls =
    'border border-line bg-surface text-ink rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-ink text-lg min-w-40 text-center">{monthLabel(month)}</span>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="Next month"
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Summary */}
      <div className="bg-surface rounded-2xl border border-line p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Planned" value={money(total)} />
          <Stat label="Spent (in plan)" value={money(spentInPlan)} />
          <Stat
            label={remaining >= 0 ? 'Remaining' : 'Over plan by'}
            value={money(Math.abs(remaining))}
            tone={remaining >= 0 ? 'good' : 'bad'}
          />
          <Stat
            label={unallocated >= 0 ? 'Income not planned' : 'Plan exceeds income'}
            value={incomeThisMonth > 0 ? money(Math.abs(unallocated)) : '—'}
            tone={incomeThisMonth > 0 ? (unallocated >= 0 ? 'good' : 'bad') : undefined}
            hint={incomeThisMonth > 0 ? `Income ${money(incomeThisMonth)}` : 'No income logged'}
          />
        </div>
        {total > 0 && (
          <div className="mt-4">
            <ProgressBar pct={usedPct} />
            <div className="mt-1.5 flex justify-between text-xs text-muted">
              <span>{usedPct.toFixed(0)}% of plan used</span>
              {overCount > 0 && (
                <span className="text-negative font-medium">
                  {overCount} {overCount === 1 ? 'category' : 'categories'} over budget
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-line p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-ink">Monthly plan</h2>
            {hasChanges && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setPanel((p) => (p === 'suggest' ? null : 'suggest'))}
              className={cn(btn, panel === 'suggest' && 'bg-surface-hover')}
            >
              <Wand2 size={15} /> Auto-suggest
            </button>
            <button
              onClick={handleCopyClick}
              className={cn(btn, panel === 'copy' && 'bg-surface-hover')}
              title={copySource ? `Copy from ${monthLabel(copySource.month)}` : 'No earlier budget saved'}
            >
              <Copy size={15} /> Copy from last month
            </button>
          </div>
        </div>

        {notice && (
          <div
            role="status"
            className={cn(
              'mb-4 flex items-center gap-2 rounded-lg px-3 py-2 text-sm border',
              notice.tone === 'ok'
                ? 'bg-positive-soft border-line text-positive'
                : 'bg-negative-soft border-line text-negative'
            )}
          >
            {notice.tone === 'ok' ? <Check size={15} className="shrink-0" /> : <AlertTriangle size={15} className="shrink-0" />}
            <span className="flex-1">{notice.text}</span>
            {notice.undo && (
              <button onClick={undo} className="flex items-center gap-1 font-semibold underline underline-offset-2">
                <Undo2 size={14} /> Undo
              </button>
            )}
            <button onClick={() => setNotice(null)} aria-label="Dismiss" className="opacity-70 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}

        {panel === 'suggest' && (
          <div className="mb-4 rounded-xl border border-line bg-surface-hover/40 p-4 space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-3">
              <label className="text-xs text-muted flex flex-col gap-1">
                Based on
                <select className={selectCls} value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
                  {(Object.keys(BASIS_LABEL) as Basis[]).map((b) => (
                    <option key={b} value={b}>{BASIS_LABEL[b]}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">
                Safety buffer
                <select className={selectCls} value={buffer} onChange={(e) => setBuffer(Number(e.target.value))}>
                  {BUFFERS.map((b) => (
                    <option key={b} value={b}>{b === 0 ? 'None' : `+${b}%`}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted flex flex-col gap-1">
                Round to
                <select className={selectCls} value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))}>
                  {ROUND_STEPS.map((r) => (
                    <option key={r} value={r}>{r === 0 ? 'Exact' : `₹${r}`}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} />
                Add categories I spend on but haven't planned
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
                Replace amounts I've already entered
              </label>
            </div>

            {suggestion.monthsUsed === 0 ? (
              <p className="text-sm text-negative">
                No expense transactions found in the {BASIS_MONTHS[basis] === 1 ? 'previous month' : `previous ${BASIS_MONTHS[basis]} months`}
                {activeProfileId ? ' for this profile' : ''}, so there is nothing to suggest from. Try a longer period.
              </p>
            ) : suggestion.plan.length === 0 ? (
              <p className="text-sm text-muted">
                Nothing to change with these options — every category from your history is already planned.
              </p>
            ) : (
              <div className="text-sm">
                <p className="text-muted mb-1.5">
                  Based on {suggestion.monthsUsed} {suggestion.monthsUsed === 1 ? 'month' : 'months'} of spending ·{' '}
                  {suggestion.plan.length} {suggestion.plan.length === 1 ? 'change' : 'changes'} ·{' '}
                  <span className="text-ink font-medium">{money(suggestion.plan.reduce((s, p) => s + p.amount, 0))}</span>
                </p>
                <ul className="max-h-40 overflow-auto divide-y divide-line-soft rounded-lg border border-line bg-surface">
                  {suggestion.plan.map((p) => (
                    <li key={p.category} className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-ink-2">
                        {p.category}
                        <span className="ml-2 text-xs text-muted">
                          {p.kind === 'new' ? 'new' : p.kind === 'fill' ? 'fills empty' : 'replaces'}
                        </span>
                      </span>
                      <span className="font-medium text-ink">{money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => setPanel(null)} className={btn}>Cancel</button>
              <button
                onClick={handleApplySuggest}
                disabled={suggestion.plan.length === 0}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
              >
                Apply suggestions
              </button>
            </div>
          </div>
        )}

        {panel === 'copy' && copySource && (
          <div className="mb-4 rounded-xl border border-line bg-surface-hover/40 p-4 space-y-3">
            <p className="text-sm text-ink-2">
              Copy <b>{copySource.items.length}</b> categories (
              {money(copySource.items.reduce((s, i) => s + i.amount, 0))}) from{' '}
              <b>{monthLabel(copySource.month)}</b>
              {copySource.month !== shiftMonth(month, -1) && (
                <span className="text-muted"> — the most recent month with a saved budget</span>
              )}
              . You already have amounts entered for {monthLabel(month)}.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setPanel(null)} className={btn}>Cancel</button>
              <button onClick={() => doCopy('merge')} className={btn}>Keep mine, add missing</button>
              <button
                onClick={() => doCopy('replace')}
                className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium"
              >
                Replace with copied budget
              </button>
            </div>
          </div>
        )}

        {draft.length > 1 && (
          <div className="flex items-center justify-between mb-1 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              Sort
              {(
                [
                  ['added', 'Added'],
                  ['amount', 'Budget'],
                  ['used', '% used'],
                ] as [SortKey, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  className={cn(
                    'px-2 py-0.5 rounded-full border',
                    sortKey === k ? 'border-brand-600 text-brand-700 dark:text-brand-300 font-medium' : 'border-line'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={clearAll} className="flex items-center gap-1 hover:text-negative">
              <Trash2 size={13} /> Clear all
            </button>
          </div>
        )}

        {draft.length === 0 ? (
          <div className="text-center text-muted text-sm py-10">
            No categories yet. Use Auto-suggest, Copy from last month, or tap Add categories below.
          </div>
        ) : (
          <div className="divide-y divide-line-soft">
            {rows.map(({ item, spent, pct, avg }) => {
              const over = item.amount > 0 && spent > item.amount;
              const left = item.amount - spent;
              const avgRounded = applyAdjust(avg);
              return (
                <div key={item.id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex-1 text-sm font-medium text-ink-2 truncate">{item.category}</span>
                    {avgRounded > 0 && avgRounded !== item.amount && (
                      <button
                        onClick={() => updateAmount(item.id, avgRounded)}
                        title="Set to your 3-month average spend"
                        className="hidden sm:inline text-xs text-muted hover:text-brand-700 border border-line rounded-full px-2 py-0.5"
                      >
                        Avg {money(avgRounded)}
                      </button>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-sm text-slate-600">₹</span>
                      <input
                        type="number"
                        min={0}
                        inputMode="decimal"
                        value={item.amount || ''}
                        onChange={(e) => updateAmount(item.id, Number(e.target.value))}
                        placeholder="0"
                        aria-label={`${item.category} budget`}
                        className="w-24 sm:w-32 text-right border border-line dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <button
                      onClick={() => removeCategory(item.id)}
                      aria-label={`Remove ${item.category}`}
                      className="tap-scale text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 shrink-0"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {(spent > 0 || item.amount > 0) && (
                    <div className="mt-2 pr-7">
                      <ProgressBar pct={Number.isFinite(pct) ? pct : 100} thin />
                      <div className="mt-1 flex justify-between text-xs text-muted">
                        <span>{money(spent)} spent</span>
                        <span className={cn(over && 'text-negative font-medium')}>
                          {item.amount > 0 ? (over ? `${money(-left)} over` : `${money(left)} left`) : 'No limit set'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {unbudgeted.length > 0 && (
          <div className="mt-3 rounded-lg border border-line bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5">
            <p className="text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5 mb-2">
              <AlertTriangle size={13} />
              {money(unbudgetedTotal)} spent this month in categories with no budget — tap to add
            </p>
            <div className="flex flex-wrap gap-2">
              {unbudgeted.slice(0, 8).map((u) => (
                <button
                  key={u.name}
                  onClick={() => addCategory(u.name, applyAdjust(u.total) || Math.round(u.total))}
                  className="flex items-center gap-1 border border-line bg-surface hover:bg-surface-hover text-ink-2 px-2.5 py-1 rounded-full text-xs font-medium"
                >
                  <Plus size={12} /> {u.name} · {money(u.total)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-3 pt-3">
          <button
            onClick={() => setAddOpen((o) => !o)}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-700 dark:text-brand-300"
          >
            <Plus size={16} /> Add categories
            {addOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {addOpen && (
            <div className="flex flex-wrap gap-2 mt-3">
              {availableChips.map((c) => (
                <button
                  key={c}
                  onClick={() => addCategory(c)}
                  className="flex items-center gap-1 border border-line hover:bg-surface-hover text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full text-sm font-medium"
                >
                  <Plus size={13} /> {c}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newCategory.trim()) {
                      addCategory(newCategory.trim());
                      setNewCategory('');
                    }
                  }}
                  placeholder="Custom category"
                  className="border border-dashed border-slate-300 dark:border-slate-600 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-white w-40"
                />
                <button
                  onClick={() => {
                    if (!newCategory.trim()) return;
                    addCategory(newCategory.trim());
                    setNewCategory('');
                  }}
                  className="flex items-center gap-1 border border-line hover:bg-surface-hover text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full text-sm font-medium"
                >
                  <Plus size={13} /> New category
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 mt-4 border-t border-line-soft">
          <span className="font-semibold text-ink">Total</span>
          <span className="font-semibold text-ink">{formatCurrency(total)}</span>
        </div>
        {spentTotal > 0 && (
          <div className="flex items-center justify-between pt-1 text-xs text-muted">
            <span>Total spent this month (all categories)</span>
            <span>{money(spentTotal)}</span>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        {hasChanges && (
          <button onClick={discard} className={btn}>
            <RotateCcw size={15} /> Discard changes
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save budget'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- sub-views --

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('text-lg font-semibold', tone === 'good' ? 'text-positive' : tone === 'bad' ? 'text-negative' : 'text-ink')}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

function ProgressBar({ pct, thin }: { pct: number; thin?: boolean }) {
  return (
    <div className={cn('w-full rounded-full bg-slate-200/70 dark:bg-slate-700/60 overflow-hidden', thin ? 'h-1.5' : 'h-2')}>
      <div
        className={cn('h-full rounded-full', pct > 100 ? 'bg-negative' : pct > 80 ? 'bg-amber-500' : 'bg-brand-600')}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}
