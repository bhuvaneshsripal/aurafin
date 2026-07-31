import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Coins,
  Globe2,
  BadgeCheck,
  Upload,
  ArrowRight,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAppLockStore } from '../store/appLockStore';
import { upsertDoc } from '../hooks/useFirestoreSync';
import { ASSET_TAXONOMY } from '../utils/taxonomy';
import Modal from '../components/Modal';
import PinBoxInput from '../components/PinBoxInput';

const STEPS = ['welcome', 'profile', 'assets', 'secure'] as const;
type StepKey = (typeof STEPS)[number];

/**
 * First-run wizard for brand-new accounts: a welcome/feature overview, an
 * optional financial-profile snapshot, an optional first pass at adding
 * assets, and an optional app-lock PIN — each step skippable, mirroring a
 * typical "three-to-four step" fintech onboarding flow. Rendered full-screen
 * with no sidebar/topbar (see AppShell in App.tsx).
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  const [stepIndex, setStepIndex] = useState(0);
  const step: StepKey = STEPS[stepIndex];

  const [age, setAge] = useState('');
  const [income, setIncome] = useState('');
  const [expense, setExpense] = useState('');
  const [savings, setSavings] = useState('');

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const goTo = (i: number) => setStepIndex(Math.max(0, Math.min(STEPS.length - 1, i)));

  const saveProfile = async () => {
    if (!user) return;
    if (!age && !income && !expense && !savings) return;
    await upsertDoc(user.uid, 'financialProfile', {
      id: 'profile',
      age: Number(age) || undefined,
      monthlyIncome: Number(income) || undefined,
      monthlyExpense: Number(expense) || undefined,
      monthlySavings: Number(savings) || undefined,
    });
  };

  const finish = () => {
    completeOnboarding();
    if (selectedTypes[0]) {
      navigate('/wealth', { state: { startAddAsset: selectedTypes[0] } });
    } else {
      navigate('/');
    }
  };

  const goImport = () => {
    completeOnboarding();
    navigate('/import');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-100 dark:bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="font-luxury text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Aurafin<span className="text-brand-500">.</span>
          </h1>
        </div>

        <div className="flex items-center justify-center gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all ${
                i === stepIndex
                  ? 'w-6 bg-brand-600'
                  : i < stepIndex
                    ? 'w-2 bg-brand-600'
                    : 'w-2 bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
          {step === 'welcome' && <WelcomeStep onNext={() => goTo(1)} />}

          {step === 'profile' && (
            <ProfileStep
              age={age}
              setAge={setAge}
              income={income}
              setIncome={setIncome}
              expense={expense}
              setExpense={setExpense}
              savings={savings}
              setSavings={setSavings}
              onBack={() => goTo(0)}
              onSkip={() => goTo(2)}
              onContinue={async () => {
                await saveProfile();
                goTo(2);
              }}
            />
          )}

          {step === 'assets' && (
            <AssetsStep
              selected={selectedTypes}
              setSelected={setSelectedTypes}
              onBack={() => goTo(1)}
              onSkip={() => goTo(3)}
              onSave={() => goTo(3)}
              onImportBroker={goImport}
            />
          )}

          {step === 'secure' && <SecureStep onBack={() => goTo(2)} onSkip={finish} onDone={finish} />}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center">
        <Sparkles size={26} className="text-brand-600" />
      </div>
      <div>
        <h2 className="font-luxury text-2xl font-semibold text-slate-900 dark:text-white mb-2">
          Welcome to Aurafin
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Your privacy-first net worth tracker. Your data lives in your own account — no ads, no
          selling your data. Just you and your numbers.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 w-full">
        <FeatureBox icon={Coins} label="Track assets & liabilities" />
        <FeatureBox icon={Globe2} label="Multi-currency support" />
        <FeatureBox icon={BadgeCheck} label="Private & secure" />
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-1 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium"
      >
        Get Started
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function FeatureBox({ icon: Icon, label }: { icon: typeof Coins; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <Icon size={18} className="text-brand-600" />
      <span className="text-[11px] leading-tight text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  );
}

interface ProfileStepProps {
  age: string;
  setAge: (v: string) => void;
  income: string;
  setIncome: (v: string) => void;
  expense: string;
  setExpense: (v: string) => void;
  savings: string;
  setSavings: (v: string) => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
}

function ProfileStep({
  age,
  setAge,
  income,
  setIncome,
  expense,
  setExpense,
  savings,
  setSavings,
  onBack,
  onSkip,
  onContinue,
}: ProfileStepProps) {
  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="font-luxury text-2xl font-semibold text-slate-900 dark:text-white mb-1">
          Your Financial Profile
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Optional — helps us provide personalised financial health insights.
        </p>
      </div>

      <div className="space-y-4">
        <Field label="Age" value={age} onChange={setAge} placeholder="e.g. 30" />
        <Field
          label="Monthly Income (₹ INR)"
          value={income}
          onChange={setIncome}
          placeholder="e.g. 1,00,000"
        />
        <Field
          label="Avg. Monthly Family Expense (₹ INR)"
          value={expense}
          onChange={setExpense}
          placeholder="e.g. 50,000"
        />
        <Field
          label="Monthly Savings / Investments (₹ INR)"
          value={savings}
          onChange={setSavings}
          placeholder="e.g. 30,000"
        />
      </div>

      <StepNav onBack={onBack} onSkip={onSkip} onNext={onContinue} nextLabel="Continue" />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}

function AssetsStep({
  selected,
  setSelected,
  onBack,
  onSkip,
  onSave,
  onImportBroker,
}: {
  selected: string[];
  setSelected: (v: string[]) => void;
  onBack: () => void;
  onSkip: () => void;
  onSave: () => void;
  onImportBroker: () => void;
}) {
  const toggle = (key: string) => {
    setSelected(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="font-luxury text-2xl font-semibold text-slate-900 dark:text-white mb-1">
          Add your assets
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Import from your broker or add manually. You can always do this later.
        </p>
      </div>

      <button
        type="button"
        onClick={onImportBroker}
        className="w-full flex items-center gap-3 rounded-xl border border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/60 dark:bg-brand-900/20 p-4 text-left hover:bg-brand-50 dark:hover:bg-brand-900/30"
      >
        <span className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shrink-0">
          <Upload size={17} className="text-brand-600" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
            Import from Broker
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Upload a CSV/Excel export from your broker
          </span>
        </span>
        <ArrowRight size={16} className="text-brand-600 shrink-0" />
      </button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs text-slate-400">or add manually</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Asset Type</p>
      <div className="grid grid-cols-2 gap-3">
        {ASSET_TAXONOMY.map((cat) => {
          const isSelected = selected.includes(cat.key);
          const Icon = cat.icon;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => toggle(cat.key)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 text-center transition-colors ${
                isSelected
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Icon size={18} className="text-slate-600 dark:text-slate-300" />
              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{cat.label}</span>
              <span className="text-[11px] text-slate-400">
                {cat.types.length} {cat.types.length === 1 ? 'type' : 'types'}
              </span>
            </button>
          );
        })}
      </div>

      <StepNav onBack={onBack} onSkip={onSkip} onNext={onSave} nextLabel="Save" nextDisabled={selected.length === 0} />
    </div>
  );
}

function SecureStep({
  onBack,
  onSkip,
  onDone,
}: {
  onBack: () => void;
  onSkip: () => void;
  onDone: () => void;
}) {
  const { setPin } = useAppLockStore();
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  const savePin = () => {
    if (!/^\d{4}$/.test(pin)) {
      setPinError('PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setPinError('PINs do not match.');
      return;
    }
    setPin(pin);
    setPinModalOpen(false);
    onDone();
  };

  return (
    <div className="flex flex-col items-center text-center gap-5">
      <div className="w-16 h-16 rounded-full bg-brand-50 dark:bg-brand-900/40 flex items-center justify-center">
        <ShieldCheck size={26} className="text-brand-600" />
      </div>
      <div>
        <h2 className="font-luxury text-2xl font-semibold text-slate-900 dark:text-white mb-2">
          Secure Your App
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          Set a 4-digit PIN to lock the app when you're away. You can change or remove it anytime
          in Settings.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setPinModalOpen(true)}
        className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium"
      >
        <Lock size={16} />
        Set Up PIN
      </button>

      <StepNav onBack={onBack} onSkip={onSkip} />

      <Modal open={pinModalOpen} onClose={() => setPinModalOpen(false)} title="Set Up App Lock">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 text-center">
              4-digit PIN
            </label>
            <PinBoxInput value={pin} onChange={setPinInput} autoFocus />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 text-center">
              Confirm PIN
            </label>
            <PinBoxInput value={confirmPin} onChange={setConfirmPin} />
          </div>
          {pinError && <p className="text-xs text-red-500">{pinError}</p>}
          <button
            type="button"
            onClick={savePin}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-full text-sm font-medium"
          >
            Save PIN
          </button>
        </div>
      </Modal>
    </div>
  );
}

function StepNav({
  onBack,
  onSkip,
  onNext,
  nextLabel,
  nextDisabled,
}: {
  onBack: () => void;
  onSkip: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mt-6 w-full">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        Back
      </button>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Skip
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {nextLabel}
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
