import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, TrendingUp, CreditCard, Target, ArrowLeftRight } from 'lucide-react';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useGoalsStore } from '../store/goalsStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useUiStore } from '../store/uiStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { resolveAssetValues } from '../utils/assetValues';
import { ASSET_CLASS_LABELS, maskPreciseAmount } from '../utils/currency';

const MAX_PER_GROUP = 5;

/**
 * Global "Search Aurafin..." — searches everything the person has actually
 * entered (holdings, liabilities, goals, transactions) rather than app
 * navigation/menu items, since that's what's genuinely hard to relocate
 * once you have a few dozen of them. Opens from the search icon in the
 * Topbar; picking a result jumps straight to the right tab (and, for
 * holdings, pre-fills the Assets table's own search box via ?q=).
 */
export default function GlobalSearch({ variant = 'icon' }: { variant?: 'icon' | 'full' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const allAssets = useAssetsStore((s) => s.assets);
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const allGoals = useGoalsStore((s) => s.goals);
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const goldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);

  const assets = activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets;
  const liabilities = activeProfileId
    ? allLiabilities.filter((l) => l.profileId === activeProfileId)
    : allLiabilities;
  const goals = activeProfileId ? allGoals.filter((g) => g.profileId === activeProfileId) : allGoals;
  const transactions = activeProfileId
    ? allTransactions.filter((t) => t.profileId === activeProfileId)
    : allTransactions;

  useEffect(() => {
    if (open) {
      // Let the panel mount/animate in before stealing focus.
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  const q = query.trim().toLowerCase();

  const assetMatches = useMemo(
    () =>
      q
        ? assets
            .filter((a) => a.name.toLowerCase().includes(q) || (a.symbol ?? '').toLowerCase().includes(q))
            .slice(0, MAX_PER_GROUP)
        : [],
    [assets, q]
  );
  const liabilityMatches = useMemo(
    () => (q ? liabilities.filter((l) => l.name.toLowerCase().includes(q)).slice(0, MAX_PER_GROUP) : []),
    [liabilities, q]
  );
  const goalMatches = useMemo(
    () => (q ? goals.filter((g) => g.name.toLowerCase().includes(q)).slice(0, MAX_PER_GROUP) : []),
    [goals, q]
  );
  const transactionMatches = useMemo(
    () =>
      q
        ? transactions
            .filter((t) => t.category.toLowerCase().includes(q) || (t.note ?? '').toLowerCase().includes(q))
            .slice(0, MAX_PER_GROUP)
        : [],
    [transactions, q]
  );

  const totalMatches =
    assetMatches.length + liabilityMatches.length + goalMatches.length + transactionMatches.length;

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      {variant === 'full' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Search Aurafin"
          aria-label="Search Aurafin"
          className="tap-scale flex items-center gap-2.5 h-10 w-full max-w-md rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3.5 text-left text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-colors shrink-0"
        >
          <Search size={18} className="shrink-0" />
          <span className="text-sm font-medium truncate">Search Aurafin...</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Search Aurafin"
          aria-label="Search Aurafin"
          className="tap-scale h-10 w-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
        >
          <Search size={20} />
        </button>
      )}

      {open && (
        <div className="animate-backdrop-in fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-[2px] px-4 pt-[10vh] sm:pt-24 flex justify-center">
          <div
            ref={containerRef}
            className="animate-menu-in w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden h-fit max-h-[70vh] flex flex-col"
            style={{ transformOrigin: 'top center' }}
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <Search size={18} className="text-brand-500 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Aurafin..."
                className="flex-1 min-w-0 bg-transparent text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:font-medium focus:outline-none"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="tap-scale h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  <X size={14} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="hidden sm:flex tap-scale h-7 items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 px-2 text-[11px] font-medium text-slate-400 shrink-0"
              >
                Esc
              </button>
            </div>

            <div className="overflow-y-auto">
              {!q ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  Search your holdings, liabilities, goals and transactions.
                </div>
              ) : totalMatches === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  No results for <span className="font-medium text-slate-500 dark:text-slate-300">“{query}”</span>
                </div>
              ) : (
                <div className="py-2">
                  {assetMatches.length > 0 && (
                    <ResultGroup label="Holdings" icon={TrendingUp} iconColor="text-brand-600">
                      {assetMatches.map((a) => {
                        const { value } = resolveAssetValues(a, livePrices, sipValues, goldPricePerGram);
                        return (
                          <ResultRow
                            key={a.id}
                            title={a.name}
                            subtitle={ASSET_CLASS_LABELS[a.assetClass] ?? a.assetClass}
                            trailing={maskPreciseAmount(value, a.currency, privacyMode)}
                            onClick={() => goTo(`/wealth?tab=assets&q=${encodeURIComponent(a.name)}`)}
                          />
                        );
                      })}
                    </ResultGroup>
                  )}

                  {liabilityMatches.length > 0 && (
                    <ResultGroup label="Liabilities" icon={CreditCard} iconColor="text-red-500">
                      {liabilityMatches.map((l) => (
                        <ResultRow
                          key={l.id}
                          title={l.name}
                          subtitle="Liability"
                          trailing={maskPreciseAmount(l.outstanding, l.currency, privacyMode)}
                          onClick={() => goTo('/wealth?tab=liabilities')}
                        />
                      ))}
                    </ResultGroup>
                  )}

                  {goalMatches.length > 0 && (
                    <ResultGroup label="Goals" icon={Target} iconColor="text-orange-500">
                      {goalMatches.map((g) => (
                        <ResultRow
                          key={g.id}
                          title={g.name}
                          subtitle="Goal"
                          trailing={maskPreciseAmount(g.targetAmount, g.currency, privacyMode)}
                          onClick={() => goTo('/essentials?tab=goals')}
                        />
                      ))}
                    </ResultGroup>
                  )}

                  {transactionMatches.length > 0 && (
                    <ResultGroup label="Transactions" icon={ArrowLeftRight} iconColor="text-violet-500">
                      {transactionMatches.map((t) => (
                        <ResultRow
                          key={t.id}
                          title={t.note?.trim() || t.category}
                          subtitle={`${t.category} · ${t.date}`}
                          trailing={`${t.type === 'expense' ? '-' : '+'}${maskPreciseAmount(t.amount, t.currency, privacyMode)}`}
                          trailingColor={t.type === 'expense' ? 'text-red-500' : 'text-emerald-600'}
                          onClick={() => goTo('/transactions?tab=transactions')}
                        />
                      ))}
                    </ResultGroup>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({
  label,
  icon: Icon,
  iconColor,
  children,
}: {
  label: string;
  icon: typeof TrendingUp;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 py-1.5">
      <p className="px-2.5 pb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
        <Icon size={12} className={iconColor} />
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({
  title,
  subtitle,
  trailing,
  trailingColor = 'text-slate-500 dark:text-slate-400',
  onClick,
}: {
  title: string;
  subtitle: string;
  trailing: string;
  trailingColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate uppercase">
          {title}
        </span>
        <span className="block text-xs text-slate-400 truncate normal-case">{subtitle}</span>
      </span>
      <span className={`text-sm font-medium shrink-0 ${trailingColor}`}>{trailing}</span>
    </button>
  );
}
