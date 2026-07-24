export type AssetClass =
  | 'equity'
  | 'mutual_fund'
  | 'real_estate'
  | 'gold'
  | 'epf_ppf'
  | 'nps'
  | 'fixed_deposit'
  | 'crypto'
  | 'cash'
  | 'other';

export interface Asset {
  id: string;
  name: string;
  assetClass: AssetClass;
  value: number;
  currency: string;
  notes?: string;
  updatedAt: number;
}

export interface Liability {
  id: string;
  name: string;
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
