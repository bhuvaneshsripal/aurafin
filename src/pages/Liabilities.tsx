import { useState } from 'react';
import { Plus, Trash2, Pencil } from 'lucide-react';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useAuthStore } from '../store/authStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import Modal from '../components/Modal';
import type { Liability } from '../types';
import { CURRENCIES, formatCurrency } from '../utils/currency';

export default function Liabilities() {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Liabilities</h1>
          <p className="text-slate-500 text-sm mt-1">
            {liabilities.length} active ·{' '}
            {formatCurrency(liabilities.reduce((s, l) => s + l.outstanding, 0))} outstanding
          </p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Liability
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
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
                <td className="px-4 py-3 text-slate-500">
                  {l.emi ? formatCurrency(l.emi, l.currency) : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => {
                        setEditing(l);
                        setModalOpen(true);
                      }}
                      className="text-slate-400 hover:text-brand-600"
                    >
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(l.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={16} />
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

function LiabilityForm({
  initial,
  onSave,
}: {
  initial: Liability | null;
  onSave: (l: Liability) => void;
}) {
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
          <input
            type="number"
            value={outstanding}
            onChange={(e) => setOutstanding(e.target.value)}
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
      <Field label="Monthly EMI (optional)">
        <input type="number" value={emi} onChange={(e) => setEmi(e.target.value)} className={inputClass} placeholder="0" />
      </Field>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-lg text-sm font-medium">
        Save Liability
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
