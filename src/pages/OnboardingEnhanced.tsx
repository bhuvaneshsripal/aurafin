import { useState, useCallback, useMemo, memo } from 'react';
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
  Plus,
  Trash2,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAppLockStore } from '../store/appLockStore';
import { useAssetsStore } from '../store/assetsStore';
import { upsertDoc } from '../hooks/useFirestoreSync';
import { ASSET_TAXONOMY } from '../utils/taxonomy';
import Modal from '../components/Modal';
import PinBoxInput from '../components/PinBoxInput';
import {
  saveOnboardingCache,
  getOnboardingCache,
  clearOnboardingCache,
  updateCachedAssets,
  removeAssetFromCache,
} from '../utils/onboardingCache';
import type { Asset, AssetClass } from '../types';

const STEPS = ['welcome', 'profile', 'assets', 'secure'] as const;
type StepKey = (typeof STEPS)[number];

/**
 * Enhanced Onboarding with:
 * - Asset addition during setup
 * - Full data caching
 * - No loading on refresh
 * - Performance optimizations
 */
export default function OnboardingEnhanced() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);
  const { addOrUpdate } = useAssetsStore();

  // Load from cache if available
  const cachedData = useMemo(() => getOnboardingCache(), []);

  const [stepIndex, setStepIndex] = useState(0);
  const step: StepKey = STEPS[stepIndex];

  // Profile fields
  const [age, setAge] = useState(cachedData?.profile.age || '');
  const [income, setIncome] = useState(cachedData?.profile.income || '');
  const [expense, setExpense] = useState(cachedData?.profile.expense || '');
  const [savings, setSavings] = useState(cachedData?.profile.savings || '');

  // Assets state
  const [assets, setAssets] = useState<Asset[]>(cachedData?.assets || []);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>(
    cachedData?.selectedAssetTypes || []
  );

  // Add asset modal
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<AssetClass>('stock');
  const [assetValue, setAssetValue] = useState('');
  const [assetCurrency, setAssetCurrency] = useState('INR');

  const goTo = useCallback((i: number) => {
    const newIndex = Math.max(0, Math.min(STEPS.length - 1, i));
    setStepIndex(newIndex);
  }, []);

  const saveProfile = useCallback(async () => {
    if (!user) return;
    if (!age && !income && !expense && !savings) return;

    await upsertDoc(user, 'financialProfile', {
      id: 'profile',
      age: Number(age) || undefined,
      monthlyIncome: Number(income) || undefined,
      monthlyExpense: Number(expense) || undefined,
      monthlySavings: Number(savings) || undefined,
    });

    // Save to cache
    saveOnboardingCache({
      profile: { age, income, expense, savings },
      assets,
      selectedAssetTypes,
    });
  }, [user, age, income, expense, savings, assets, selectedAssetTypes]);

  const addAsset = useCallback(async () => {
    if (!assetName || !assetValue || !user) return;

    const newAsset: Asset = {
      id: `onboarding_${Date.now()}_${Math.random()}`,
      name: assetName,
      assetClass: assetType,
      value: Number(assetValue),
      currency: assetCurrency,
      updatedAt: Date.now(),
    };

    const updatedAssets = [...assets, newAsset];
    setAssets(updatedAssets);

    // Save to Firestore
    await upsertDoc(user, 'assets', newAsset);

    // Update cache
    updateCachedAssets(updatedAssets);

    // Add to store
    addOrUpdate(newAsset);

    // Reset form
    setAssetName('');
    setAssetValue('');
    setShowAddAsset(false);
  }, [assetName, assetValue, assetType, assetCurrency, assets, user, addOrUpdate]);

  const removeAsset = useCallback((id: string) => {
    const updatedAssets = assets.filter((a) => a.id !== id);
    setAssets(updatedAssets);
    removeAssetFromCache(id);
  }, [assets]);

  const finish = useCallback(() => {
    completeOnboarding();
    clearOnboardingCache();

    if (selectedAssetTypes[0]) {
      navigate('/wealth', { state: { startAddAsset: selectedAssetTypes[0] } });
    } else {
      navigate('/');
    }
  }, [completeOnboarding, selectedAssetTypes, navigate]);

  const skipAll = useCallback(() => {
    completeOnboarding();
    clearOnboardingCache();
    navigate('/');
  }, [completeOnboarding, navigate]);

  const goImport = useCallback(() => {
    completeOnboarding();
    navigate('/import');
  }, [completeOnboarding, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-100 dark:bg-slate-950 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="font-luxury text-4xl font-semibold text-slate-900 dark:text-white tracking-tight">
            Aurafin<span className="text-brand-500">.</span>
          </h1>
        </div>

        {/* Step Progress Indicator */}
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
          {step === 'welcome' && (
            <WelcomeStep onNext={() => goTo(1)} onSkipAll={skipAll} onBack={() => navigate(-1)} />
          )}

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
              onSkipAll={skipAll}
              onContinue={async () => {
                await saveProfile();
                goTo(2);
              }}
            />
          )}

          {step === 'assets' && (
            <AssetsStepEnhanced
              assets={assets}
              selectedAssetTypes={selectedAssetTypes}
              setSelectedAssetTypes={setSelectedAssetTypes}
              onBack={() => goTo(1)}
              onSkip={() => goTo(3)}
              onSkipAll={skipAll}
              onSave={() => goTo(3)}
              onImportBroker={goImport}
              onAddAsset={() => setShowAddAsset(true)}
              onRemoveAsset={removeAsset}
            />
          )}

          {step === 'secure' && (
            <SecureStep onBack={() => goTo(2)} onSkip={finish} onSkipAll={skipAll} onDone={finish} />
          )}
        </div>

        {/* Add Asset Modal */}
        {showAddAsset && (
          <AddAssetModal
            isOpen={showAddAsset}
            onClose={() => setShowAddAsset(false)}
            onAdd={addAsset}
            assetName={assetName}
            setAssetName={setAssetName}
            assetType={assetType}
            setAssetType={setAssetType}
            assetValue={assetValue}
            setAssetValue={setAssetValue}
            assetCurrency={assetCurrency}
            setAssetCurrency={setAssetCurrency}
          />
        )}
      </div>
    </div>
  );
}

