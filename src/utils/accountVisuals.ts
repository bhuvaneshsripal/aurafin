import {
  Landmark,
  CreditCard,
  Banknote,
  WalletCards,
  LineChart,
  Package,
  Building2,
  Coins,
  Circle,
  Gem,
  Box,
  type LucideIcon,
} from 'lucide-react';

export type AccountType = 'bank' | 'credit_card' | 'cash' | 'wallet' | 'broker' | 'other';

export const ACCOUNT_TYPES: { key: AccountType; label: string; icon: LucideIcon }[] = [
  { key: 'bank', label: 'Bank account', icon: Landmark },
  { key: 'credit_card', label: 'Credit card', icon: CreditCard },
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'wallet', label: 'Wallet', icon: WalletCards },
  { key: 'broker', label: 'Broker', icon: LineChart },
  { key: 'other', label: 'Other', icon: Package },
];

export const ACCOUNT_COLOURS = ['#334155', '#2563eb', '#16a34a', '#f97316', '#e11d48', '#8b5cf6'];

export const ACCOUNT_ICONS: { key: string; icon: LucideIcon | null }[] = [
  { key: 'auto', icon: null },
  { key: 'landmark', icon: Landmark },
  { key: 'credit_card', icon: CreditCard },
  { key: 'chart', icon: LineChart },
  { key: 'building', icon: Building2 },
  { key: 'coins', icon: Coins },
  { key: 'wallet', icon: WalletCards },
  { key: 'circle', icon: Circle },
  { key: 'gem', icon: Gem },
  { key: 'box', icon: Box },
];

export function iconForAccountType(type: AccountType): LucideIcon {
  return ACCOUNT_TYPES.find((t) => t.key === type)?.icon ?? Package;
}

export function resolveAccountIcon(iconKey: string | undefined, type: AccountType): LucideIcon {
  if (!iconKey || iconKey === 'auto') return iconForAccountType(type);
  return ACCOUNT_ICONS.find((i) => i.key === iconKey)?.icon ?? iconForAccountType(type);
}
