import { useRef, useState, useEffect } from 'react';
import { Plus, Trash2, Download, ChevronDown, ArrowDownCircle, ArrowUpCircle, Receipt } from 'lucide-react';
import { useTransactionsStore } from '../../store/transactionsStore';
import { useAuthStore } from '../../store/authStore';
import { useHouseholdProfilesStore } from '../../store/householdProfilesStore';
import { useSyncStatusStore } from '../../store/syncStatusStore';
import { upsertDoc, removeDoc } from '../../hooks/useFirestoreSync';
import { exportToCsv } from '../../utils/exportCsv';
import { formatDate, toIsoDate } from '../../utils/date';
import Modal from '../../components/Modal';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import Amount from '../../components/Amount';
import type { Transaction, TransactionType } from '../../types';
import CurrencySelect from '../../components/CurrencySelect';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  StatCard,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  inputClasses,
  DateInput,
} from '../../components/ui';

export default function TransactionsTab() {
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const user = useAuthStore((s) => s.user);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const transactionsServerConfirmed = useSyncStatusStore((s) => s.transactionsServerConfirmed);
  // Same "already known, or server-confirmed empty" reasoning as
  // Dashboard.tsx — otherwise this briefly flashes "0 in · 0 out" while
  // transactions are still loading, most visible on a slower connection.
  const cashflowDataKnown = allTransactions.length > 0 || transactionsServerConfirmed;
  const transactions = activeProfileId
    ? allTransactions.filter((t) => t.profileId === activeProfileId)
    : allTransactions;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<TransactionType>('expense');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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
    await removeDoc(user, 'transactions', id);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    await handleDelete(pendingDeleteId);
    setPendingDeleteId(null);
  };

  const handleSave = async (t: Transaction) => {
    if (!user) return;
    await upsertDoc(user, 'transactions', t.profileId ? t : { ...t, profileId: activeProfileId ?? undefined });
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToCsv(
      'transactions',
      transactions.map((t) => ({
        Date: formatDate(t.date),
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

  const fmtDate = (iso: string) => formatDate(iso) || iso;
  const net = income - expense;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          dense
          label="Income"
          tone="positive"
          loading={!cashflowDataKnown}
          value={<Amount value={income} />}
        />
        <StatCard dense label="Expenses" loading={!cashflowDataKnown} value={<Amount value={expense} />} />
        <StatCard
          dense
          label="Net"
          loading={!cashflowDataKnown}
          tone={net >= 0 ? 'default' : 'negative'}
          value={<Amount value={net} />}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {transactions.length} {transactions.length === 1 ? 'entry' : 'entries'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={transactions.length === 0}
            leftIcon={<Download size={15} />}
          >
            Export
          </Button>
          <div className="relative" ref={menuRef}>
            <Button
              onClick={() => setAddMenuOpen((o) => !o)}
              leftIcon={<Plus size={16} />}
              rightIcon={<ChevronDown size={15} className="opacity-80" />}
            >
              Add
            </Button>
            {addMenuOpen && (
              <div className="animate-menu-in absolute right-0 mt-2 w-48 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-10 py-1">
                <button
                  onClick={() => openModal('expense')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover"
                >
                  <ArrowDownCircle size={16} className="text-muted" /> Add expense
                </button>
                <button
                  onClick={() => openModal('income')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover"
                >
                  <ArrowUpCircle size={16} className="text-positive" /> Add income
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Receipt size={18} />}
            title="No entries yet"
            description="Log your salary, rent, groceries, and more."
            action={
              <Button onClick={() => openModal('expense')} leftIcon={<Plus size={16} />}>
                Add transaction
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Mobile: card list (no cramped, cut-off columns) */}
          <ul className="md:hidden bg-surface rounded-2xl border border-line divide-y divide-line-soft overflow-hidden">
            {sorted.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">{t.category}</p>
                  <p className="text-xs text-muted mt-0.5">{fmtDate(t.date)}</p>
                </div>
                <span
                  className={`font-numeric text-sm font-semibold whitespace-nowrap ${
                    t.type === 'income' ? 'text-positive' : 'text-ink'
                  }`}
                >
                  {t.type === 'expense' ? '−' : '+'}
                  <Amount value={t.amount} currency={t.currency} />
                </span>
                <IconButton
                  label="Delete transaction"
                  size="sm"
                  onClick={() => setPendingDeleteId(t.id)}
                  className="hover:!text-negative"
                >
                  <Trash2 size={15} />
                </IconButton>
              </li>
            ))}
          </ul>

          {/* Desktop: full table */}
          <Card padding="none" className="hidden md:block overflow-hidden">
            <TableContainer>
              <Table>
                <THead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Category</Th>
                    <Th>Type</Th>
                    <Th align="right">Amount</Th>
                    <th className="w-12" aria-hidden="true" />
                  </tr>
                </THead>
                <TBody>
                  {sorted.map((t) => (
                    <Tr key={t.id} className="group">
                      <Td className="text-muted whitespace-nowrap">{fmtDate(t.date)}</Td>
                      <Td className="font-medium">{t.category}</Td>
                      <Td>
                        <Badge variant={t.type === 'income' ? 'success' : 'neutral'}>
                          {t.type === 'income' ? 'Income' : 'Expense'}
                        </Badge>
                      </Td>
                      <Td numeric className={t.type === 'income' ? 'text-positive' : undefined}>
                        {t.type === 'expense' ? '−' : '+'}
                        <Amount value={t.amount} currency={t.currency} />
                      </Td>
                      <td className="px-2 py-2">
                        <IconButton
                          label="Delete transaction"
                          size="sm"
                          onClick={() => setPendingDeleteId(t.id)}
                          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:!text-negative hover:!bg-negative-soft"
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableContainer>
          </Card>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalType === 'income' ? 'Add Income' : 'Add Expense'}
      >
        <TransactionForm initialType={modalType} onSave={handleSave} />
      </Modal>

      <ConfirmDeleteModal
        open={!!pendingDeleteId}
        onClose={() => setPendingDeleteId(null)}
        onConfirm={confirmDelete}
        title="Delete this transaction?"
        description="This will permanently delete this transaction. This can't be undone."
      />
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
  const [date, setDate] = useState(toIsoDate());

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
                : 'border-line text-slate-500'
            }`}
          >
            {t === 'income' ? 'Income' : 'Expense'}
          </button>
        ))}
      </div>
      <Field label="Category">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value.toUpperCase())}
          className={`${inputClass}`}
          placeholder="e.g. Rent, Salary, Groceries"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} className={inputClass} />
        </Field>
      </div>
      <Field label="Date">
        <DateInput value={date} onChange={(v) => setDate(v)} className={inputClass} />
      </Field>
      <button onClick={submit} className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors w-full bg-brand-600 hover:bg-brand-700 text-white">
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

const inputClass = inputClasses;
