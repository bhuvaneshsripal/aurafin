import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Pencil, Check, ChevronRight, ChevronDown, Shield, PiggyBank, Landmark, Pill } from 'lucide-react';
import { useGoalsStore } from '../store/goalsStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useFinancialProfileStore } from '../store/financialProfileStore';
import { useAuthStore } from '../store/authStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import { resolveAssetValues } from '../utils/assetValues';
import {
  computeLiquidAssets,
  emergencyFundStatus,
  savingsRateStatus,
  debtRatioStatus,
  coverStatus,
  yearsToFI,
  idealTermCover,
  overallHealthScore,
  scoreLabel,
  RISK_STYLES,
  type RiskLevel,
} from '../utils/financialHealth';
import Modal from '../components/Modal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import Amount from '../components/Amount';
import type { Goal } from '../types';
import { CURRENCIES, formatCurrency } from '../utils/currency';

type Tab = 'health' | 'goals';

export default function Essentials() {
  const [tab, setTab] = useState<Tab>('health');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Essentials</h1>
        <p className="text-slate-500 dark:text-slate-400 text-base mt-1">Financial health check</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
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
                ? 'border-brand-600 dark:border-brand-500 text-brand-700 dark:text-brand-300'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
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
  const user = useAuthStore((s) => s.user);
  const profile = useFinancialProfileStore((s) => s.profile);
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);

  const [age, setAge] = useState('');
  const [income, setIncome] = useState('');
  const [expense, setExpense] = useState('');
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const autoCollapsedRef = useRef(false);

  // Load the saved profile into the form once it arrives.
  useEffect(() => {
    if (!profile) return;
    setAge(profile.age?.toString() ?? '');
    setIncome(profile.monthlyIncome?.toString() ?? '');
    setExpense(profile.monthlyExpense?.toString() ?? '');
  }, [profile]);

  const monthlySavings = Math.max(0, (Number(income) || 0) - (Number(expense) || 0));

  const saveField = async (patch: Partial<{ age: number; monthlyIncome: number; monthlyExpense: number; termCover: number; healthCover: number; dependents: number }>) => {
    if (!user) return;
    await upsertDoc(user.uid, 'financialProfile', { id: 'profile', ...(profile ?? {}), ...patch });
  };

  const handleSaveSnapshot = () => {
    saveField({
      age: Number(age) || undefined,
      monthlyIncome: Number(income) || undefined,
      monthlyExpense: Number(expense) || undefined,
    });
  };

  const hasProfile = !!profile?.monthlyIncome;

  useEffect(() => {
    if (hasProfile && !autoCollapsedRef.current) {
      setSnapshotOpen(false);
      autoCollapsedRef.current = true;
    } else if (!hasProfile) {
      setSnapshotOpen(true);
    }
  }, [hasProfile]);

  // --- Derived figures for the dashboard ---
  const totalAssets = assets.reduce((s, a) => s + resolveAssetValues(a, livePrices, sipValues).value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;
  const liquidAssets = computeLiquidAssets(assets, livePrices, sipValues);

  const monthlyExpense = profile?.monthlyExpense ?? 0;
  const monthlyIncome = profile?.monthlyIncome ?? 0;
  const annualExpense = monthlyExpense * 12;

  const runwayMonths = monthlyExpense > 0 ? liquidAssets / monthlyExpense : 0;
  const efStatus = emergencyFundStatus(runwayMonths);

  const savingsRate = monthlyIncome > 0 ? Math.max(0, (monthlyIncome - monthlyExpense) / monthlyIncome) : 0;
  const srStatus = savingsRateStatus(savingsRate);
  const fiYears = yearsToFI(savingsRate);

  const idealTerm = idealTermCover(annualExpense, netWorth);
  const termCover = profile?.termCover ?? 0;
  const termStatus = coverStatus(termCover, idealTerm);

  const healthCover = profile?.healthCover ?? 0;
  const idealHealthMin = 500000;
  const healthStatus = coverStatus(healthCover, idealHealthMin);

  const debtRatio = totalAssets > 0 ? totalLiabilities / totalAssets : 0;
  const drStatus = debtRatioStatus(debtRatio);

  const scoreFor = (status: RiskLevel) => (status === 'perfect' ? 10 : status === 'good' ? 6 : 2.5);
  const overall = hasProfile
    ? overallHealthScore([scoreFor(efStatus), scoreFor(srStatus), scoreFor(termStatus), scoreFor(healthStatus), scoreFor(drStatus)])
    : 0;

  return (
    <div className="space-y-4">
      {!hasProfile && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-base font-medium text-amber-800">
            Add your income and expenses to get a simple savings-rate score.
          </p>
          <p className="text-sm text-amber-700 mt-1">
            This stays on your device until you hit save — nothing is calculated on a server.
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <button
          onClick={() => setSnapshotOpen((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Your Financial Snapshot</h2>
            {!snapshotOpen && hasProfile && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Age {age || '—'} · Income <Amount value={monthlyIncome} /> · Expenses <Amount value={monthlyExpense} />
              </p>
            )}
          </div>
          <ChevronDown
            size={20}
            className={`text-slate-400 shrink-0 transition-transform duration-200 ${snapshotOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {snapshotOpen && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Age">
                <input type="number" value={age} onChange={(e) => setAge(e.target.value)} className={inputClass} placeholder="e.g. 28" />
              </Field>
              <Field label="Monthly Income">
                <input type="number" value={income} onChange={(e) => setIncome(e.target.value)} className={inputClass} placeholder="0" />
              </Field>
              <Field label="Monthly Expenses">
                <input type="number" value={expense} onChange={(e) => setExpense(e.target.value)} className={inputClass} placeholder="0" />
              </Field>
              <Field label="Monthly Savings">
                <input
                  value={formatCurrency(monthlySavings)}
                  readOnly
                  className={`${inputClass} bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed`}
                />
              </Field>
            </div>
            <button
              onClick={handleSaveSnapshot}
              className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg text-base font-medium"
            >
              Save
            </button>
          </>
        )}
      </div>

      {hasProfile && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-numeric text-[#8a3b2e] dark:text-[#e08a72]">{overall}</span>
                <span className="text-slate-400 text-lg">/10</span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 ml-2">
                  Overall Health Score
                </span>
              </div>
              <span className="text-sm font-semibold text-[#8a3b2e] dark:text-[#e08a72]">
                {scoreLabel(overall)}
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#a5573f]"
                style={{ width: `${overall * 10}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Emergency Fund */}
            <HealthCard title="Emergency Fund" status={efStatus} icon={Shield} iconTone="emergency">
              <StatRow label="LIQUID ASSETS" value={<Amount value={liquidAssets} />} />
              <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">Cash &amp; Savings · FD &amp; RD · Liquid / Debt Funds</p>
              <StatRow label="RUNWAY" value={<><span className="font-numeric">{runwayMonths.toFixed(runwayMonths < 10 ? 1 : 0)}</span> months</>} />
              <ScaleBar value={runwayMonths} max={12} marks={['0', '3m', '6m', '12m+']} />
              <p className="text-sm text-slate-500 dark:text-slate-400">Build at least 3 months of expenses in liquid savings</p>
            </HealthCard>

            {/* Savings Rate */}
            <HealthCard title="Savings Rate" subtitle="intended · from financial profile" status={srStatus} icon={PiggyBank} iconTone="savings">
              <div>
                <span className="text-3xl font-numeric text-brand-600 dark:text-brand-300">{Math.round(savingsRate * 100)}%</span>
                <span className="text-slate-500 dark:text-slate-400 text-sm ml-1.5">of income saved</span>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">Based on your Financial Profile · actual savings may differ</p>
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Income</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    <Amount value={monthlyIncome} />
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Expense</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    <Amount value={monthlyExpense} />
                  </p>
                </div>
              </div>
              <ScaleBar value={savingsRate * 100} max={100} marks={['0%', '20%', '50%', '80%+']} />
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Time to Financial Independence
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {fiYears > 0 ? <>around <span className="font-numeric">{fiYears}</span> yrs</> : 'Already there!'}
                </span>
              </div>
              <FiTimelineReference />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {savingsRate >= 0.5
                  ? "Outstanding! You're on a fast track to financial freedom"
                  : savingsRate >= 0.2
                    ? "Solid pace — keep pushing your savings rate higher"
                    : 'Aiming for 20%+ savings is a solid target'}
              </p>
            </HealthCard>

            {/* Term Insurance */}
            <HealthCard title="Term Insurance" status={termStatus} icon={Landmark} iconTone="term">
              <CoverInput label="YOUR COVER" value={termCover} onSave={(v) => saveField({ termCover: v })} />
              <StatRow label="IDEAL COVER" value={<Amount value={idealTerm} />} />
              <ScaleBar value={termCover} max={Math.max(idealTerm, 1)} marks={[]} />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Formula: 25 × Annual Expense − Net Worth = {formatCurrency(idealTerm)}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {termStatus === 'perfect'
                  ? 'Your term cover looks adequate'
                  : 'Your term cover is significantly below the recommended amount'}
              </p>
            </HealthCard>

            {/* Health Insurance */}
            <HealthCard title="Health Insurance" status={healthStatus} icon={Pill} iconTone="health">
              <DependentsRow value={profile?.dependents ?? 0} onSave={(v) => saveField({ dependents: v })} />
              <CoverInput label="YOUR COVER" value={healthCover} onSave={(v) => saveField({ healthCover: v })} />
              <StatRow label="RECOMMENDED" value="Min ₹5L · Good ₹10L" />
              <ScaleBar value={healthCover} max={1000000} marks={[]} />
              <p className="text-sm text-slate-500 dark:text-slate-400">Minimum ₹5L private health cover is recommended</p>
            </HealthCard>

            {/* Debt Ratio */}
            <HealthCard title="Debt Ratio" status={drStatus} className="sm:col-span-2 lg:col-span-3">
              <div>
                <span className="text-3xl font-numeric text-slate-900 dark:text-white">{Math.round(debtRatio * 100)}%</span>
                <span className="text-slate-500 dark:text-slate-400 text-sm ml-1.5">of assets are debt-funded</span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total Assets</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    <Amount value={totalAssets} />
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Total Liabilities</p>
                  <p className="font-semibold text-slate-800 dark:text-slate-100">
                    <Amount value={totalLiabilities} />
                  </p>
                </div>
              </div>
              <ScaleBar value={debtRatio * 100} max={100} marks={['0%', '10%', '30%', '50%+']} />
              <div className="bg-brand-50 dark:bg-brand-900/20 rounded-lg px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Net Worth</span>
                <span className="font-semibold text-brand-700 dark:text-brand-300">
                  <Amount value={netWorth} />
                </span>
              </div>
            </HealthCard>
          </div>
        </div>
      )}
    </div>
  );
}

function FiTimelineReference() {
  const [open, setOpen] = useState(false);
  const rows: [string, string][] = [
    ['20%', '37 yrs'],
    ['40%', '22 yrs'],
    ['60%', '12.5 yrs'],
    ['75%', '7 yrs'],
    ['90%', '2.5 yrs'],
  ];
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-brand-700 dark:text-brand-300"
      >
        <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        View FI timeline reference
      </button>
      {open && (
        <div className="grid grid-cols-5 gap-2 mt-2 text-center">
          {rows.map(([rate, years]) => (
            <div key={rate} className="bg-slate-50 dark:bg-slate-800 rounded-lg py-1.5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{rate}</p>
              <p className="text-[11px] text-slate-400">{years}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const PILL_STYLES: Record<RiskLevel, string> = {
  risky: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
  good: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  perfect: 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300',
};

const ICON_STYLES: Record<string, string> = {
  emergency: 'bg-blue-50 text-blue-500 dark:bg-blue-950/40 dark:text-blue-400',
  savings: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
  term: 'bg-indigo-50 text-indigo-500 dark:bg-indigo-950/40 dark:text-indigo-400',
  health: 'bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-400',
  debt: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function HealthCard({
  title,
  subtitle,
  status,
  className = '',
  children,
  icon: Icon,
  iconTone = 'debt',
}: {
  title: string;
  subtitle?: string;
  status: RiskLevel;
  className?: string;
  children: React.ReactNode;
  icon?: typeof Shield;
  iconTone?: keyof typeof ICON_STYLES;
}) {
  const style = RISK_STYLES[status];
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-3 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon && (
            <span className={`h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ${ICON_STYLES[iconTone]}`}>
              <Icon size={18} />
            </span>
          )}
          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
            {subtitle && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        <span className={`flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap px-2.5 py-1 rounded-full ${PILL_STYLES[status]}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
          {style.label}
        </span>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <span className="font-semibold text-slate-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

function ScaleBar({ value, max, marks }: { value: number; max: number; marks: string[] }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      {marks.length > 0 && (
        <div className="flex justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-1">
          {marks.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CoverInput({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [draft, setDraft] = useState(value > 0 ? value.toString() : '');
  const [savedTick, setSavedTick] = useState(false);

  const commit = () => {
    onSave(Number(draft) || 0);
    setSavedTick(true);
    setTimeout(() => setSavedTick(false), 1500);
  };

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Enter cover amount"
          className="flex-1 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button
          onClick={commit}
          className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-lg border ${
            savedTick
              ? 'border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300'
              : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <Check size={16} />
        </button>
      </div>
    </div>
  );
}

function DependentsRow({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value.toString());

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">DEPENDENTS</span>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-16 border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-500"
            autoFocus
          />
          <button
            onClick={() => {
              onSave(Number(draft) || 0);
              setEditing(false);
            }}
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-brand-500 bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
          >
            <Check size={14} />
          </button>
        </div>
      ) : (
        <span className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {value} people
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-brand-600 dark:hover:text-brand-300">
            <Pencil size={14} />
          </button>
        </span>
      )}
    </div>
  );
}

function GoalsTab() {
  const allGoals = useGoalsStore((s) => s.goals);
  const user = useAuthStore((s) => s.user);
  const allAssets = useAssetsStore((s) => s.assets);
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Goal | null>(null);

  const goals = activeProfileId ? allGoals.filter((g) => g.profileId === activeProfileId) : allGoals;
  const assets = activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets;
  const liabilities = activeProfileId
    ? allLiabilities.filter((l) => l.profileId === activeProfileId)
    : allLiabilities;

  // Same calc the Dashboard uses for the headline Net Worth figure, so every
  // goal's progress always reflects the live number — never a stale manual entry.
  const totalAssets = assets.reduce((s, a) => s + resolveAssetValues(a, livePrices, sipValues).value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'goals', id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await handleDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleSave = async (goal: Goal) => {
    if (!user) return;
    await upsertDoc(user.uid, 'goals', goal.profileId ? goal : { ...goal, profileId: activeProfileId ?? undefined });
    setModalOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-base text-slate-500 dark:text-slate-400">{goals.length} active goals</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {goals.map((g) => {
          const current = Math.max(0, netWorth);
          const pct = g.targetAmount > 0 ? Math.min(100, Math.round((current / g.targetAmount) * 100)) : 0;
          return (
            <div key={g.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-lg">{g.name}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setEditing(g);
                      setModalOpen(true);
                    }}
                    className="text-slate-400 dark:text-slate-500 hover:text-brand-600 dark:hover:text-brand-300"
                  >
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => setPendingDelete(g)} className="text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mb-2">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
                <span>{formatCurrency(current, g.currency)} · from Net Worth</span>
                <span>{pct}% of {formatCurrency(g.targetAmount, g.currency)}</span>
              </div>
            </div>
          );
        })}
        {goals.length === 0 && (
          <div className="col-span-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-14 flex flex-col items-center justify-center text-center gap-4">
            <p className="text-slate-400 dark:text-slate-500">
              No goals yet. Set a retirement corpus, emergency fund, or education target.
            </p>
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg text-base font-medium"
            >
              <Plus size={18} /> Add Goal
            </button>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Goal' : 'Add Goal'}>
        <GoalForm initial={editing} onSave={handleSave} />
      </Modal>

      <ConfirmDeleteModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this goal?"
        description={<>This will permanently delete <strong>{pendingDelete?.name}</strong>. This can't be undone.</>}
      />
    </div>
  );
}

const GOAL_NAME_SUGGESTIONS = [
  'Retirement Corpus',
  'Emergency Fund',
  'Child Education',
  'Child Marriage',
  'Home Down Payment',
  'Home Renovation',
  'Car Purchase',
  'Wedding Fund',
  'Dream Vacation',
  'Debt-Free Goal',
  'Health Emergency Fund',
  'Business Fund',
];

function GoalForm({ initial, onSave }: { initial: Goal | null; onSave: (g: Goal) => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [targetAmount, setTargetAmount] = useState(initial?.targetAmount?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');

  const submit = () => {
    if (!name || !targetAmount) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      targetAmount: Number(targetAmount),
      currentAmount: initial?.currentAmount ?? 0,
      currency,
    });
  };

  return (
    <div className="space-y-4">
      <Field label="Goal Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
          placeholder="e.g. Retirement Corpus"
          list="goal-name-suggestions"
          autoComplete="off"
        />
        <datalist id="goal-name-suggestions">
          {GOAL_NAME_SUGGESTIONS.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
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
      <p className="text-xs text-slate-400 dark:text-slate-500 -mt-1">
        Progress is calculated automatically from your current Net Worth — no need to update it manually.
      </p>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Goal
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';
