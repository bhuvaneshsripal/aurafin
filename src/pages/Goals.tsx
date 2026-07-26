import { useState } from 'react';
import { Plus, Trash2, Pencil, Scale } from 'lucide-react';
import { useGoalsStore } from '../store/goalsStore';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import Modal from '../components/Modal';
import type { Goal } from '../types';
import { CURRENCIES, formatCurrency } from '../utils/currency';
import { resolveAssetValues } from '../utils/assetValues';

export default function Goals() {
  const goals = useGoalsStore((s) => s.goals);
  const user = useAuthStore((s) => s.user);
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  // Same calc Dashboard uses for the headline Net Worth figure — kept in
  // sync here so a goal linked to Net Worth always shows the live number,
  // not whatever was typed in when the goal was created.
  const totalAssets = assets.reduce(
    (s, a) => s + resolveAssetValues(a, livePrices, sipValues).value,
    0
  );
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'goals', id);
  };

  const handleSave = async (goal: Goal) => {
    if (!user) return;
    await upsertDoc(user.uid, 'goals', goal);
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Goals</h1>
          <p className="text-slate-500 text-sm mt-1">{goals.length} active goals</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Goal
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((g) => {
          const currentAmount = g.linkedToNetWorth ? netWorth : g.currentAmount;
          const pct =
            g.targetAmount > 0 ? Math.min(100, Math.max(0, Math.round((currentAmount / g.targetAmount) * 100))) : 0;
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <h3 className="font-semibold text-slate-800 truncate">{g.name}</h3>
                  {g.linkedToNetWorth && (
                    <span className="flex items-center gap-1 shrink-0 text-[10px] font-medium uppercase tracking-wide bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">
                      <Scale size={10} /> Net Worth
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditing(g);
                      setModalOpen(true);
                    }}
                    className="text-slate-400 hover:text-brand-600"
                  >
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(g.id)} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  {formatCurrency(currentAmount, g.currency)} {g.linkedToNetWorth ? '(net worth)' : 'saved'}
                </span>
                <span>{pct}% of {formatCurrency(g.targetAmount, g.currency)}</span>
              </div>
            </div>
          );
        })}
        {goals.length === 0 && (
          <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400">
            No goals yet. Set a retirement corpus, emergency fund, or education target.
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Goal' : 'Add Goal'}>
        <GoalForm initial={editing} onSave={handleSave} />
      </Modal>
    </div>
  );
}

function GoalForm({ initial, onSave }: { initial: Goal | null; onSave: (g: Goal) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(initial?.targetAmount?.toString() ?? '');
  const [currentAmount, setCurrentAmount] = useState(initial?.currentAmount?.toString() ?? '0');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');
  const [linkedToNetWorth, setLinkedToNetWorth] = useState(initial?.linkedToNetWorth ?? false);

  const submit = () => {
    if (!name || !targetAmount) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      targetAmount: Number(targetAmount),
      currentAmount: Number(currentAmount || 0),
      currency,
      linkedToNetWorth,
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Goal Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Retirement Corpus" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target Amount">
          <input
            type="number"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            className={inputClass}
            placeholder="0"
          />
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <label className="flex items-start gap-3 border border-slate-200 rounded-lg px-3 py-3 cursor-pointer">
        <input
          type="checkbox"
          checked={linkedToNetWorth}
          onChange={(e) => setLinkedToNetWorth(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        <span>
          <span className="block text-sm font-medium text-slate-700">Track automatically with Net Worth</span>
          <span className="block text-xs text-slate-400 mt-0.5">
            Progress will use your live Net Worth (total assets − total liabilities) from the Dashboard
            instead of a number you enter manually.
          </span>
        </span>
      </label>

      <Field label={linkedToNetWorth ? 'Current Progress (auto — from Net Worth)' : 'Current Progress'}>
        <input
          type="number"
          value={currentAmount}
          onChange={(e) => setCurrentAmount(e.target.value)}
          className={inputClass}
          placeholder="0"
          disabled={linkedToNetWorth}
        />
      </Field>

      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-lg text-sm font-medium">
        Save Goal
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
