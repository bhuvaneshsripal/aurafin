import { SHORTCUT_HINT } from '../config/shortcuts';
import { toast } from '../store/toastStore';
import { useEffect, useRef, useState } from 'react';
import { hideNumber } from '../utils/privateFormat';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  Coins,
  Landmark,
  Camera,
  ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useSnapshotsStore } from '../store/snapshotsStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { upsertDoc } from '../hooks/useFirestoreSync';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { buttonClasses, DateInput, inputClasses } from './ui';
import Modal from './Modal';
import type { Asset, Snapshot, Transaction, TransactionType } from '../types';
import CurrencySelect from './CurrencySelect';
import CustomSelect from './CustomSelect';
import { toIsoDate } from '../utils/date';

/** Actions shown in the fan, left to right along the arc. */
/** Half-width and (max) height of the arc, which is an ellipse so it spreads across the screen. */
const FAN_RX = 135;
const FAN_RY_MAX = 240;
const FAN_ITEMS: { action: Exclude<QuickAction, null>; label: string; icon: typeof Plus }[] = [
  { action: 'expense', label: 'Expense', icon: ArrowUpRight },
  { action: 'income', label: 'Income', icon: ArrowDownLeft },
  { action: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  { action: 'asset', label: 'Asset', icon: Coins },
  { action: 'liability', label: 'Liability', icon: Landmark },
  { action: 'snapshot', label: 'Snapshot', icon: Camera },
];

type QuickAction = 'expense' | 'income' | 'transfer' | 'asset' | 'liability' | 'snapshot' | null;

export default function QuickAddMenu({ variant = 'desktop' }: { variant?: 'desktop' | 'fab' | 'center' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState<QuickAction>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Keyboard shortcut (desktop): Ctrl+A (Cmd+A on Mac) opens the Add Asset
  // page. It leaves the normal "Select all" alone while typing in a field or
  // while a dialog is open, so copying text out of inputs still works.
  useEffect(() => {
    if (variant !== 'desktop') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.shiftKey || e.altKey) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setMenuOpen(false);
      navigate('/wealth?add=1&entry=asset&step=category');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [variant, navigate]);

  // Locks background scroll while the pill/dropdown menu is open — its
  // backdrop (fab variant) or the page behind it (desktop variant) would
  // otherwise keep scrolling underneath the open menu.
  useBodyScrollLock(menuOpen);

  const open = (action: QuickAction) => {
    // Asset and Liability get the full Wealth page add flow (category ->
    // type -> details, with all the class-specific fields like symbol,
    // quantity, avg cost, institution, etc.) instead of the stripped-down
    // quick-add form, so people get the same complete experience from
    // anywhere in the app.
    if (action === 'asset' || action === 'liability') {
      setMenuOpen(false);
      navigate(`/wealth?add=1&entry=${action}&step=category`);
      return;
    }
    setActive(action);
    setMenuOpen(false);
  };

  // 'center' is the raised + in the middle of the bottom nav: same mobile FAB, but its menu opens centred above it.
  const isCenter = variant === 'center';
  const isFab = variant === 'fab' || isCenter;

  return (
    <>
      <div className={isFab ? 'relative' : 'relative'} ref={ref}>
        {menuOpen && isFab && (
          <div
            className={`fixed inset-0 z-20 ${isCenter ? 'fan-backdrop' : 'bg-slate-900/30'}`}
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
        )}

        <button
          onClick={() => setMenuOpen((o) => !o)}
          // The centre "+" shrinks with the bottom bar (--p is set by BottomNav).
          style={isCenter ? { width: 'calc(52px - 4px * var(--p, 0))', height: 'calc(52px - 4px * var(--p, 0))' } : undefined}
          aria-label="Quick add"
          title={isFab ? 'Quick add' : `Quick add (${SHORTCUT_HINT.addAsset} adds an asset)`}
          className={
            isFab
              ? `fab-button${menuOpen ? ' fab-open' : ''} tap-scale relative z-30 flex items-center justify-center text-white ${isCenter ? '' : 'h-14 w-14'}`
              : buttonClasses('primary', 'md', 'pl-3 pr-3')
          }
        >
          {isFab ? <Plus size={24} className="fab-icon" /> : (
            <>
              <Plus size={16} /> Add <ChevronDown size={15} className="opacity-80" />
            </>
          )}
        </button>

        {menuOpen && isCenter && (
          // Fan: round action buttons spread in an arc around the centre "+".
          <div className="absolute left-1/2 top-1/2 z-30 h-0 w-0">
            {FAN_ITEMS.map(({ action, label, icon: Icon }, i) => {
              // Six buttons, 30° apart, symmetric around the top (165°…15°).
              const angle = ((165 - i * 30) * Math.PI) / 180;
              const ry = Math.min(FAN_RY_MAX, window.innerHeight * 0.32);
              const x = Math.cos(angle) * FAN_RX;
              const y = -Math.sin(angle) * ry;
              return (
                <button
                  key={action}
                  onClick={() => open(action)}
                  aria-label={label}
                  style={
                    {
                      '--fx': `${x.toFixed(1)}px`,
                      '--fy': `${y.toFixed(1)}px`,
                      transform: 'translate(calc(-50% + var(--fx)), calc(-50% + var(--fy)))',
                      animationDelay: `${i * 25}ms`,
                    } as React.CSSProperties
                  }
                  className="animate-fan-in keep-round tap-scale absolute left-0 top-0 flex h-[62px] w-[62px] flex-col items-center justify-center gap-0.5 rounded-full border border-line bg-surface text-[10px] font-medium text-ink shadow-lg"
                >
                  <Icon size={18} className="text-muted" />
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {menuOpen && isFab && !isCenter && (
          <div
            className="absolute bottom-full right-0 mb-3 flex flex-col items-end gap-2 z-30"
            style={{ transformOrigin: 'bottom right' }}
          >
            <PillItem delay={5} icon={ArrowUpRight} color="text-muted" label="Expense" onClick={() => open('expense')} />
            <PillItem delay={4} icon={ArrowDownLeft} color="text-muted" label="Income" onClick={() => open('income')} />
            <PillItem delay={3} icon={ArrowLeftRight} color="text-muted" label="Transfer" onClick={() => open('transfer')} />
            <PillItem delay={2} icon={Coins} color="text-muted" label="Asset" onClick={() => open('asset')} />
            <PillItem delay={1} icon={Landmark} color="text-muted" label="Liability" onClick={() => open('liability')} />
            <PillItem delay={0} icon={Camera} color="text-muted" label="Snapshot" onClick={() => open('snapshot')} />
          </div>
        )}

        {menuOpen && !isFab && (
          <div className="animate-menu-in absolute right-0 mt-2 w-60 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-30 pb-1">
            <p className="px-4 pt-3 pb-1 text-xs font-medium text-faint">
              Cashflow
            </p>
            <MenuItem icon={ArrowDownLeft} color="text-muted" label="Expense" onClick={() => open('expense')} />
            <MenuItem icon={ArrowUpRight} color="text-muted" label="Income" onClick={() => open('income')} />
            <MenuItem icon={ArrowLeftRight} color="text-muted" label="Transfer" onClick={() => open('transfer')} />

            <div className="border-t border-line-soft mt-1" />
            <p className="px-4 pt-3 pb-1 text-xs font-medium text-faint">
              Wealth
            </p>
            <MenuItem icon={Coins} color="text-muted" label="Asset" hint={SHORTCUT_HINT.addAsset} onClick={() => open('asset')} />
            <MenuItem icon={Landmark} color="text-muted" label="Liability" onClick={() => open('liability')} />
            <MenuItem icon={Camera} color="text-muted" label="Snapshot" onClick={() => open('snapshot')} />
          </div>
        )}
      </div>

      <Modal open={active === 'expense'} onClose={() => setActive(null)} title="Add Expense">
        <TransactionForm type="expense" onDone={() => setActive(null)} />
      </Modal>
      <Modal open={active === 'income'} onClose={() => setActive(null)} title="Add Income">
        <TransactionForm type="income" onDone={() => setActive(null)} />
      </Modal>
      <Modal open={active === 'transfer'} onClose={() => setActive(null)} title="Record Transfer">
        <TransferForm onDone={() => setActive(null)} />
      </Modal>
      <Modal open={active === 'snapshot'} onClose={() => setActive(null)} title="Save Net Worth Snapshot">
        <SnapshotForm onDone={() => setActive(null)} />
      </Modal>
    </>
  );
}

/** Individual floating pill button used by the mobile FAB's expanded menu —
 *  each action gets its own rounded-full white pill (icon + label) stacked
 *  above the FAB, rather than one dropdown card. */
function PillItem({
  icon: Icon,
  color,
  label,
  onClick,
  delay = 0,
}: {
  icon: typeof Plus;
  color: string;
  label: string;
  onClick: () => void;
  delay?: number;
}) {
  return (
    <button
      onClick={onClick}
      style={{ animationDelay: `${delay * 30}ms` }}
      className="animate-pill-in tap-scale flex items-center gap-2 border border-line bg-surface pl-3 pr-4 py-2 shadow-lg text-sm font-medium text-ink whitespace-nowrap"
    >
      <Icon size={15} className={color} />
      {label}
    </button>
  );
}

function MenuItem({
  icon: Icon,
  color,
  label,
  hint,
  onClick,
}: {
  icon: typeof Plus;
  color: string;
  label: string;
  /** Shortcut shown on the right, e.g. "Ctrl+A". */
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="menu-row-3d w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-ink-2 hover:bg-surface-hover"
    >
      <Icon size={18} className={color} />
      {label}
      {hint && <span className="ml-auto text-xs font-normal text-faint">{hint}</span>}
    </button>
  );
}

const inputClass = inputClasses;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function TransactionForm({ type, onDone }: { type: TransactionType; onDone: () => void }) {
  const user = useAuthStore((s) => s.user);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [date, setDate] = useState(toIsoDate());
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !user) return;
    const value = Number(amount);
    if (!category.trim()) {
      toast.error('Enter a category.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter an amount greater than 0.');
      return;
    }
    setBusy(true);
    try {
      const t: Transaction = {
        id: crypto.randomUUID(),
        type,
        category: category.trim(),
        amount: value,
        currency,
        date,
        // Same as the Money page's own Add form: file it under the profile
        // that's currently selected. Without this the record had no owner and
        // was hidden from every profile-specific view (Money, Overview...).
        profileId: activeProfileId ?? undefined,
      };
      await upsertDoc(user, 'transactions', t);
      onDone();
    } catch {
      toast.error('Could not save this. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Category">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
          placeholder={type === 'income' ? 'e.g. Salary' : 'e.g. Rent, Groceries'}
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
      <button onClick={submit} disabled={busy} className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors w-full bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60 disabled:cursor-not-allowed">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function TransferForm({ onDone }: { onDone: () => void }) {
  const user = useAuthStore((s) => s.user);
  const assets = useAssetsStore((s) => s.assets);
  const [fromId, setFromId] = useState(assets[0]?.id ?? '');
  const [toId, setToId] = useState(assets[1]?.id ?? assets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  if (assets.length < 2) {
    return (
      <p className="text-sm text-slate-500">
        Add at least two assets in Wealth before recording a transfer between them.
      </p>
    );
  }

  const submit = async () => {
    if (busy || !user) return;
    const value = Number(amount);
    const from = assets.find((a) => a.id === fromId);
    const to = assets.find((a) => a.id === toId);
    if (!from || !to) {
      toast.error('Pick both accounts.');
      return;
    }
    if (fromId === toId) {
      toast.error('Choose two different assets to transfer between.');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter an amount greater than 0.');
      return;
    }
    // Otherwise the source would clamp to 0 while the destination still gained
    // the full amount — creating money out of nothing.
    if (value > from.value) {
      toast.error(`That's more than the balance in ${from.name}.`);
      return;
    }
    if ((from.currency ?? 'INR') !== (to.currency ?? 'INR')) {
      toast.error('Transfers between assets in different currencies aren\u2019t supported here.');
      return;
    }
    setBusy(true);
    try {
      const updatedFrom: Asset = { ...from, value: from.value - value, updatedAt: Date.now() };
      const updatedTo: Asset = { ...to, value: to.value + value, updatedAt: Date.now() };
      await upsertDoc(user, 'assets', updatedFrom);
      await upsertDoc(user, 'assets', updatedTo);
      onDone();
    } catch {
      toast.error('Could not complete the transfer. Please check your balances and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="From">
        <CustomSelect
          value={fromId}
          onChange={setFromId}
          className={inputClass}
          options={assets.map((a) => ({ value: a.id, label: a.name.toUpperCase() }))}
        />
      </Field>
      <Field label="To">
        <CustomSelect
          value={toId}
          onChange={setToId}
          className={inputClass}
          options={assets.map((a) => ({ value: a.id, label: a.name.toUpperCase() }))}
        />
      </Field>
      <Field label="Amount">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} placeholder="0" />
      </Field>
      <button onClick={submit} disabled={busy} className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors w-full bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-60 disabled:cursor-not-allowed">
        {busy ? 'Recording…' : 'Record Transfer'}
      </button>
    </div>
  );
}

function SnapshotForm({ onDone }: { onDone: () => void }) {
  const user = useAuthStore((s) => s.user);
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const snapshots = useSnapshotsStore((s) => s.snapshots);
  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  const today = toIsoDate();
  // Reuse today's snapshot if one was already saved today, instead of
  // adding another point on the same date — two+ snapshots sharing a date
  // squash the Overview chart's x-axis (every tick reads the same day) and
  // draw a misleading near-vertical jump between them.
  const todaysSnapshot = snapshots.find((s) => s.date === today);

  const submit = async () => {
    if (!user) return;
    const snapshot: Snapshot = {
      id: todaysSnapshot?.id ?? crypto.randomUUID(),
      date: today,
      netWorth,
      totalAssets,
      totalLiabilities,
    };
    await upsertDoc(user, 'snapshots', snapshot);
    onDone();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {todaysSnapshot
          ? "This updates today's snapshot with your current net worth."
          : "This saves today's net worth so you can track how it changes over time on your Overview chart."}
      </p>
      <div className="bg-slate-50 dark:bg-slate-700 rounded-lg p-4 text-sm space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Total Assets</span>
          <span className="font-medium text-ink">{hideNumber(totalAssets.toLocaleString(undefined, { useGrouping: true }))}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Total Liabilities</span>
          <span className="font-medium text-ink">{hideNumber(totalLiabilities.toLocaleString(undefined, { useGrouping: true }))}</span>
        </div>
        <div className="flex justify-between border-t border-slate-200 dark:border-slate-600 pt-1 mt-1">
          <span className="text-slate-500">Net Worth</span>
          <span className="font-semibold text-ink">{hideNumber(netWorth.toLocaleString(undefined, { useGrouping: true }))}</span>
        </div>
      </div>
      <button onClick={submit} className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors w-full bg-brand-600 hover:bg-brand-700 text-white">
        Save Snapshot
      </button>
    </div>
  );
}
