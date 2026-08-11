import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  Layers,
  Landmark,
  Camera,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { upsertDoc } from '../hooks/useFirestoreSync';
import { useAssetLimitReached } from '../hooks/useIsPro';
import Modal from './Modal';
import AssetLimitModal from './pro/AssetLimitModal';
import type { Asset, Snapshot, Transaction, TransactionType } from '../types';
import { CURRENCIES } from '../utils/currency';

type QuickAction = 'expense' | 'income' | 'transfer' | 'asset' | 'liability' | 'snapshot' | null;

export default function QuickAddMenu({ variant = 'desktop' }: { variant?: 'desktop' | 'fab' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<QuickAction>(null);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const assetLimitReached = useAssetLimitReached();
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const open = (action: QuickAction) => {
    // Free plan is capped on assets — show the upgrade prompt instead of
    // the Add Asset flow once the limit is hit.
    if (action === 'asset' && assetLimitReached) {
      setMenuOpen(false);
      setLimitModalOpen(true);
      return;
    }
    // Asset and Liability get the full Wealth page add flow (category ->
    // type -> details, with all the class-specific fields like symbol,
    // quantity, avg cost, institution, etc.) instead of the stripped-down
    // quick-add form, so people get the same complete experience from
    // anywhere in the app.
    if (action === 'asset' || action === 'liability') {
      setMenuOpen(false);
      navigate(`/wealth?add=1&entry=${action}&step=category`);
      return;
    }
    setActive(action);
    setMenuOpen(false);
  };

  const isFab = variant === 'fab';

  return (
    <>
      <div className={isFab ? 'relative' : 'relative'} ref={ref}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Quick add"
          className={
            isFab
              ? `fab-button${menuOpen ? ' fab-open' : ''} tap-scale flex items-center justify-center text-white h-14 w-14`
              : 'tap-scale flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2.5 rounded-lg text-base font-medium'
          }
        >
          {isFab ? <Plus size={24} className="fab-icon" /> : (
            <>
              <Plus size={18} /> Add <ChevronDown size={16} />
            </>
          )}
        </button>

        {menuOpen && (
          <div
            className={
              isFab
                ? 'animate-menu-in-3d absolute bottom-full right-0 mb-3 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden z-30'
                : 'animate-menu-in absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden z-30'
            }
            style={isFab ? { transformOrigin: 'bottom right' } : undefined}
          >
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Cashflow
            </p>
            <MenuItem icon={ArrowDownCircle} color="text-orange-500" label="Expense" onClick={() => open('expense')} />
            <MenuItem icon={ArrowUpCircle} color="text-brand-600" label="Income" onClick={() => open('income')} />
            <MenuItem icon={ArrowLeftRight} color="text-sky-500" label="Transfer" onClick={() => open('transfer')} />

            <div className="border-t border-slate-100 dark:border-slate-700 mt-1" />
            <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Wealth
            </p>
            <MenuItem icon={Layers} color="text-teal-600" label="Asset" onClick={() => open('asset')} />
            <MenuItem icon={Landmark} color="text-red-500" label="Liability" onClick={() => open('liability')} />
            <MenuItem icon={Camera} color="text-slate-500" label="Snapshot" onClick={() => open('snapshot')} />
          </div>
        )}
      </div>

      <Modal open={active === 'expense'} onClose={() => setActive(null)} title="Add Expense">
        <TransactionForm type="expense" onDone={() => setActive(null)} />
      </Modal>
      <Modal open={active === 'income'} onClose={() => setActive(null)} title="Add Income">
        <TransactionForm type="income" onDone={() => setActive(null)} />
      </Modal>
      <Modal open={active === 'transfer'} onClose={() => setActive(null)} title="Record Transfer">
        <TransferForm onDone={() => setActive(null)} />
      </Modal>
      <Modal open={active === 'snapshot'} onClose={() => setActive(null)} title="Save Net Worth Snapshot">
        <SnapshotForm onDone={() => setActive(null)} />
      </Modal>
      <AssetLimitModal open={limitModalOpen} onClose={() => setLimitModalOpen(false)} />
    </>
  );
}

function MenuItem({
  icon: Icon,
  color,
  label,
  onClick,
}: {
  icon: typeof Plus;
  color: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="menu-row-3d w-full flex items-center gap-3 px-4 py-2.5 text-base text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
    >
      <Icon size={18} className={color} />
      {label}
    </button>
  );
}

const inputClass =
  'w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function TransactionForm({ type, onDone }: { type: TransactionType; onDone: () => void }) {
  const user = useAuthStore((s) => s.user);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = async () => {
    if (!user || !category || !amount) return;
    const t: Transaction = {
      id: crypto.randomUUID(),
      type,
      category,
      amount: Number(amount),
      currency,
      date,
    };
    await upsertDoc(user, 'transactions', t);
    onDone();
  };

  return (
    <div className="space-y-4">
      <Field label="Category">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
          placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Rent, Groceries'}
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
        Save
      </button>
    </div>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const user = useAuthStore((s) => s.user);
  const assets = useAssetsStore((s) => s.assets);
  const [fromId, setFromId] = useState(assets[0]?.id ?? '');
  const [toId, setToId] = useState(assets[1]?.id ?? assets[0]?.id ?? '');
  const [amount, setAmount] = useState('');

  if (assets.length < 2) {
    return (
      <p className="text-sm text-slate-500">
        Add at least two assets in Wealth before recording a transfer between them.
      </p>
    );
  }

  const submit = async () => {
    if (!user || !fromId || !toId || fromId === toId || !amount) return;
    const value = Number(amount);
    const from = assets.find((a) => a.id === fromId);
    const to = assets.find((a) => a.id === toId);
    if (!from || !to) return;

    const updatedFrom: Asset = { ...from, value: Math.max(0, from.value - value), updatedAt: Date.now() };
    const updatedTo: Asset = { ...to, value: to.value + value, updatedAt: Date.now() };
    await upsertDoc(user, 'assets', updatedFrom);
    await upsertDoc(user, 'assets', updatedTo);
    onDone();
  };

  return (
    <div className="space-y-4">
      <Field label="From">
        <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={inputClass}>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name.toUpperCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label="To">
        <select value={toId} onChange={(e) => setToId(e.target.value)} className={inputClass}>
          {assets.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name.toUpperCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" />
      </Field>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Record Transfer
      </button>
    </div>
  );
}

function SnapshotForm({ onDone }: { onDone: () => void }) {
  const user = useAuthStore((s) => s.user);
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  const submit = async () => {
    if (!user) return;
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      netWorth,
      totalAssets,
      totalLiabilities,
    };
    await upsertDoc(user, 'snapshots', snapshot);
    onDone();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        This saves today's net worth so you can track how it changes over time on your Overview chart.
      </p>
      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Total Assets</span>
          <span className="font-medium text-slate-800 dark:text-slate-100">{totalAssets.toLocaleString(undefined, { useGrouping: true })}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total Liabilities</span>
          <span className="font-medium text-slate-800 dark:text-slate-100">{totalLiabilities.toLocaleString(undefined, { useGrouping: true })}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 dark:border-slate-600 pt-1 mt-1">
          <span className="text-slate-500">Net Worth</span>
          <span className="font-semibold text-slate-900 dark:text-white">{netWorth.toLocaleString(undefined, { useGrouping: true })}</span>
        </div>
      </div>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Snapshot
      </button>
    </div>
  );
}