// Memoized Components for Performance

const WelcomeStep = memo(
  ({
    onNext,
    onSkipAll,
    onBack,
  }: {
    onNext: () => void;
    onSkipAll: () => void;
    onBack: () => void;
  }) => {
    const user = useAuthStore((s) => s.user);
    const isGuest = (user as any)?.isAnonymous === true;

    return (
      <div className="flex flex-col items-center text-center gap-5">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center ${
            isGuest ? 'bg-orange-50 dark:bg-orange-900/40' : 'bg-brand-50 dark:bg-brand-900/40'
          }`}
        >
          <Sparkles size={26} className={isGuest ? 'text-orange-600' : 'text-brand-600'} />
        </div>
        <div>
          <h2 className="font-luxury text-2xl font-semibold text-slate-900 dark:text-white mb-2">
            {isGuest ? 'Guest Mode' : 'Welcome to Aurafin'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            {isGuest
              ? <>Explore <span className="font-luxury">Aurafin</span> with temporary guest access. Your data will be cleared when you log out. Create an account anytime to save your data permanently.</>
              : 'Your privacy-first net worth tracker. Your data lives in your own account — no ads, no selling your data. Just you and your numbers.'}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full">
          <FeatureBox icon={Coins} label="Track assets & liabilities" />
          <FeatureBox icon={Globe2} label="Multi-currency support" />
          <FeatureBox icon={BadgeCheck} label={isGuest ? 'Try it free' : 'Private & secure'} />
        </div>

        {isGuest && (
          <div className="w-full p-3 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 rounded-lg">
            <p className="text-xs text-orange-800 dark:text-orange-200">
              💡 <strong>Guest Tip:</strong> Your data won't be saved after you log out. Sign up with email to keep your data.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between mt-6 w-full">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              ← Back
            </button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSkipAll}
              className="border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Skip All
            </button>
            <button
              type="button"
              onClick={onNext}
              className={`flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-medium text-white ${
                isGuest
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-brand-600 hover:bg-brand-700'
              }`}
            >
              Get Started
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }
);
WelcomeStep.displayName = 'WelcomeStep';

const FeatureBox = memo(
  ({ icon: Icon, label }: { icon: typeof Coins; label: string }) => (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <Icon size={18} className="text-brand-600" />
      <span className="text-[11px] leading-tight text-slate-600 dark:text-slate-300">{label}</span>
    </div>
  )
);
FeatureBox.displayName = 'FeatureBox';

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
  onSkipAll: () => void;
  onContinue: () => void;
}

const ProfileStep = memo((props: ProfileStepProps) => {
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
        <Field label="Age" value={props.age} onChange={props.setAge} placeholder="e.g. 30" />
        <Field
          label="Monthly Income (₹ INR)"
          value={props.income}
          onChange={props.setIncome}
          placeholder="e.g. 1,00,000"
        />
        <Field
          label="Avg. Monthly Family Expense (₹ INR)"
          value={props.expense}
          onChange={props.setExpense}
          placeholder="e.g. 50,000"
        />
        <Field
          label="Monthly Savings / Investments (₹ INR)"
          value={props.savings}
          onChange={props.setSavings}
          placeholder="e.g. 30,000"
        />
      </div>

      <StepNav
        onBack={props.onBack}
        onSkip={props.onSkip}
        onSkipAll={props.onSkipAll}
        onNext={props.onContinue}
        nextLabel="Continue"
      />
    </div>
  );
});
ProfileStep.displayName = 'ProfileStep';

const Field = memo(
  ({
    label,
    value,
    onChange,
    placeholder,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
  }) => (
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
  )
);
Field.displayName = 'Field';

interface AssetsStepEnhancedProps {
  assets: Asset[];
  selectedAssetTypes: string[];
  setSelectedAssetTypes: (v: string[]) => void;
  onBack: () => void;
  onSkip: () => void;
  onSkipAll: () => void;
  onSave: () => void;
  onImportBroker: () => void;
  onAddAsset: () => void;
  onRemoveAsset: (id: string) => void;
}

const AssetsStepEnhanced = memo((props: AssetsStepEnhancedProps) => {
  const toggle = useCallback(
    (key: string) => {
      props.setSelectedAssetTypes(
        props.selectedAssetTypes.includes(key)
          ? props.selectedAssetTypes.filter((k) => k !== key)
          : [...props.selectedAssetTypes, key]
      );
    },
    [props.selectedAssetTypes, props.setSelectedAssetTypes]
  );

  const totalAssetValue = useMemo(
    () => props.assets.reduce((sum, a) => sum + a.value, 0),
    [props.assets]
  );

  return (
    <div>
      <div className="text-center mb-6">
        <h2 className="font-luxury text-2xl font-semibold text-slate-900 dark:text-white mb-1">
          Add Your Assets
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Import from broker or add manually. You can always do this later.
        </p>
      </div>

      <button
        type="button"
        onClick={props.onImportBroker}
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
            Upload a CSV/Excel export
          </span>
        </span>
        <ArrowRight size={16} className="text-brand-600 shrink-0" />
      </button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
        <span className="text-xs text-slate-400">or add manually</span>
        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
      </div>

      {/* Added Assets List */}
      {props.assets.length > 0 && (
        <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Added Assets ({props.assets.length})
            </h3>
            <span className="text-sm font-medium text-brand-600">
              ₹{totalAssetValue.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="space-y-2">
            {props.assets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between p-2 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{asset.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{asset.assetClass}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    ₹{asset.value.toLocaleString('en-IN')}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Remove this asset?')) props.onRemoveAsset(asset.id);
                    }}
                    className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Asset Button */}
      <button
        type="button"
        onClick={props.onAddAsset}
        className="w-full flex items-center justify-center gap-2 p-3 mb-6 border border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Plus size={16} />
        Add Asset Manually
      </button>

      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Asset Types to Track</p>
      <div className="grid grid-cols-2 gap-3">
        {ASSET_TAXONOMY.map((cat) => {
          const isSelected = props.selectedAssetTypes.includes(cat.key);
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

      <StepNav
        onBack={props.onBack}
        onSkip={props.onSkip}
        onSkipAll={props.onSkipAll}
        onNext={props.onSave}
        nextLabel="Save"
        nextDisabled={props.selectedAssetTypes.length === 0}
      />
    </div>
  );
});
AssetsStepEnhanced.displayName = 'AssetsStepEnhanced';

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: () => void;
  assetName: string;
  setAssetName: (v: string) => void;
  assetType: AssetClass;
  setAssetType: (v: AssetClass) => void;
  assetValue: string;
  setAssetValue: (v: string) => void;
  assetCurrency: string;
  setAssetCurrency: (v: string) => void;
}

const AddAssetModal = memo((props: AddAssetModalProps) => (
  <Modal open={props.isOpen} onClose={props.onClose} title="Add Asset">
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Asset Name</label>
        <input
          type="text"
          value={props.assetName}
          onChange={(e) => props.setAssetName(e.target.value)}
          placeholder="e.g., Reliance Stock, Bank FD"
          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Asset Type</label>
        <select
          value={props.assetType}
          onChange={(e) => props.setAssetType(e.target.value as AssetClass)}
          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="stock">Stock</option>
          <option value="fixed_deposit">Fixed Deposit</option>
          <option value="gold">Gold</option>
          <option value="cash">Cash</option>
          <option value="crypto_coin">Cryptocurrency</option>
          <option value="residential_property">Property</option>
        </select>
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Value</label>
        <input
          type="number"
          inputMode="decimal"
          value={props.assetValue}
          onChange={(e) => props.setAssetValue(e.target.value)}
          placeholder="0.00"
          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2">Currency</label>
        <select
          value={props.assetCurrency}
          onChange={(e) => props.setAssetCurrency(e.target.value)}
          className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="INR">INR (₹)</option>
          <option value="USD">USD ($)</option>
          <option value="EUR">EUR (€)</option>
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={props.onClose}
          className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onAdd}
          disabled={!props.assetName || !props.assetValue}
          className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white py-2 rounded-lg text-sm font-medium"
        >
          Add Asset
        </button>
      </div>
    </div>
  </Modal>
));
AddAssetModal.displayName = 'AddAssetModal';

interface SecureStepProps {
  onBack: () => void;
  onSkip: () => void;
  onSkipAll: () => void;
  onDone: () => void;
}

const SecureStep = memo((props: SecureStepProps) => {
  const { setPin } = useAppLockStore();
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pin, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  const savePin = useCallback(() => {
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

    // Save to cache
    saveOnboardingCache({ pinSet: true });

    props.onDone();
  }, [pin, confirmPin, setPin, props]);

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

      <StepNav onBack={props.onBack} onSkip={props.onSkip} onSkipAll={props.onSkipAll} />

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
});
SecureStep.displayName = 'SecureStep';

interface StepNavProps {
  onBack: () => void;
  onSkip: () => void;
  onSkipAll: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}

const StepNav = memo((props: StepNavProps) => (
  <div>
    <div className="flex items-center justify-between mt-6 w-full">
      <button
        type="button"
        onClick={props.onBack}
        className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      >
        ← Back
      </button>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={props.onSkip}
          className="border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={props.onSkipAll}
          className="border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Skip All
        </button>
        {props.onNext && (
          <button
            type="button"
            onClick={props.onNext}
            disabled={props.nextDisabled}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {props.nextLabel || 'Continue'}
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  </div>
));
StepNav.displayName = 'StepNav';
