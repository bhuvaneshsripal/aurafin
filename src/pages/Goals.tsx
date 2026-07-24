import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useGoalsStore } from '../store/goalsStore';
import { useAuthStore } from '../store/authStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import Modal from '../components/Modal';
import type { Goal } from '../types';
import { CURRENCIES, formatCurrency } from '../utils/currency';

export default function Goals() {
  const goals = useGoalsStore((s) => s.goals);
  const user = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

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
          const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800">{g.name}</h3>
                <div className="flex items-center gap-2">
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
                <span>{formatCurrency(g.currentAmount, g.currency)} saved</span>
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

  const submit = () => {
    if (!name || !targetAmount) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      targetAmount: Number(targetAmount),
      currentAmount: Number(currentAmount || 0),
      currency,
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
      <Field label="Current Progress">
        <input
          type="number"
          value={currentAmount}
          onChange={(e) => setCurrentAmount(e.target.value)}
          className={inputClass}
          placeholder="0"
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
