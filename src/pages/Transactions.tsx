import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Settings as SettingsIcon } from 'lucide-react';
import TransactionsTab from './money/TransactionsTab';
import BudgetTab from './money/BudgetTab';
import AccountsTab from './money/AccountsTab';
import InsightsTab from './money/InsightsTab';
import { useUrlTab } from '../hooks/useUrlTab';
import { Button, IconButton, PageHeader, Tabs } from '../components/ui';

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
  const [tab, setTab] = useUrlTab<TabKey>(
    ['transactions', 'budget', 'accounts', 'insights'],
    'transactions'
  );
  const [accountsModalOpen, setAccountsModalOpen] = useState(false);
  const navigate = useNavigate();

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-5">
      <PageHeader
        title={active.title}
        description={active.subtitle}
        actionsInline
        actions={
          <>
            {tab === 'accounts' && (
              <Button onClick={() => setAccountsModalOpen(true)} leftIcon={<Plus size={16} />}>
                Add account
              </Button>
            )}
            <IconButton label="Money settings" onClick={() => navigate('/settings')}>
              <SettingsIcon size={18} />
            </IconButton>
          </>
        }
      />

      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        items={TABS.map((t) => ({ key: t.key, label: t.label }))}
      />

      {tab === 'transactions' && <TransactionsTab />}
      {tab === 'budget' && <BudgetTab />}
      {tab === 'accounts' && <AccountsTab open={accountsModalOpen} onOpenChange={setAccountsModalOpen} />}
      {tab === 'insights' && <InsightsTab />}
    </div>
  );
}
