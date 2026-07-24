import { useState } from 'react';
import { Plus, Trash2, Pencil, Download } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useAuthStore } from '../store/authStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import { exportToCsv } from '../utils/exportCsv';
import Modal from '../components/Modal';
import type { Asset, AssetClass, Liability } from '../types';
import {
  ASSET_CLASS_LABELS,
  ASSET_CLASS_COLORS,
  CURRENCIES,
  formatCurrency,
} from '../utils/currency';

const ASSET_CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[];
type Tab = 'assets' | 'liabilities' | 'allocation';

export default function Wealth() {
  const [tab, setTab] = useState<Tab>('assets');
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);

  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Wealth</h1>
        <p className="text-slate-500 text-base mt-1">Everything you own and owe, in one view.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard label="Assets" value={formatCurrency(totalAssets)} tone="brand" />
        <SummaryCard label="Liabilities" value={formatCurrency(totalLiabilities)} tone="red" />
        <SummaryCard label="Net Worth" value={formatCurrency(netWorth)} tone="slate" />
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {(
          [
            ['assets', 'Assets'],
            ['liabilities', 'Liabilities'],
            ['allocation', 'Allocation'],
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

      {tab === 'assets' && <AssetsTab />}
      {tab === 'liabilities' && <LiabilitiesTab />}
      {tab === 'allocation' && <AllocationTab />}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'red' | 'slate';
}) {
  const toneClass =
    tone === 'brand' ? 'text-brand-700' : tone === 'red' ? 'text-red-500' : 'text-slate-900';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-sm text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function AssetsTab() {
  const assets = useAssetsStore((s) => s.assets);
  const user = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'assets', id);
  };

  const handleSave = async (asset: Asset) => {
    if (!user) return;
    await upsertDoc(user.uid, 'assets', asset);
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToCsv(
      'assets',
      assets.map((a) => ({
        Name: a.name,
        'Asset Class': ASSET_CLASS_LABELS[a.assetClass],
        Value: a.value,
        Currency: a.currency,
      }))
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-base text-slate-500">
          {assets.length} tracked · {formatCurrency(assets.reduce((s, a) => s + a.value, 0))} total
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={assets.length === 0}
            className="flex items-center gap-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-600 px-4 py-2 rounded-lg text-base font-medium"
          >
            <Download size={18} /> Export CSV
          </button>
          <button
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
          >
            <Plus size={18} /> Add Asset
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Class</th>
              <th className="px-4 py-3 font-medium">Value</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assets.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{a.name}</td>
                <td className="px-4 py-3 text-slate-500">{ASSET_CLASS_LABELS[a.assetClass]}</td>
                <td className="px-4 py-3 text-slate-800">{formatCurrency(a.value, a.currency)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 justify-end">
                    <button
                      onClick={() => {
                        setEditing(a);
                        setModalOpen(true);
                      }}
                      className="text-slate-400 hover:text-brand-600"
                    >
                      <Pencil size={18} />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {assets.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No assets yet. Add your first one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Asset' : 'Add Asset'}>
        <AssetForm initial={editing} onSave={handleSave} />
      </Modal>
    </div>
  );
}

function AssetForm({ initial, onSave }: { initial: Asset | null; onSave: (a: Asset) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [assetClass, setAssetClass] = useState<AssetClass>(initial?.assetClass ?? 'equity');
  const [value, setValue] = useState(initial?.value?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');

  const submit = () => {
    if (!name || !value) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      assetClass,
      value: Number(value),
      currency,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. HDFC Flexicap SIP" />
      </Field>
      <Field label="Asset Class">
        <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)} className={inputClass}>
          {ASSET_CLASSES.map((c) => (
            <option key={c} value={c}>
              {ASSET_CLASS_LABELS[c]}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Value">
          <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} placeholder="0" />
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
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Asset
      </button>
    </div>
  );
}

function LiabilitiesTab() {
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const user = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Liability | null>(null);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'liabilities', id);
  };

  const handleSave = async (liability: Liability) => {
    if (!user) return;
    await upsertDoc(user.uid, 'liabilities', liability);
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-base text-slate-500">
          {liabilities.length} active ·{' '}
          {formatCurrency(liabilities.reduce((s, l) => s + l.outstanding, 0))} outstanding
        </p>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
        >
          <Plus size={18} /> Add Liability
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-base">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Outstanding</th>
              <th className="px-4 py-3 font-medium">EMI</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {liabilities.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{l.name}</td>
                <td className="px-4 py-3 text-slate-800">{formatCurrency(l.outstanding, l.currency)}</td>
                <td className="px-4 py-3 text-slate-500">{l.emi ? formatCurrency(l.emi, l.currency) : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 justify-end">
                    <button
                      onClick={() => {
                        setEditing(l);
                        setModalOpen(true);
                      }}
                      className="text-slate-400 hover:text-brand-600"
                    >
                      <Pencil size={18} />
                    </button>
                    <button onClick={() => handleDelete(l.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {liabilities.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  No liabilities tracked. Add loans or credit lines here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Liability' : 'Add Liability'}>
        <LiabilityForm initial={editing} onSave={handleSave} />
      </Modal>
    </div>
  );
}

function LiabilityForm({ initial, onSave }: { initial: Liability | null; onSave: (l: Liability) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [outstanding, setOutstanding] = useState(initial?.outstanding?.toString() ?? '');
  const [emi, setEmi] = useState(initial?.emi?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');

  const submit = () => {
    if (!name || !outstanding) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      outstanding: Number(outstanding),
      emi: emi ? Number(emi) : undefined,
      currency,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Home Loan" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Outstanding">
          <input type="number" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} className={inputClass} placeholder="0" />
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
      <Field label="Monthly EMI (optional)">
        <input type="number" value={emi} onChange={(e) => setEmi(e.target.value)} className={inputClass} placeholder="0" />
      </Field>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Liability
      </button>
    </div>
  );
}

function AllocationTab() {
  const assets = useAssetsStore((s) => s.assets);
  const byClass: Record<string, number> = {};
  assets.forEach((a) => {
    byClass[a.assetClass] = (byClass[a.assetClass] ?? 0) + a.value;
  });
  const data = Object.entries(byClass).map(([key, value]) => ({
    name: ASSET_CLASS_LABELS[key] ?? key,
    value,
    color: ASSET_CLASS_COLORS[key] ?? '#94a3b8',
  }));
  const total = data.reduce((s, d) => s + d.value, 0);

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
        Add assets to see how your wealth is allocated.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatCurrency(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-3">
        {data
          .sort((a, b) => b.value - a.value)
          .map((d) => (
            <div key={d.name} className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-slate-700 font-medium">{d.name}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-900 font-semibold">{formatCurrency(d.value)}</span>
                <span className="text-slate-400 ml-2 text-sm">
                  {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
      </div>
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
