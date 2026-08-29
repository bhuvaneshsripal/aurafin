import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Plus,
  X,
  Wand2,
  Copy,
} from 'lucide-react';
import { useBudgetStore } from '../../store/budgetStore';
import { useTransactionsStore } from '../../store/transactionsStore';
import { useAuthStore } from '../../store/authStore';
import { upsertDoc, removeDoc } from '../../hooks/useFirestoreSync';
import { BUDGET_CATEGORIES } from '../../utils/budgetCategories';
import { formatCurrency } from '../../utils/currency';
import type { BudgetItem } from '../../types';

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
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function BudgetTab() {
  const user = useAuthStore((s) => s.user);
  const budgetItems = useBudgetStore((s) => s.items);
  const transactions = useTransactionsStore((s) => s.transactions);

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [draft, setDraft] = useState<BudgetItem[]>([]);
  const [addOpen, setAddOpen] = useState(true);
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // True once the person has actually touched this month's draft (added/
  // removed/edited a category). Guards the resync effect below so a
  // Firestore update that arrives mid-edit doesn't clobber unsaved changes.
  const [draftDirty, setDraftDirty] = useState(false);

  // Switching months always starts from a clean slate.
  useEffect(() => {
    setDraftDirty(false);
  }, [month]);

  // (Re)load the draft whenever the visible month changes, AND whenever the
  // synced budgetItems for it change — the latter matters because on a
  // slower connection (mobile especially), this component can mount and
  // run its first sync *before* Firestore has actually delivered the
  // person's saved budget items. Without depending on budgetItems too, the
  // draft would permanently start empty for that month — looking like "no
  // budget set" even though one exists, and silently deleting it on the
  // next Save. Only skipped once the person has started actively editing,
  // so a live update mid-edit can't overwrite unsaved changes.
  useEffect(() => {
    if (draftDirty) return;
    const existing = budgetItems.filter((i) => i.month === month);
    setDraft(existing);
    setSavedIds(new Set(existing.map((i) => i.id)));
  }, [month, budgetItems, draftDirty]);

  const usedCategories = new Set(draft.map((d) => d.category));
  const availableChips = BUDGET_CATEGORIES.filter((c) => !usedCategories.has(c));

  const total = draft.reduce((sum, i) => sum + (i.amount || 0), 0);

  const addCategory = (category: string) => {
    if (!category.trim() || usedCategories.has(category)) return;
    setDraftDirty(true);
    setDraft((d) => [
      ...d,
      { id: `${month}-${slugify(category)}`, month, category, amount: 0, currency: 'INR' },
    ]);
  };

  const updateAmount = (id: string, amount: number) => {
    setDraftDirty(true);
    setDraft((d) => d.map((i) => (i.id === id ? { ...i, amount } : i)));
  };

  const removeCategory = (id: string) => {
    setDraftDirty(true);
    setDraft((d) => d.filter((i) => i.id !== id));
  };

  // Average of the last 3 months' actual spend per category, used to
  // pre-fill sensible amounts instead of zeros.
  const suggestedAmounts = useMemo(() => {
    const months = [1, 2, 3].map((n) => shiftMonth(month, -n));
    const totals = new Map<string, number>();
    transactions
      .filter((t) => t.type === 'expense' && months.some((m) => t.date.startsWith(m)))
      .forEach((t) => {
        totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
      });
    const avg = new Map<string, number>();
    totals.forEach((sum, cat) => {
      // Divide by 3 months to get a monthly average rather than a raw total.
      avg.set(cat, Math.round(sum / 3));
    });
    return avg;
  }, [transactions, month]);

  const handleAutoSuggest = () => {
    setDraftDirty(true);
    setDraft((d) => {
      const next = [...d];
      suggestedAmounts.forEach((amount, category) => {
        if (amount <= 0) return;
        const existingIdx = next.findIndex((i) => i.category === category);
        if (existingIdx >= 0) {
          if (next[existingIdx].amount === 0) next[existingIdx] = { ...next[existingIdx], amount };
        } else {
          next.push({ id: `${month}-${slugify(category)}`, month, category, amount, currency: 'INR' });
        }
      });
      return next;
    });
  };

  const handleCopyLastMonth = () => {
    const prevMonth = shiftMonth(month, -1);
    const prevItems = budgetItems.filter((i) => i.month === prevMonth);
    if (prevItems.length === 0) return;
    setDraftDirty(true);
    setDraft((d) => {
      const next = [...d];
      prevItems.forEach((p) => {
        const existingIdx = next.findIndex((i) => i.category === p.category);
        if (existingIdx === -1) {
          next.push({ id: `${month}-${slugify(p.category)}`, month, category: p.category, amount: p.amount, currency: p.currency });
        }
      });
      return next;
    });
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const removedIds = [...savedIds].filter((id) => !draft.some((i) => i.id === id));
      await Promise.all([
        ...draft.map((i) => upsertDoc(user, 'budgets', i)),
        ...removedIds.map((id) => removeDoc(user, 'budgets', id)),
      ]);
      setSavedIds(new Set(draft.map((i) => i.id)));
      // Saved successfully — safe to let the next Firestore update resync
      // the draft again (e.g. confirming this same save, or a later edit
      // from another device).
      setDraftDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-slate-900 dark:text-white text-lg">{monthLabel(month)}</span>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-semibold text-slate-900 dark:text-white">Monthly plan</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAutoSuggest}
              className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium"
            >
              <Wand2 size={15} /> Auto-suggest
            </button>
            <button
              onClick={handleCopyLastMonth}
              className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium"
            >
              <Copy size={15} /> Copy from last month
            </button>
          </div>
        </div>

        {draft.length === 0 ? (
          <div className="text-center text-slate-600 dark:text-slate-500 text-sm py-10">
            No categories yet. Tap Add categories below to start.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {draft.map((item) => (
              <div key={item.id} className="flex items-center gap-3 py-2.5">
                <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate uppercase">
                  {item.category}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-sm text-slate-600">₹</span>
                  <input
                    type="number"
                    value={item.amount || ''}
                    onChange={(e) => updateAmount(item.id, Number(e.target.value))}
                    placeholder="0"
                    className="w-24 sm:w-32 text-right border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Remove this budget category?')) removeCategory(item.id);
                  }}
                  className="tap-scale text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 shrink-0"
                >
                  <X size={16} />
                </button>
              </div>
            ))}
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
                  className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full text-sm font-medium"
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
                  className="border border-dashed border-slate-300 dark:border-slate-600 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 dark:bg-slate-800 dark:text-white w-40 uppercase"
                />
                <button
                  onClick={() => {
                    if (!newCategory.trim()) return;
                    addCategory(newCategory.trim());
                    setNewCategory('');
                  }}
                  className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 px-3 py-1.5 rounded-full text-sm font-medium"
                >
                  <Plus size={13} /> New category
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
          <span className="font-semibold text-slate-900 dark:text-white">Total</span>
          <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save budget'}
        </button>
      </div>
    </div>
  );
}
