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
  | 'business_loan'
  | 'friends_family'
  | 'credit_card'
  | 'line_of_credit'
  | 'other_liability';

export type IpoStage = 'applied' | 'allotted' | 'listed' | 'not_allotted' | 'pre_ipo';
export type IpoCategory = 'retail' | 'shni' | 'bhni' | 'employee' | 'shareholder';

/** IPO / Pre-IPO lifecycle details attached to an Asset. Dates are ISO strings. */
export interface IpoDetails {
  stage: IpoStage;
  board?: 'mainboard' | 'sme';
  category?: IpoCategory;
  priceBandLow?: number;
  priceBandHigh?: number;
  lotSize?: number;
  lotsApplied?: number;
  issuePrice?: number;
  sharesAllotted?: number;
  /** Grey-market premium per share (user's estimate). */
  gmp?: number;
  listingPrice?: number;
  currentPrice?: number;
  openDate?: string;
  closeDate?: string;
  allotmentDate?: string;
  listingDate?: string;
  lockInEnd?: string;
}

export interface FundDetails {
  folio?: string;
  plan?: 'direct' | 'regular';
  option?: 'growth' | 'idcw';
  /** Annual expense ratio, %. */
  expenseRatio?: number;
  /** Free text, e.g. "1% if redeemed within 1 year". */
  exitLoad?: string;
  /** ISO date the lock-in ends (ELSS / tax saver funds). */
  lockInEnd?: string;
  benchmark?: string;
}

export interface EsopDetails {
  employer?: string;
  /** What was granted. */
  kind?: 'rsu' | 'option';
  grantDate?: string;
  vestingStart?: string;
  /** Total vesting period in months. */
  vestingMonths?: number;
  /** Nothing vests until this many months have passed. */
  cliffMonths?: number;
  totalUnits?: number;
  /** Exercise price per unit (options only). */
  strikePrice?: number;
  /** Current fair market value per unit. */
  fmv?: number;
  expiryDate?: string;
}

export interface EpfDetails {
  uan?: string;
  employer?: string;
  /** ISO date the person joined the current establishment / first EPF membership. */
  joiningDate?: string;
  /** Monthly Basic + DA — the wage EPF contributions are calculated on. */
  monthlyBasic?: number;
  /** Employee contribution, % of Basic + DA (statutory 12%). */
  employeePct?: number;
  /** Employer contribution, % of Basic + DA (statutory 12%, part of which goes to EPS). */
  employerPct?: number;
  /** Extra voluntary contribution (VPF), % of Basic + DA. */
  vpfPct?: number;
  /** Employee-share balance on the passbook (includes VPF). */
  employeeBalance?: number;
  /** Employer-share balance on the passbook. */
  employerBalance?: number;
  /** ISO date the passbook balances are as of. */
  balanceAsOf?: string;
  currentAge?: number;
  retirementAge?: number;
  /** Expected yearly salary growth, %. */
  salaryGrowthPct?: number;
  /** Expected inflation, % — used only to express the projection in today's money. */
  inflationPct?: number;
}

export interface PpfDeposit {
  id: string;
  /** ISO date (yyyy-mm-dd) the deposit was made. */
  date: string;
  amount: number;
}

export interface PpfDetails {
  accountNumber?: string;
  /** Whose account this is — PPF allows one per person (a guardian can open one for a minor). */
  accountFor?: 'self' | 'spouse' | 'child' | 'parent' | 'other';
  nominee?: string;
  /** ISO date the account was opened — drives the 15-year term, loan and withdrawal windows. */
  openingDate?: string;
  /**
   * Passbook balance right after interest was credited on a 31 March (the year-end figure),
   * so interest for the year after it can be worked out exactly. `checkpointFy` is the
   * calendar year of that 31 March (e.g. 2026 = balance on 31 Mar 2026).
   */
  checkpointFy?: number;
  checkpointBalance?: number;
  /** Everything the person has put in up to that checkpoint — only used to show returns. */
  depositedToCheckpoint?: number;
  /** Deposits made after the checkpoint (or since opening, when there is no checkpoint). */
  deposits?: PpfDeposit[];
  /** Planned deposit per financial year, capped at the statutory limit. */
  plannedYearlyDeposit?: number;
  /** Whether the yearly amount goes in as one lump sum by 5 April or as 12 monthly instalments. */
  depositMode?: 'lump' | 'monthly';
  /** Yearly step-up in the planned deposit, %. */
  depositStepUpPct?: number;
  /** What happens after the 15-year term: 5-year extension blocks, with or without fresh deposits. */
  extensionBlocks?: 0 | 1 | 2 | 3;
  extensionWithDeposits?: boolean;
  /** Tax slab (old regime) used to estimate the Section 80C saving; 0 / undefined = not claiming. */
  taxSlabPct?: number;
}

export type PropertyKind = 'apartment' | 'independent_house' | 'villa' | 'builder_floor' | 'studio' | 'plot' | 'other';
export type PropertyUsage = 'self_occupied' | 'rented' | 'vacant' | 'under_construction';

/** Money spent on a property after buying it (renovation, interiors, extension…). */
export interface PropertyImprovement {
  id: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  amount: number;
  note?: string;
}

