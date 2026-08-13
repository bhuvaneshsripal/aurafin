import { useState } from 'react';
import { Trash2, Check, Pencil, Star, ChevronDown } from 'lucide-react';
import { useAssetsStore } from '../../store/assetsStore';
import { useLiabilitiesStore } from '../../store/liabilitiesStore';
import { useAuthStore } from '../../store/authStore';
import { upsertDoc, removeDoc } from '../../hooks/useFirestoreSync';
import Modal from '../../components/Modal';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import Amount from '../../components/Amount';
import { CURRENCIES } from '../../utils/currency';
import { COMMON_BANKS } from '../../utils/banks';
import {
  ACCOUNT_TYPES,
  ACCOUNT_COLOURS,
  ACCOUNT_ICONS,
  resolveAccountIcon,
  type AccountType,
} from '../../utils/accountVisuals';
import type { Asset, Liability } from '../../types';

const inputClass =
  'w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';

type AccountRow = {
  id: string;
  kind: 'asset' | 'liability';
  name: string;
  value: number;
  currency: string;
  institution?: string;
  last4?: string;
  colour?: string;
  icon?: string;
  accountType: AccountType;
  balanceAsOf?: string;
  isDefault?: boolean;
};

interface AccountsTabProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AccountsTab({ open, onOpenChange }: AccountsTabProps) {
  const [pendingDelete, setPendingDelete] = useState<AccountRow | null>(null);
  const [editingRow, setEditingRow] = useState<AccountRow | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const user = useAuthStore((s) => s.user);

  const assetAccounts: AccountRow[] = assets
    .filter((a) => a.assetClass === 'cash')
    .map((a) => ({
      id: a.id,
      kind: 'asset',
      name: a.name,
      value: a.value,
      currency: a.currency,
      institution: a.institution,
      last4: a.last4,
      colour: a.colour,
      icon: a.icon,
      accountType: a.accountType ?? 'bank',
      balanceAsOf: a.balanceAsOf,
      isDefault: a.isDefaultAccount,
    }));

  const liabilityAccounts: AccountRow[] = liabilities
    .filter((l) => l.liabilityClass === 'credit_card')
    .map((l) => ({
      id: l.id,
      kind: 'liability',
      name: l.name,
      value: l.outstanding,
      currency: l.currency,
      last4: l.last4,
      colour: l.colour,
      icon: l.icon,
      accountType: 'credit_card',
      balanceAsOf: l.balanceAsOf,
      isDefault: l.isDefaultAccount,
    }));

  const accounts = [...assetAccounts, ...liabilityAccounts];
  // With only one account there's nothing to distinguish it from, so treat
  // it as the default visually without needing anyone to have set the flag.
  const soloDefault = accounts.length === 1 ? accounts[0].id : null;
  const total =
    assetAccounts.reduce((sum, a) => sum + a.value, 0) - liabilityAccounts.reduce((sum, a) => sum + a.value, 0);

