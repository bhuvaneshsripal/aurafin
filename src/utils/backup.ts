import type {
  Asset,
  Liability,
  Goal,
  Transaction,
  Snapshot,
  BudgetItem,
  FinancialProfile,
  HouseholdProfile,
} from '../types';

/**
 * A full, human-readable snapshot of everything in an Aurafin account —
 * downloadable from Settings > Data and restorable back into any account.
 * Kept as plain JSON (not Firestore's own export format) so it's easy to
 * inspect, diff, or hand-edit if needed.
 */
export interface AurafinBackup {
  app: 'aurafin';
  version: 1;
  exportedAt: string;
  data: {
    assets: Asset[];
    liabilities: Liability[];
    goals: Goal[];
    transactions: Transaction[];
    snapshots: Snapshot[];
    budgets: BudgetItem[];
    /** At most one entry — mirrors the single `financialProfile` doc. */
    financialProfile: FinancialProfile[];
    profiles: HouseholdProfile[];
  };
}

export function buildBackup(input: {
  assets: Asset[];
  liabilities: Liability[];
  goals: Goal[];
  transactions: Transaction[];
  snapshots: Snapshot[];
  budgets: BudgetItem[];
  financialProfile: FinancialProfile | null;
  profiles: HouseholdProfile[];
}): AurafinBackup {
  return {
    app: 'aurafin',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      assets: input.assets,
      liabilities: input.liabilities,
      goals: input.goals,
      transactions: input.transactions,
      snapshots: input.snapshots,
      budgets: input.budgets,
      financialProfile: input.financialProfile ? [input.financialProfile] : [],
      profiles: input.profiles,
    },
  };
}

/** Triggers a browser download of the backup as a formatted .json file. */
export function downloadBackupJson(backup: AurafinBackup) {
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `aurafin-backup-${date}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Reads and validates a user-selected backup file. Throws a message
 *  suitable for showing directly in the UI if the file isn't usable. */
export async function readBackupFile(file: File): Promise<AurafinBackup> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  const backup = parsed as Partial<AurafinBackup> | null;
  if (!backup || backup.app !== 'aurafin' || !backup.data || typeof backup.data !== 'object') {
    throw new Error("That doesn't look like an Aurafin backup file.");
  }
  return backup as AurafinBackup;
}

/** Total record count across every collection in a backup, for the
 *  "you're about to restore N items" confirmation copy. */
export function countBackupItems(backup: AurafinBackup): number {
  const d = backup.data;
  return (
    (d.assets?.length ?? 0) +
    (d.liabilities?.length ?? 0) +
    (d.goals?.length ?? 0) +
    (d.transactions?.length ?? 0) +
    (d.snapshots?.length ?? 0) +
    (d.budgets?.length ?? 0) +
    (d.financialProfile?.length ?? 0) +
    (d.profiles?.length ?? 0)
  );
}
