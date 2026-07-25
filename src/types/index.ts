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
  /** Manual display order in the Wealth grid (lower = shown first). Set by the move up/down buttons. */
  order?: number;
  /**
   * Individual purchase lots for weight-tracked commodities (Gold / Silver / Platinum).
   * Each time more is bought, a new lot is appended instead of overwriting the total —
   * `quantity` (grams) and `investedValue` are then derived by summing all lots.
   */
  purchaseLots?: { id: string; date?: string; grams: number; amount: number }[];
}

export interface Liability {
  id: string;
  name: string;
  liabilityClass?: LiabilityClass;
  outstanding: number;
  currency: string;
  emi?: number;
  updatedAt: number;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate?: string;
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
