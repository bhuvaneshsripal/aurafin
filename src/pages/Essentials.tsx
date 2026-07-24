import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useGoalsStore } from '../store/goalsStore';
import { useAuthStore } from '../store/authStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import Modal from '../components/Modal';
import type { Goal } from '../types';
import { CURRENCIES, formatCurrency } from '../utils/currency';

type Tab = 'health' | 'goals';

export default function Essentials() {
  const [tab, setTab] = useState<Tab>('health');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Essentials</h1>
        <p className="text-slate-500 text-base mt-1">A quick health check, and the goals you're working toward.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            ['health', 'Financial Health'],
            ['goals', 'Goals'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-base font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'health' ? <HealthCheck /> : <GoalsTab />}
    </div>
  );
}

function HealthCheck() {
  const [age, setAge] = useState('');
  const [income, setIncome] = useState('');
  const [expense, setExpense] = useState('');
  const [savings, setSavings] = useState('');
  const [saved, setSaved] = useState(false);

  const savingsRate =
    income && Number(income) > 0
      ? Math.max(0, Math.round(((Number(income) - Number(expense || 0)) / Number(income)) * 100))
      : null;

  const score = savingsRate === null ? null : Math.min(100, Math.round(savingsRate * 1.5));

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
        <p className="text-base font-medium text-amber-800">
          Add your income and expenses to get a simple savings-rate score.
        </p>
        <p className="text-sm text-amber-700 mt-1">
          This stays on your device until you hit save — nothing is calculated on a server.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Your Financial Snapshot</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Age">
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={inputClass}
              placeholder="e.g. 28"
            />
          </Field>
          <Field label="Monthly Income">
            <input
              type="number"
              value={income}
              onChange={(e) => setIncome(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </Field>
          <Field label="Monthly Expenses">
            <input
              type="number"
              value={expense}
              onChange={(e) => setExpense(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </Field>
          <Field label="Monthly Savings">
            <input
              type="number"
              value={savings}
              onChange={(e) => setSavings(e.target.value)}
              className={inputClass}
              placeholder="0"
            />
          </Field>
        </div>
        <button
          onClick={() => setSaved(true)}
          className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg text-base font-medium"
        >
          Save
        </button>
      </div>

      {saved && score !== null && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Your Score</h2>
          <div className="flex items-center gap-6">
            <div className="text-4xl font-bold text-brand-600">{score}</div>
            <div className="flex-1">
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${score}%` }} />
              </div>
              <p className="text-sm text-slate-500 mt-2">
                You're saving roughly {savingsRate}% of your income each month.
                {savingsRate !== null && savingsRate < 20 && ' Aiming for 20%+ is a solid target.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GoalsTab() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-base text-slate-500">{goals.length} active goals</p>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
        >
          <Plus size={18} /> Add Goal
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
          return (
            <div key={g.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800 text-lg">{g.name}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditing(g);
                      setModalOpen(true);
                    }}
                    className="text-slate-400 hover:text-brand-600"
                  >
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => handleDelete(g.id)} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500">
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
          <input type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} className={inputClass} placeholder="0" />
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
        <input type="number" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} className={inputClass} placeholder="0" />
      </Field>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Goal
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';
