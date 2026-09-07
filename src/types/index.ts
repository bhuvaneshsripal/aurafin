export type AssetClass =
  // Equity (10 types)
  | 'stock'
  | 'etf'
  | 'equity_mutual_fund'
  | 'index_fund'
  | 'hybrid_mutual_fund'
  | 'sip'
  | 'international_equity'
  | 'ipo_pre_ipo'
  | 'esop_rsu'
  | 'equity_other'
  // Debt (17 types)
  | 'fixed_deposit'
  | 'recurring_deposit'
  | 'ppf'
  | 'epf'
  | 'vpf'
  | 'nps'
  | 'government_bond'
  | 'corporate_bond'
  | 'sovereign_gold_bond'
  | 'debt_mutual_fund'
  | 'treasury_bill'
  | 'nsc'
  | 'kvp'
  | 'scss'
  | 'sukanya_samriddhi'
  | 'post_office_td'
  | 'debenture'
  // Real Estate (2 types)
  | 'residential_property'
  | 'commercial_property'
  // Commodities (4 types)
  | 'gold'
  | 'silver'
  | 'platinum'
  | 'other_commodity'
  // Cash & Savings (1 type)
  | 'cash'
  // Crypto (2 types)
  | 'crypto_coin'
  | 'nft'
  // Alternatives (2 types)
  | 'private_equity_startup'
  | 'collectibles_art'
  // Other (1 type)
  | 'other';

export type LiabilityClass =
  | 'home_loan'
  | 'personal_loan'
  | 'car_loan'
  | 'education_loan'
  | 'gold_loan'
  | 'credit_card'
  | 'line_of_credit'
  | 'other_liability';