  const handleDelete = async (row: AccountRow) => {
    if (!user) return;
    await removeDoc(user, row.kind === 'asset' ? 'assets' : 'liabilities', row.id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await handleDelete(pendingDelete);
    setPendingDelete(null);
  };

  const handleSetDefault = async (row: AccountRow) => {
    if (!user) return;
    await Promise.all([
      ...assets
        .filter((a) => a.assetClass === 'cash')
        .map((a) => upsertDoc(user, 'assets', { ...a, isDefaultAccount: row.kind === 'asset' && a.id === row.id })),
      ...liabilities
        .filter((l) => l.liabilityClass === 'credit_card')
        .map((l) =>
          upsertDoc(user, 'liabilities', { ...l, isDefaultAccount: row.kind === 'liability' && l.id === row.id })
        ),
    ]);
  };

  const openEdit = (row: AccountRow) => setEditingRow(row);

  const handleSave = async (form: {
    type: AccountType;
    name: string;
    institution: string;
    last4: string;
    openingBalance: number;
    currency: string;
    balanceAsOf: string;
    colour: string;
    icon: string;
  }) => {
    if (!user) return;
    if (form.type === 'credit_card') {
      const liability: Liability = {
        id: crypto.randomUUID(),
        name: form.name,
        liabilityClass: 'credit_card',
        outstanding: form.openingBalance,
        currency: form.currency,
        last4: form.last4 || undefined,
        colour: form.colour,
        icon: form.icon,
        balanceAsOf: form.balanceAsOf,
        isDefaultAccount: accounts.length === 0,
        updatedAt: Date.now(),
      };
      await upsertDoc(user, 'liabilities', liability);
    } else {
      const asset: Asset = {
        id: crypto.randomUUID(),
        name: form.name,
        assetClass: 'cash',
        value: form.openingBalance,
        currency: form.currency,
        institution: form.institution || undefined,
        last4: form.last4 || undefined,
        colour: form.colour,
        icon: form.icon,
        accountType: form.type,
        balanceAsOf: form.balanceAsOf,
        isDefaultAccount: accounts.length === 0,
        updatedAt: Date.now(),
      };
      await upsertDoc(user, 'assets', asset);
    }
    onOpenChange(false);
  };

  const handleUpdate = async (form: {
    type: AccountType;
    name: string;
    institution: string;
    last4: string;
    openingBalance: number;
    currency: string;
    balanceAsOf: string;
    colour: string;
    icon: string;
  }) => {
    if (!user || !editingRow) return;
    if (editingRow.kind === 'liability') {
      const original = liabilities.find((l) => l.id === editingRow.id);
      if (!original) return;
      const updated: Liability = {
        ...original,
        name: form.name,
        outstanding: form.openingBalance,
        currency: form.currency,
        last4: form.last4 || undefined,
        colour: form.colour,
        icon: form.icon,
        balanceAsOf: form.balanceAsOf,
        updatedAt: Date.now(),
      };
      await upsertDoc(user, 'liabilities', updated);
    } else {
      const original = assets.find((a) => a.id === editingRow.id);
      if (!original) return;
      const updated: Asset = {
        ...original,
        name: form.name,
        value: form.openingBalance,
        currency: form.currency,
        institution: form.institution || undefined,
        last4: form.last4 || undefined,
        colour: form.colour,
        icon: form.icon,
        balanceAsOf: form.balanceAsOf,
        updatedAt: Date.now(),
      };
      await upsertDoc(user, 'assets', updated);
    }
    setEditingRow(null);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">Net balance</p>
        <p className="text-2xl font-bold text-slate-900 dark:text-white">
          <Amount value={total} />
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((row) => {
          const Icon = resolveAccountIcon(row.icon, row.accountType);
          const typeLabel = ACCOUNT_TYPES.find((t) => t.key === row.accountType)?.label ?? 'Account';
          const rowKey = `${row.kind}-${row.id}`;
          const isDefault = row.isDefault || soloDefault === row.id;
          const isExpanded = expandedKey === rowKey;
          const colour = row.colour || '#334155';
          return (
            <div
              key={rowKey}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${colour}1a`, color: colour }}
                  >
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-slate-800 dark:text-slate-100 truncate uppercase">{row.name}</p>
                      {isDefault ? (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-amber-500 dark:text-amber-400 shrink-0">
                          <Star size={11} className="fill-amber-400 text-amber-400" />
                          Default
                        </span>
                      ) : (
                        <button
                          onClick={() => handleSetDefault(row)}
                          className="text-[11px] font-medium text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 shrink-0"
                        >
                          Set default
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                      {typeLabel}
                      {row.institution ? ` · ${row.institution}` : ''}
                      {row.last4 ? `  •• ${row.last4}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => openEdit(row)}
                    title="Edit account"
                    className="tap-scale text-slate-300 dark:text-slate-600 hover:text-brand-600 dark:hover:text-brand-400 p-1"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setPendingDelete(row)}
                    title="Delete account"
                    className="tap-scale text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-1"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => setExpandedKey(isExpanded ? null : rowKey)}
                    title="Details"
                    className="tap-scale text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-300 p-1"
                  >
                    <ChevronDown size={16} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              <p
                className={`text-2xl font-bold mt-4 ${
                  row.kind === 'liability' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'
                }`}
              >
                {row.kind === 'liability' ? '-' : ''}
                <Amount value={row.value} currency={row.currency} />
              </p>
              <p className="text-[11px] font-semibold tracking-wide uppercase text-slate-400 dark:text-slate-500 mt-0.5">
                Current balance
              </p>

              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-slate-400 dark:text-slate-500">Type</p>
                    <p className="text-slate-700 dark:text-slate-200 font-medium mt-0.5">{typeLabel}</p>
                  </div>
                  {row.balanceAsOf && (
                    <div>
                      <p className="text-slate-400 dark:text-slate-500">Balance as of</p>
                      <p className="text-slate-700 dark:text-slate-200 font-medium mt-0.5">{row.balanceAsOf}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {accounts.length === 0 && (
          <div className="col-span-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-14 flex flex-col items-center justify-center text-center gap-4">
            <p className="text-slate-400 dark:text-slate-500 text-sm">
              No accounts yet. Add a bank, card, cash, or wallet to get started.
            </p>
            <button
              onClick={() => onOpenChange(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg text-base font-medium"
            >
              Add Account
            </button>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => onOpenChange(false)} title="Add Account" widthClassName="max-w-lg">
        <AccountForm onSave={handleSave} />
      </Modal>

      <Modal open={!!editingRow} onClose={() => setEditingRow(null)} title="Edit Account" widthClassName="max-w-lg">
        {editingRow && (
          <AccountForm
            initial={{
              type: editingRow.accountType,
              name: editingRow.name,
              institution: editingRow.institution ?? '',
              last4: editingRow.last4 ?? '',
              openingBalance: editingRow.value,
              currency: editingRow.currency,
              balanceAsOf: editingRow.balanceAsOf ?? new Date().toISOString().slice(0, 10),
              colour: editingRow.colour ?? ACCOUNT_COLOURS[0],
              icon: editingRow.icon ?? 'auto',
            }}
            lockType
            submitLabel="Save Changes"
            onSave={handleUpdate}
          />
        )}
      </Modal>

      <ConfirmDeleteModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this account?"
        description={<>This will permanently delete <strong className="uppercase">{pendingDelete?.name}</strong>. This can't be undone.</>}
      />
    </div>
  );
}

function AccountForm({
  initial,
  lockType = false,
  submitLabel = 'Save Account',
  onSave,
}: {
  initial?: {
    type: AccountType;
    name: string;
    institution: string;
    last4: string;
    openingBalance: number;
    currency: string;
    balanceAsOf: string;
    colour: string;
    icon: string;
  };
  lockType?: boolean;
  submitLabel?: string;
  onSave: (form: {
    type: AccountType;
    name: string;
    institution: string;
    last4: string;
    openingBalance: number;
    currency: string;
    balanceAsOf: string;
    colour: string;
    icon: string;
  }) => void;
}) {
  const [type, setType] = useState<AccountType>(initial?.type ?? 'bank');
  const [name, setName] = useState(initial?.name ?? '');
  const [institution, setInstitution] = useState(initial?.institution ?? '');
  const [last4, setLast4] = useState(initial?.last4 ?? '');
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance?.toString() ?? '0');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');
  const [balanceAsOf, setBalanceAsOf] = useState(initial?.balanceAsOf ?? new Date().toISOString().slice(0, 10));
  const [colour, setColour] = useState(initial?.colour ?? ACCOUNT_COLOURS[0]);
  const [icon, setIcon] = useState(initial?.icon ?? 'auto');

  const showBankField = type === 'bank' || type === 'credit_card';

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      type,
      name: name.trim(),
      institution,
      last4,
      openingBalance: Number(openingBalance) || 0,
      currency,
      balanceAsOf,
      colour,
      icon,
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">
          Type <span className="text-red-500">*</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ACCOUNT_TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.key;
            return (
              <button
                key={t.key}
                type="button"
                disabled={lockType}
                onClick={() => setType(t.key)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-colors ${
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                } ${lockType ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Icon size={18} />
                {t.label}
              </button>
            );
          })}
        </div>
        {lockType && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            Type can't be changed after an account is created — delete and re-add it instead.
          </p>
        )}
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block">
          Name <span className="text-red-500">*</span>
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          className={`${inputClass} uppercase`}
          placeholder="e.g. HDFC Savings"
        />
      </label>

      {showBankField && (
        <div className="grid grid-cols-3 gap-3">
          <label className="block col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block">Bank</span>
            <input
              list="bank-options"
              value={institution}
              onChange={(e) => setInstitution(e.target.value.toUpperCase())}
              className={`${inputClass} uppercase`}
              placeholder="Pick or type a bank"
            />
            <datalist id="bank-options">
              {COMMON_BANKS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block">Last 4</span>
            <input
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className={inputClass}
              placeholder="1234"
              inputMode="numeric"
            />
          </label>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <label className="block col-span-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block">
            {lockType ? 'Current Balance' : 'Opening Balance'}
          </span>
          <input
            type="number"
            value={openingBalance}
            onChange={(e) => setOpeningBalance(e.target.value)}
            className={inputClass}
            placeholder="0"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block">Currency</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1 block">Balance as of</span>
        <input type="date" value={balanceAsOf} onChange={(e) => setBalanceAsOf(e.target.value)} className={inputClass} />
        <span className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 block">
          Balance from this date forward — income, expenses and transfers dated on/after this adjust it live.
        </span>
      </label>

      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Colour</p>
        <div className="flex gap-2.5">
          {ACCOUNT_COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColour(c)}
              className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: c }}
            >
              {colour === c && <Check size={16} className="text-white" />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">Icon</p>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_ICONS.map((i) => {
            const active = icon === i.key;
            const Icon = i.icon ?? ACCOUNT_TYPES.find((t) => t.key === type)!.icon;
            return (
              <button
                key={i.key}
                type="button"
                onClick={() => setIcon(i.key)}
                className={`h-10 w-14 rounded-lg flex items-center justify-center gap-1 text-xs font-medium border shrink-0 ${
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {i.key === 'auto' ? 'Auto' : <Icon size={16} />}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        {submitLabel}
      </button>
    </div>
  );
}
