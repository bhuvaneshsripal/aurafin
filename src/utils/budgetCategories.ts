/** Preset budget categories offered under "Add categories" on the Budget tab. */
export const BUDGET_CATEGORIES: string[] = [
  'Housing & Rent',
  'Food & Dining',
  'Groceries',
  'Transport',
  'Healthcare',
  'Education',
  'Insurance',
  'EMI & Loans',
  'Entertainment',
  'Utilities',
  'Shopping',
  'Investment',
  'Travel & Vacations',
  'Subscriptions',
  'Personal Care',
  'Credit Card Payment',
  'Taxes',
  'Cash Withdrawal',
  'Childcare',
  'Other Expense',
];

/**
 * Transactions use free-text categories ("Rent", "Travel", "Personal") while
 * the Budget presets are longer ("Housing & Rent", "Travel & Vacations",
 * "Personal Care"). Without a bridge, a ₹15,000 "Rent" spend never counts
 * against a "Housing & Rent" budget, and Auto-suggest invents a second
 * duplicate category. This maps common synonyms onto the preset names.
 */
const ALIASES: Record<string, string> = {
  rent: 'Housing & Rent',
  housing: 'Housing & Rent',
  'house rent': 'Housing & Rent',
  mortgage: 'Housing & Rent',
  food: 'Food & Dining',
  dining: 'Food & Dining',
  restaurant: 'Food & Dining',
  restaurants: 'Food & Dining',
  'eating out': 'Food & Dining',
  grocery: 'Groceries',
  travel: 'Travel & Vacations',
  vacation: 'Travel & Vacations',
  vacations: 'Travel & Vacations',
  trip: 'Travel & Vacations',
  personal: 'Personal Care',
  'personal care': 'Personal Care',
  emi: 'EMI & Loans',
  loan: 'EMI & Loans',
  loans: 'EMI & Loans',
  health: 'Healthcare',
  medical: 'Healthcare',
  medicine: 'Healthcare',
  subscription: 'Subscriptions',
  tax: 'Taxes',
  utility: 'Utilities',
  bills: 'Utilities',
  electricity: 'Utilities',
  investments: 'Investment',
  fuel: 'Transport',
  other: 'Other Expense',
  misc: 'Other Expense',
  miscellaneous: 'Other Expense',
};

const PRESET_BY_KEY = new Map(BUDGET_CATEGORIES.map((c) => [c.toLowerCase(), c]));

/** Canonical display name for a category (preset name when one matches). */
export function canonicalCategory(name: string): string {
  const k = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return PRESET_BY_KEY.get(k) ?? ALIASES[k] ?? name.trim();
}

/** Case-insensitive, alias-aware key used to compare budgets with spending. */
export function budgetKey(name: string): string {
  return canonicalCategory(name).toLowerCase();
}