export interface Asset {
  id: string;
  name: string;
  assetClass: AssetClass;
  value: number;
  currency: string;
  notes?: string;
  updatedAt: number;
  /** NSE/BSE trading symbol (e.g. RELIANCE, TCS) for live price lookup. */
  symbol?: string;
  /**
   * ISIN, if the import source provided one (e.g. Groww exports). Used to
   * resolve the correct NSE/BSE trading symbol for live prices when the
   * source only gave a full company name instead of a ticker.
   */
  isin?: string;
  /**
   * Which exchange/market this equity trades on. 'IN' (default) routes live
   * price lookup through NSE/BSE; 'US' routes straight to the US market
   * (NASDAQ/NYSE via Yahoo) and skips the NSE attempt, since a US ticker
   * like AAPL isn't an NSE symbol. Only meaningful for Direct Stock, ETF,
   * and International Equity — see MARKET_SELECTABLE_CLASSES.
   */
  market?: 'IN' | 'US';
  /**
   * Marks this asset as a recurring/systematic investment plan (SIP) —
   * available on Direct Stock, ETF, and International Equity in addition
   * to the dedicated Mutual Fund SIP type. Reuses sipAmount/sipFrequency/
   * sipDay below purely as reminder metadata; unlike the Mutual Fund SIP
   * type this does NOT auto-calculate Current Value, since there's no
   * free per-day historical price feed for arbitrary stocks — quantity/
   * invested value still come from the manually logged purchase lots.
   */
  recurringInvestment?: boolean;
  /** Number of shares/units held. */
  quantity?: number;
  /** Average buy price per unit. */
  avgCost?: number;
  /** Original amount invested / cost basis, if known. */
  investedValue?: number;
  /** Absolute profit (positive) or loss (negative) = value - investedValue. */
  pnl?: number;
  /** P&L expressed as a percentage of investedValue. */
  pnlPercent?: number;
  /** Bank / AMC / issuer name — used for deposits, bonds, and similar instruments. */
  institution?: string;
  /** Annual interest rate (%), used for FDs, RDs, bonds, PPF, etc. */
  interestRate?: number;
  /** Start / booking date (ISO yyyy-mm-dd), used for FDs, RDs, bonds, etc. */
  startDate?: string;
  /** Maturity date (ISO yyyy-mm-dd), used for FDs, RDs, bonds, etc. */
  maturityDate?: string;
  /** Monthly installment amount — used for Recurring Deposits. */
  monthlyInstallment?: number;
  /** Per-installment SIP amount — used for the SIP asset class. */
  sipAmount?: number;
  /** How often the SIP debits — used for the SIP asset class. */
  sipFrequency?: 'monthly' | 'quarterly';
  /** Day of the month (1-31) the SIP debits — used for the SIP asset class. */
  sipDay?: number;
  /**
   * ISO date (yyyy-mm-dd) the SIP was paused on, if it's currently paused.
   * Undefined means the SIP is active. While set, no new installments are
   * counted (see computeSipProgress/listSipInstallments) and "next due"
   * is hidden — mirrors how a broker/AMC "Pause SIP" action behaves.
   */
  sipPausedAt?: string;
  /**
   * Closed pause/resume cycles for this SIP, oldest first. Each entry's
   * [pausedAt, resumedAt) window is skipped when counting installments,
   * so past pauses don't retroactively get billed once resumed. The
   * currently-open pause (if any) lives in `sipPausedAt` instead, until
   * it's resumed and moved into this history.
   */
  sipPauseHistory?: { pausedAt: string; resumedAt: string }[];
  /**
   * One-off top-up investments into this SIP, on top of the regular
   * installment schedule — e.g. "Buy More" with a lumpsum. Each is priced
   * at the NAV in effect on its own date, same as a regular installment.
   */
  sipTopUps?: { id: string; date: string; amount: number }[];
  /**
   * History of installment-amount changes over time, oldest first. Each
   * entry means "the installment became `amount` starting from
   * `effectiveFrom`" — so past installments keep being valued at the
   * amount that was actually in effect on their date instead of the
   * current `sipAmount` being applied retroactively. `sipAmount` above
   * always mirrors the latest (current) amount. Undefined/empty means the
   * SIP amount has never changed since it started.
   */
  sipAmountSchedule?: { amount: number; effectiveFrom: string }[];
  /** Manual display order in the Wealth grid (lower = shown first). Set by the move up/down buttons. */
  order?: number;
  /**
   * Individual purchase lots for weight-tracked commodities (Gold / Silver / Platinum).
   * Each time more is bought, a new lot is appended instead of overwriting the total —
   * `quantity` (grams) and `investedValue` are then derived by summing all lots.
   */
  purchaseLots?: { id: string; date?: string; grams: number; amount: number }[];
  /**
   * Purity used to price this holding off the live 24K gold rate (Gold
   * asset class only). '24k' uses the live rate as-is; '22k' derives from
   * it at the standard 22/24 ratio (see goldPricePerGram22k). Persisted so
   * Current Value / Return can keep tracking the live rate everywhere the
   * asset is shown, not just while the add/edit form is open. Undefined on
   * older entries saved before this existed — treated as '24k'.
   */
  goldPurity?: '24k' | '22k';
  /**
   * Individual buy lots for unit-tracked equities/funds (Stocks, ETFs, Mutual
   * Funds, Crypto, etc.). Each time more is bought at a different price, a new
   * lot is appended instead of overwriting the total — `quantity` and
   * `avgCost` are then derived by summing lots and weighting by quantity.
   */
  shareLots?: { id: string; date?: string; quantity: number; price: number }[];
  /** Sub-type shown on the Accounts tab (bank/cash/wallet/broker/other) — display only. */
  accountType?: 'bank' | 'cash' | 'wallet' | 'broker' | 'other';
  /** Last 4 digits of the account/card number, for display. */
  last4?: string;
  /** Hex colour chosen for this account's icon tile on the Accounts tab. */
  colour?: string;
  /** Icon key chosen for this account on the Accounts tab ('auto' = derive from accountType). */
  icon?: string;
  /** Date (ISO yyyy-mm-dd) the entered balance is as-of. */
  balanceAsOf?: string;
  /** Marks this as the account/card shown as "Default" on the Accounts tab. */
  isDefaultAccount?: boolean;
  /** Which household profile (see HouseholdProfile) this asset belongs to.
   *  Undefined means it isn't assigned to any specific member yet. */
  profileId?: string;
  /** Free-form keywords for filtering/grouping (e.g. "long-term", "swing-trade"). */
  tags?: string[];
  /** Region this holding's exposure sits in — display/filter metadata only. */
  geography?:
    | 'INDIA'
    | 'USA'
    | 'CANADA'
    | 'EUROPE'
    | 'UK'
    | 'SINGAPORE'
    | 'JAPAN'
    | 'CHINA'
    | 'TAIWAN'
    | 'KOREA'
    | 'BRAZIL'
    | 'GLOBAL'
    | 'OTHER';
  /** Free-form finer categorisation within the asset class (e.g. "Large Cap", "SGB"). */
  subClass?: string;
  /** When true, this holding is skipped when computing Allocation % (see
   *  AllocationTab) — it still counts toward net worth everywhere else. */
  excludeFromAllocation?: boolean;
  /** Marks this holding as money earmarked for emergencies. Saved and
   *  shown on the asset, but NOT YET wired into the Essentials
   *  emergency-fund runway calculation, which currently sums a fixed set
   *  of "liquid" asset classes instead (see computeLiquidAssets in
   *  utils/financialHealth.ts) — switching that to read this flag instead
   *  is a real behavior change (opt-in per-asset vs. automatic by class)
   *  that needs its own decision, not a silent side effect of adding this
   *  field. */
  emergencyFund?: boolean;
}

