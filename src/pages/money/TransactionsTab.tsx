import { useRef, useState, useEffect } from 'react';
import { Plus, Trash2, Download, ChevronDown, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { useTransactionsStore } from '../../store/transactionsStore';
import { useAuthStore } from '../../store/authStore';
import { upsertDoc, removeDoc } from '../../hooks/useFirestoreSync';
import { exportToCsv } from '../../utils/exportCsv';
import Modal from '../../components/Modal';
import Amount from '../../components/Amount';
import type { Transaction, TransactionType } from '../../types';
import { CURRENCIES } from '../../utils/currency';

export default function TransactionsTab() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const user = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<TransactionType>('expense');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAddMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'transactions', id);
  };

  const handleSave = async (t: Transaction) => {
    if (!user) return;
    await upsertDoc(user.uid, 'transactions', t);
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToCsv(
      'transactions',
      transactions.map((t) => ({
        Date: t.date,
        Category: t.category,
        Type: t.type,
        Amount: t.amount,
        Currency: t.currency,
      }))
    );
  };

  const openModal = (type: TransactionType) => {
    setModalType(type);
    setModalOpen(true);
    setAddMenuOpen(false);
  };

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base">
          <Amount value={income} /> in · <Amount value={expense} /> out
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={transactions.length === 0}
            className="flex-1 sm:flex-none justify-center flex items-center gap-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-600 dark:text-slate-300 px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium"
          >
            <Download size={18} /> Export
          </button>
          <div className="relative flex-1 sm:flex-none" ref={menuRef}>
            <button
              onClick={() => setAddMenuOpen((o) => !o)}
              className="w-full justify-center flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium"
            >
              <Plus size={18} /> Add <ChevronDown size={16} />
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-10">
                <button
                  onClick={() => openModal('expense')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-base text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <ArrowDownCircle size={18} className="text-orange-500" /> Add Expense
                </button>
                <button
                  onClick={() => openModal('income')}
                  className="w-full flex items-center gap-3 px-4 py-3 text-base text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  <ArrowUpCircle size={18} className="text-brand-600" /> Add Income
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: card list (no cramped, cut-off columns) */}
      <div className="md:hidden space-y-2">
        {sorted.map((t) => (
          <div
            key={t.id}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center gap-3"
          >
            <div
              className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                t.type === 'income'
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300'
                  : 'bg-orange-50 dark:bg-orange-900/30 text-orange-500'
              }`}
            >
              {t.type === 'income' ? <ArrowUpCircle size={20} /> : <ArrowDownCircle size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{t.category}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t.date}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`font-semibold text-sm whitespace-nowrap ${
                  t.type === 'expense' ? 'text-orange-600 dark:text-orange-400' : 'text-brand-600 dark:text-brand-300'
                }`}
              >
                {t.type === 'expense' ? '-' : '+'}
                <Amount value={t.amount} currency={t.currency} />
              </span>
              <button
                onClick={() => handleDelete(t.id)}
                className="tap-scale text-slate-300 dark:text-slate-600 hover:text-red-500 p-1"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-14 flex flex-col items-center justify-center text-center gap-4">
            <p className="text-slate-400 dark:text-slate-500 text-sm">
              No entries yet. Log your salary, rent, groceries, and more.
            </p>
            <button
              onClick={() => openModal('expense')}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg text-base font-medium"
            >
              <Plus size={18} /> Add Transaction
            </button>
          </div>
        )}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sorted.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{t.date}</td>
                <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-100">{t.category}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-sm px-2 py-1 rounded-full font-medium ${
                      t.type === 'income'
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                        : 'bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'
                    }`}
                  >
                    {t.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                  {t.type === 'expense' ? '-' : '+'}
                  <Amount value={t.amount} currency={t.currency} />
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => handleDelete(t.id)} className="text-slate-400 hover:text-red-500">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-14">
                  <div className="flex flex-col items-center justify-center text-center gap-4">
                    <p className="text-slate-400 dark:text-slate-500">
                      No entries yet. Log your salary, rent, groceries, and more.
                    </p>
                    <button
                      onClick={() => openModal('expense')}
                      className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg text-base font-medium"
                    >
                      <Plus size={18} /> Add Transaction
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalType === 'income' ? 'Add Income' : 'Add Expense'}
      >
        <TransactionForm initialType={modalType} onSave={handleSave} />
      </Modal>
    </div>
  );
}

function TransactionForm({
  initialType,
  onSave,
}: {
  initialType: TransactionType;
  onSave: (t: Transaction) => void;
}) {
  const [type, setType] = useState<TransactionType>(initialType);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = () => {
    if (!category || !amount) return;
    onSave({
      id: crypto.randomUUID(),
      type,
      category,
      amount: Number(amount),
      currency,
      date,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['expense', 'income'] as TransactionType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={`flex-1 py-2 rounded-lg text-base font-medium border ${
              type === t
                ? 'bg-brand-600 text-white border-brand-600'
                : 'border-slate-200 text-slate-500'
            }`}
          >
            {t === 'income' ? 'Income' : 'Expense'}
          </button>
        ))}
      </div>
      <Field label="Category">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
          placeholder="e.g. Rent, Salary, Groceries"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" />
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
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </Field>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Entry
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
  'w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';