/**
 * Residential property details. Price, rent and running costs are for the WHOLE property;
 * `ownershipPct` is then applied to work out the person's own share. The asset's own
 * `value` / `investedValue` are always the person's share.
 */
export interface PropertyDetails {
  kind?: PropertyKind;
  usage?: PropertyUsage;
  /** Society / project name. */
  projectName?: string;
  address?: string;
  city?: string;
  /** Registry / document / RERA number. */
  registrationNo?: string;
  /** Built-up / carpet / plot area, in square feet. */
  areaSqft?: number;
  areaBasis?: 'carpet' | 'built_up' | 'super_built_up' | 'plot';
  /** Person's share of the property, % (100 when sole owner). */
  ownershipPct?: number;
  coOwners?: string;

  /* Purchase */
  purchaseDate?: string;
  purchasePrice?: number;
  stampDuty?: number;
  registrationFee?: number;
  brokerage?: number;
  otherPurchaseCosts?: number;
  improvements?: PropertyImprovement[];

  /* Valuation */
  /** 'manual' keeps whatever Current Value was typed; 'rate' = area × rate per sq ft × share. */
  valuationMode?: 'manual' | 'rate';
  ratePerSqft?: number;
  /** Assumed yearly price growth, % — used for the projection. */
  growthPct?: number;

  /* Rent (only used while `usage` is 'rented') */
  monthlyRent?: number;
  rentEscalationPct?: number;
  /** Months per year the property is expected to sit empty between tenants. */
  vacancyMonths?: number;
  securityDeposit?: number;
  tenantName?: string;
  leaseStart?: string;
  leaseEnd?: string;

  /* Running costs (whole property, always counted) */
  propertyTaxYearly?: number;
  maintenanceMonthly?: number;
  insuranceYearly?: number;
  otherCostsYearly?: number;

  /** Id of a Liability (usually a home loan) taken against this property. */
  linkedLoanId?: string;

  /* "If I sold today" */
  sellingCostPct?: number;
  /** Tax slab, % — only used for short-term gains (sold within 24 months). */
  taxSlabPct?: number;
}

export interface Asset {
  id: string;
  name: string;
  assetClass: AssetClass;
  value: number;
  currency: string;
  notes?: string;
  updatedAt: number;
  /** IPO / Pre-IPO lifecycle details (IPO tracker). */
  ipo?: IpoDetails;
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
  /**
   * Realized sale records for this holding — one entry per Sell action,
   * appended (never mutated/removed) so a holding's full lifetime history
   * survives even after it's completely sold out. `costBasis` is the
   * moving weighted-average cost per unit *at the moment of this sale*
   * (computed by walking shareLots/purchaseLots + saleLots in date order),
   * locked in here so this sale's realized P&L stays fixed forever even if
   * later buys/sells change the holding's current average cost. Selling
   * NEVER removes or shrinks shareLots/purchaseLots — those stay the
   * permanent, untouched buy history; remaining quantity is always derived
   * as (total bought) − (total sold via saleLots). See
   * `src/utils/investmentPnl.ts` for the full accounting logic. Grams for
   * weight-tracked commodities (Gold/Silver/Platinum) are stored in the
   * same `quantity` field as unit-tracked equities/funds/crypto, since a
   * sale record needs the same shape either way. */
  saleLots?: {
    id: string;
    date?: string;
    quantity: number;
    price: number;
    costBasis: number;
    fees?: number;
    /** Bank/cash account the sale proceeds were credited to, if any — mirrors BuySellDividendModal's "Credited to" picker. */
    accountId?: string;
  }[];
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
  /** Optional scheme details for mutual / index / hybrid funds. */
  fundDetails?: FundDetails;
  /** Contribution, passbook and retirement-planning details for an EPF account. */
  epf?: EpfDetails;
  /** Account, deposit ledger and planning details for a PPF account. */
  ppf?: PpfDetails;
  /** Purchase cost, valuation, rent, loan and sale-tax details for a residential property. */
  property?: PropertyDetails;
  /** Grant and vesting details for ESOPs / RSUs. */
  esop?: EsopDetails;
  /** Personal price levels (per unit) for a holding — shown against the live price. */
  targetPrice?: number;
  stopLossPrice?: number;
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
  /** Bank / NBFC / person this liability is owed to. */
  lender?: string;
  /** Annual interest rate (%). */
  interestRate?: number;
  /** Loan start / drawdown date (ISO yyyy-mm-dd). */
  startDate?: string;
  /** Next payment / bill due date (ISO yyyy-mm-dd) — e.g. a credit card's due date. */
  dueDate?: string;
  /** Free-form notes. */
  notes?: string;
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
  /** Holding this income came from (set for dividends logged from a holding). */
  assetId?: string;
  /** Extra detail for dividend income. `amount` above is the NET credited. */
  dividend?: DividendDetails;
}

export type DividendKind = 'interim' | 'final' | 'special';

export interface DividendDetails {
  kind: DividendKind;
  /** Amount before tax. */
  gross: number;
  /** Tax deducted at source (0 if none). */
  tds: number;
  /** Dividend per share/unit, when entered that way. */
  perShare?: number;
  /** Units held when the dividend was recorded. */
  qty?: number;
  /** Ex-dividend date (YYYY-MM-DD). */
  exDate?: string;
  /** Cash account the net amount was credited to, so a delete can reverse it. */
  accountId?: string;
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
