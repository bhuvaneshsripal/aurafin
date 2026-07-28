import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Settings as SettingsIcon } from 'lucide-react';
import TransactionsTab from './money/TransactionsTab';
import BudgetTab from './money/BudgetTab';
import AccountsTab from './money/AccountsTab';
import InsightsTab from './money/InsightsTab';

const TABS = [
  {
    key: 'transactions',
    label: 'Transactions',
    title: 'Transactions',
    subtitle: 'All your income and expenses in one place',
  },
  {
    key: 'budget',
    label: 'Budget',
    title: 'Budget',
    subtitle: 'Plan your month, then watch how it goes',
  },
  {
    key: 'accounts',
    label: 'Accounts',
    title: 'Accounts',
    subtitle: 'Bank, card, cash & wallet',
  },
  {
    key: 'insights',
    label: 'Insights',
    title: 'Insights',
    subtitle: 'See where your money goes',
  },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function Money() {
  const [tab, setTab] = useState<TabKey>('transactions');
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const navigate = useNavigate();

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{active.title}</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-base mt-1">{active.subtitle}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tab === 'accounts' && (
            <button
              onClick={() => setAccountsModalOpen(true)}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm sm:text-base font-medium"
            >
              <Plus size={18} /> Add Account
            </button>
          )}
          <button
            onClick={() => navigate('/settings')}
            title="Money settings"
            className="tap-scale h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <SettingsIcon size={20} />
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <div className="flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`shrink-0 pb-3 text-sm sm:text-base font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-brand-600 text-brand-700 dark:text-brand-300'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'transactions' && <TransactionsTab />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'accounts' && <AccountsTab open={accountsModalOpen} onOpenChange={setAccountsModalOpen} />}
      {tab === 'insights' && <InsightsTab />}
    </div>
  );
}
