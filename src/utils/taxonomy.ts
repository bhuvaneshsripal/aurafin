import {
  TrendingUp,
  Landmark,
  Home,
  Coins,
  Wallet,
  Bitcoin,
  Layers,
  MoreHorizontal,
  Banknote,
  CreditCard,
  PiggyBank,
  Briefcase,
  FileText,
  Car,
  GraduationCap,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { AssetClass, LiabilityClass } from '../types';

export interface TypeOption<T extends string> {
  value: T;
  label: string;
  /** Extra search terms this type should also match, beyond its own label (e.g. "stock" also finds "International Equity"). */
  keywords?: string[];
}

export interface TypeGroup<T extends string> {
  label: string;
  /** The type this group opens the details form with by default. */
  defaultValue: T;
}

export interface CategoryDef<T extends string> {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  /** When there's exactly one type, Step 2 skips the subtype picker and goes straight to the form. */
  types: TypeOption<T>[];
  /** Optional: show these grouped tiles on the type-picker screen instead of
   *  one tile per raw type (e.g. Commodities groups Gold/Silver/Platinum
   *  under one "Physical Gold / Silver" tile). The full `types` list is
   *  still used everywhere else (the in-form Type dropdown, labels, etc). */
  groups?: TypeGroup<T>[];
}

export const ASSET_TAXONOMY: CategoryDef<AssetClass>[] = [
  {
    key: 'equity',
    label: 'Equity',
    icon: TrendingUp,
    color: '#16a35d',
    types: [
      { value: 'stock', label: 'Direct Stock', keywords: ['stock', 'share', 'equity'] },
      { value: 'etf', label: 'ETF', keywords: ['stock', 'fund'] },
      { value: 'equity_mutual_fund', label: 'Equity Mutual Fund', keywords: ['mf', 'fund', 'stock'] },
      { value: 'index_fund', label: 'Index Fund', keywords: ['stock', 'fund', 'mf'] },
      { value: 'hybrid_mutual_fund', label: 'Hybrid Mutual Fund', keywords: ['mf', 'fund'] },
      { value: 'sip', label: 'SIP', keywords: ['mutual fund', 'fund', 'systematic'] },
      { value: 'international_equity', label: 'International Equity', keywords: ['stock', 'foreign', 'us stock'] },
      { value: 'ipo_pre_ipo', label: 'IPO / Pre-IPO', keywords: ['stock'] },
      { value: 'esop_rsu', label: 'ESOPs / RSUs', keywords: ['stock', 'employee'] },
      { value: 'equity_other', label: 'Other Equity', keywords: ['stock'] },
    ],
  },
  {
    key: 'debt',
    label: 'Debt',
    icon: Landmark,
    color: '#3b82f6',
    types: [
      { value: 'fixed_deposit', label: 'Fixed Deposit' },
      { value: 'recurring_deposit', label: 'Recurring Deposit' },
      { value: 'ppf', label: 'PPF' },
      { value: 'epf', label: 'EPF' },
      { value: 'vpf', label: 'VPF' },
      { value: 'nps', label: 'NPS' },
      { value: 'government_bond', label: 'Government Bond' },
      { value: 'corporate_bond', label: 'Corporate Bond' },
      { value: 'sovereign_gold_bond', label: 'Sovereign Gold Bond', keywords: ['gold', 'sgb'] },
      { value: 'debt_mutual_fund', label: 'Debt Mutual Fund', keywords: ['fund', 'mf'] },
      { value: 'treasury_bill', label: 'Treasury Bill' },
      { value: 'nsc', label: 'NSC' },
      { value: 'kvp', label: 'KVP' },
      { value: 'scss', label: 'SCSS' },
      { value: 'sukanya_samriddhi', label: 'Sukanya Samriddhi Yojana' },
      { value: 'post_office_td', label: 'Post Office Time Deposit' },
      { value: 'debenture', label: 'Debenture' },
    ],
  },
  {
    key: 'real_estate',
    label: 'Real Estate',
    icon: Home,
    color: '#4ade93',
    types: [
      { value: 'residential_property', label: 'Residential Property' },
      { value: 'commercial_property', label: 'Commercial Property' },
    ],
  },
  {
    key: 'commodities',
    label: 'Commodities',
    icon: Coins,
    color: '#f5b942',
    types: [
      { value: 'gold', label: 'Gold', keywords: ['gold', 'jewellery', 'digital gold'] },
      { value: 'silver', label: 'Silver', keywords: ['silver'] },
      { value: 'platinum', label: 'Platinum' },
      { value: 'other_commodity', label: 'Other Commodity' },
    ],
    groups: [
      { label: 'Physical Gold / Silver', defaultValue: 'gold' },
      { label: 'Digital (ETF / SGB / MF)', defaultValue: 'other_commodity' },
    ],
  },
  {
    key: 'cash',
    label: 'Cash & Savings',
    icon: Wallet,
    color: '#94a3b8',
    types: [{ value: 'cash', label: 'Cash & Savings', keywords: ['savings', 'bank', 'account', 'wallet'] }],
  },
  {
    key: 'crypto',
    label: 'Crypto',
    icon: Bitcoin,
    color: '#f97316',
    types: [
      { value: 'crypto_coin', label: 'Crypto Coin / Token', keywords: ['bitcoin', 'coin', 'token'] },
      { value: 'nft', label: 'NFT' },
    ],
  },
  {
    key: 'alternatives',
    label: 'Alternatives',
    icon: Layers,
    color: '#8b5cf6',
    types: [
      { value: 'private_equity_startup', label: 'Private Equity / Startup' },
      { value: 'collectibles_art', label: 'Collectibles / Art' },
    ],
  },
  {
    key: 'other',
    label: 'Other',
    icon: MoreHorizontal,
    color: '#64748b',
    types: [{ value: 'other', label: 'Other' }],
  },
];

export const LIABILITY_TAXONOMY: CategoryDef<LiabilityClass>[] = [
  {
    key: 'loans',
    label: 'Loans',
    icon: Landmark,
    color: '#ef4444',
    types: [
      { value: 'home_loan', label: 'Home Loan', keywords: ['mortgage', 'property loan'] },
      { value: 'car_loan', label: 'Vehicle Loan', keywords: ['car loan', 'auto loan'] },
      { value: 'personal_loan', label: 'Personal Loan', keywords: ['consumer loan'] },
      { value: 'education_loan', label: 'Education Loan', keywords: ['student loan'] },
      { value: 'gold_loan', label: 'Gold Loan' },
      { value: 'business_loan', label: 'Business Loan', keywords: ['startup loan'] },
      { value: 'friends_family', label: 'Friends / Family', keywords: ['borrowed', 'lent', 'personal debt'] },
    ],
  },
  {
    key: 'credit',
    label: 'Credit',
    icon: CreditCard,
    color: '#f97316',
    types: [
      { value: 'credit_card', label: 'Credit Card', keywords: ['card'] },
      { value: 'line_of_credit', label: 'Line of Credit', keywords: ['credit line', 'overdraft'] },
    ],
  },
  {
    key: 'other',
    label: 'Other',
    icon: Banknote,
    color: '#64748b',
    types: [{ value: 'other_liability', label: 'Other Liability' }],
  },
];

// --- Derived lookups -----------------------------------------------------

export const ASSET_CLASS_LABELS: Record<string, string> = {};
export const ASSET_CLASS_COLORS: Record<string, string> = {};
export const ASSET_CLASS_TO_CATEGORY: Record<string, CategoryDef<AssetClass>> = {};
ASSET_TAXONOMY.forEach((cat) => {
  cat.types.forEach((t) => {
    ASSET_CLASS_LABELS[t.value] = t.label;
    ASSET_CLASS_COLORS[t.value] = cat.color;
    ASSET_CLASS_TO_CATEGORY[t.value] = cat;
  });
});

export const LIABILITY_CLASS_LABELS: Record<string, string> = {};
export const LIABILITY_CLASS_TO_CATEGORY: Record<string, CategoryDef<LiabilityClass>> = {};
LIABILITY_TAXONOMY.forEach((cat) => {
  cat.types.forEach((t) => {
    LIABILITY_CLASS_LABELS[t.value] = t.label;
    LIABILITY_CLASS_TO_CATEGORY[t.value] = cat;
  });
});

/**
 * The small set of asset types shown up-front on the Add Asset "Select
 * Asset Type" screen (above the full category grid) — the ones most
 * people reach for first. Order here is the display order.
 */
export const COMMON_ASSET_TYPES: AssetClass[] = [
  'stock',
  'equity_mutual_fund',
  'gold',
  'cash',
  'fixed_deposit',
  'residential_property',
  'epf',
  'ppf',
];

/** Per-type icon overrides for the type-selection tiles — falls back to the owning category's icon when a type isn't listed here. */
export const TYPE_ICONS: Partial<Record<AssetClass | LiabilityClass, LucideIcon>> = {
  stock: TrendingUp,
  equity_mutual_fund: TrendingUp,
  gold: Coins,
  silver: Coins,
  cash: Wallet,
  fixed_deposit: Landmark,
  recurring_deposit: PiggyBank,
  residential_property: Home,
  commercial_property: Home,
  epf: Briefcase,
  vpf: Briefcase,
  ppf: FileText,
  nps: Briefcase,
  crypto_coin: Bitcoin,
  car_loan: Car,
  education_loan: GraduationCap,
  credit_card: CreditCard,
  home_loan: Home,
  personal_loan: Banknote,
  gold_loan: Coins,
  business_loan: Briefcase,
  friends_family: Users,
};

/** One matched type, flattened out of a taxonomy for display in a search/common grid. */
export interface FlatTypeMatch<T extends string> {
  type: TypeOption<T>;
  category: CategoryDef<T>;
}

/**
 * Flattens every individual type in a taxonomy (ignoring category grouping)
 * and filters by a free-text query against the type's own label, its
 * keywords, and its category label — case-insensitive substring match.
 * Passing an empty/whitespace query returns every type, in taxonomy order.
 */
export function searchTypes<T extends string>(taxonomy: CategoryDef<T>[], query: string): FlatTypeMatch<T>[] {
  const q = query.trim().toLowerCase();
  const all = taxonomy.flatMap((category) => category.types.map((type) => ({ type, category })));
  if (!q) return all;
  return all.filter(({ type, category }) => {
    const haystack = [type.label, category.label, ...(type.keywords ?? [])].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/** Asset classes for which live price lookup via a ticker symbol makes sense. */
export const SYMBOL_ENABLED_CLASSES = new Set<AssetClass>([
  'stock',
  'etf',
  'equity_mutual_fund',
  'index_fund',
  'hybrid_mutual_fund',
  'sip',
  'international_equity',
  'crypto_coin',
]);

/**
 * Fixed-income / deposit-style asset classes — FD, RD, and similar
 * instruments — that get extra fields for institution, interest rate,
 * and maturity date instead of the symbol/quantity fields equities use.
 */
export const DEPOSIT_LIKE_CLASSES = new Set<AssetClass>([
  'fixed_deposit',
  'recurring_deposit',
  'ppf',
  'epf',
  'vpf',
  'nps',
  'government_bond',
  'corporate_bond',
  'sovereign_gold_bond',
  'treasury_bill',
  'nsc',
  'kvp',
  'scss',
  'sukanya_samriddhi',
  'post_office_td',
  'debenture',
]);

/** The Recurring Deposit class additionally shows a "Monthly Installment" field. */
export const RECURRING_DEPOSIT_CLASSES = new Set<AssetClass>(['recurring_deposit']);

/**
 * Physical-metal classes tracked by weight. These get a "Purchases" list
 * (grams + amount per buy) instead of the plain Quantity/Avg. Cost fields —
 * buying more later just adds another lot, and totals are summed automatically.
 */
export const WEIGHT_TRACKED_CLASSES = new Set<AssetClass>(['gold', 'silver', 'platinum']);

/** SIP gets its own dedicated form (fund/symbol, initial + recurring amount, start date, SIP date) instead of the generic symbol/quantity/avg-cost fields. */
export const SIP_CLASSES = new Set<AssetClass>(['sip']);

/**
 * Equity classes that trade on more than one market, so the form shows a
 * Market (India / US) selector. This routes live-price lookup correctly
 * (a US ticker like AAPL isn't an NSE symbol) and defaults Currency to
 * match the chosen market.
 */
export const MARKET_SELECTABLE_CLASSES = new Set<AssetClass>(['stock', 'etf', 'international_equity']);

/**
 * Equity classes — outside the dedicated Mutual Fund SIP type — that can
 * optionally be flagged as a recurring/systematic investment plan. Shows
 * a "Set up as SIP" toggle with amount/frequency/day reminder fields.
 */
export const RECURRING_ELIGIBLE_CLASSES = new Set<AssetClass>(['stock', 'etf', 'international_equity']);
