import { useState } from 'react';
import {
  Plus,
  X,
  ArrowUpRight,
  ArrowDownRight,
  ArrowLeftRight,
  Layers,
  Landmark,
  Camera,
} from 'lucide-react';

export type AddMenuType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'asset'
  | 'liability'
  | 'snapshot';

type MenuItem = {
  key: AddMenuType;
  label: string;
  icon: typeof ArrowUpRight;
  iconClass: string;
};

/**
 * Floating "+" action button that expands into a single grouped card —
 * matching the reference design: a "CASHFLOW" section (Expense / Income /
 * Transfer) and a "WEALTH" section (Asset / Liability / Snapshot), each with
 * an uppercase gray section header, a plain icon + label row per item, and a
 * divider between the two groups. The "+" itself turns into a solid green
 * "X" in place while the card is open.
 *
 * This is a standalone drop-in component. Find wherever your current add
 * menu renders (likely your Overview page or a shared Layout/BottomNav
 * file) and swap that component for this one, passing an `onSelect` that
 * routes to your existing add-expense / add-income / add-transfer /
 * add-asset / add-liability / add-snapshot flows.
 */
export default function AddMenuFab({ onSelect }: { onSelect: (type: AddMenuType) => void }) {
  const [open, setOpen] = useState(false);

  const cashflowItems: MenuItem[] = [
    { key: 'expense', label: 'Expense', icon: ArrowUpRight, iconClass: 'text-orange-500' },
    { key: 'income', label: 'Income', icon: ArrowDownRight, iconClass: 'text-emerald-700' },
    { key: 'transfer', label: 'Transfer', icon: ArrowLeftRight, iconClass: 'text-sky-500' },
  ];

  const wealthItems: MenuItem[] = [
    { key: 'asset', label: 'Asset', icon: Layers, iconClass: 'text-teal-500' },
    { key: 'liability', label: 'Liability', icon: Landmark, iconClass: 'text-red-500' },
    { key: 'snapshot', label: 'Snapshot', icon: Camera, iconClass: 'text-slate-500' },
  ];

  const renderGroup = (title: string, items: MenuItem[]) => (
    <div className="py-2">
      <p className="px-5 pb-1 text-xs font-semibold tracking-wide text-slate-400">
        {title}
      </p>
      {items.map(({ key, label, icon: Icon, iconClass }) => (
        <button
          key={key}
          onClick={() => {
            setOpen(false);
            onSelect(key);
          }}
          className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-slate-50"
        >
          <Icon size={18} className={iconClass} />
          <span className="text-base text-slate-800">{label}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/20 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="fixed bottom-24 right-5 z-50 flex flex-col items-end gap-3">
        {open && (
          <div className="w-64 rounded-2xl bg-white shadow-xl overflow-hidden">
            {renderGroup('CASHFLOW', cashflowItems)}
            <div className="border-t border-slate-100" />
            {renderGroup('WEALTH', wealthItems)}
          </div>
        )}

        <button
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close add menu' : 'Add'}
          className="h-14 w-14 rounded-full bg-brand-600 hover:bg-brand-700 text-white flex items-center justify-center shadow-lg"
        >
          {open ? <X size={24} /> : <Plus size={26} />}
        </button>
      </div>
    </>
  );
}