export interface Liability {
  id: string;
  name: string;
  liabilityClass?: LiabilityClass;
  outstanding: number;
  currency: string;
  emi?: number;
  updatedAt: number;
  /** Last 4 digits of the card/account number, for display. */
  last4?: string;
  /** Hex colour chosen for this account's icon tile on the Accounts tab. */
  colour?: string;
  /** Icon key chosen for this account on the Accounts tab ('auto' = derive from type). */
  icon?: string;
  /** Date (ISO yyyy-mm-dd) the entered balance is as-of. */
  balanceAsOf?: string;
  /** Marks this as the account/card shown as "Default" on the Accounts tab. */
  isDefaultAccount?: boolean;
  /** Which household profile this liability belongs to. */
  profileId?: string;
}

export interface FinancialProfile {
  /** Always the fixed id 'profile' — this collection only ever holds one doc. */
  id: string;
  age?: number;
  monthlyIncome?: number;
  monthlyExpense?: number;
  monthlySavings?: number;
  termCover?: number;
  healthCover?: number;
  dependents?: number;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate?: string;
  /** When true, progress is computed live from the dashboard's Net Worth
   *  (total assets − total liabilities) instead of the manually entered
   *  currentAmount. */
  linkedToNetWorth?: boolean;
  /** Which household profile this goal belongs to. */
  profileId?: string;
}

export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  category: string;
  amount: number;
  currency: string;
  date: string;
  note?: string;
  /** Which household profile this transaction belongs to. */
  profileId?: string;
}

/** A household member (e.g. "Dad", "Mom", "Kid") whose assets, liabilities,
 *  goals, and transactions can be viewed separately within one login. Up to
 *  5 profiles per account. */
export interface HouseholdProfile {
  id: string;
  name: string;
  /** Hex colour for the avatar chip. */
  colour: string;
  createdAt: number;
  /** Whether this is the account's default profile — the one a fresh
   *  login on a *new* device should open to, instead of "All Profiles".
   *  Exactly one profile should have this set at a time. */
  isDefault?: boolean;
}

export interface BudgetItem {
  id: string;
  /** Month key, e.g. "2026-07". */
  month: string;
  category: string;
  amount: number;
  currency: string;
}

export interface Snapshot {
  id: string;
  date: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  baseCurrency: string;
}

/** A single account's Premium subscription state. `id` is present so this
 *  shape lines up with `useFirestoreCollectionSync<T extends { id: string }>`
 *  once real subscription sync is wired up (see `store/premiumStore.ts`). */
export interface PremiumStatus {
  id: string;
  isPremium: boolean;
  /** Which redeemed code/plan granted this, e.g. 'monthly' | 'quarterly' | 'lifetime' | 'developer'. */
  planId?: string;
  /** Epoch ms when this grant expires. `null`/`undefined` means it never expires (lifetime/developer). */
  expiresAt?: number | null;
}
