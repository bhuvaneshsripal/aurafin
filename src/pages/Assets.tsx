import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useAssetsStore } from '../store/assetsStore';
import { useAuthStore } from '../store/authStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import Modal from '../components/Modal';
import type { Asset, AssetClass } from '../types';
import { ASSET_CLASS_LABELS, CURRENCIES, formatCurrency } from '../utils/currency';

const ASSET_CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[];

export default function Assets() {
  const assets = useAssetsStore((s) => s.assets);
  const user = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditing(asset);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'assets', id);
  };

  const handleSave = async (asset: Asset) => {
    if (!user) return;
    await upsertDoc(user.uid, 'assets', asset);
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Assets</h1>
          <p className="text-slate-500 text-sm mt-1">
            {assets.length} tracked · {formatCurrency(assets.reduce((s, a) => s + a.value, 0))} total
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Asset
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
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
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => openEdit(a)} className="text-slate-400 hover:text-brand-600">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={16} />
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
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
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
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-lg text-sm font-medium">
        Save Asset
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
