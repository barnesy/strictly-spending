import { db } from './db';
import type {
  Account,
  Transaction,
  CategoryRule,
  Category,
  ImportBatch,
  MerchantOverride,
  Budget,
} from './types';

export const BACKUP_FORMAT = 'spending-viz-backup' as const;
export const BACKUP_FORMAT_VERSION = 1 as const;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  exportedAt: string;
  appSeedVersion: number;
  counts: BackupCounts;
  data: {
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    rules: CategoryRule[];
    merchantOverrides: MerchantOverride[];
    budgets: Budget[];
    imports: ImportBatch[];
  };
}

export interface BackupCounts {
  accounts: number;
  transactions: number;
  categories: number;
  rules: number;
  merchantOverrides: number;
  budgets: number;
  imports: number;
}

export interface RestoreReport {
  restored: BackupCounts;
  exportedAt: string;
  appSeedVersion: number;
}

export async function exportToJson(
  appSeedVersion: number
): Promise<{ json: string; suggestedFilename: string; counts: BackupCounts }> {
  const [accounts, transactions, categories, rules, merchantOverrides, budgets, imports] =
    await Promise.all([
      db.accounts.toArray(),
      db.transactions.toArray(),
      db.categories.toArray(),
      db.rules.toArray(),
      db.merchantOverrides.toArray(),
      db.budgets.toArray(),
      db.imports.toArray(),
    ]);

  const counts: BackupCounts = {
    accounts: accounts.length,
    transactions: transactions.length,
    categories: categories.length,
    rules: rules.length,
    merchantOverrides: merchantOverrides.length,
    budgets: budgets.length,
    imports: imports.length,
  };

  const file: BackupFile = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appSeedVersion,
    counts,
    data: {
      accounts,
      transactions,
      categories,
      rules,
      merchantOverrides,
      budgets,
      imports,
    },
  };

  const today = new Date().toISOString().slice(0, 10);
  return {
    json: JSON.stringify(file, null, 2),
    suggestedFilename: `spending-viz-backup-${today}.json`,
    counts,
  };
}

export class BackupValidationError extends Error {}

export function parseAndValidate(json: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BackupValidationError(
      'File is not valid JSON. Pick a .json backup file.'
    );
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new BackupValidationError('Backup file is empty or malformed.');
  }
  const obj = parsed as Partial<BackupFile>;
  if (obj.format !== BACKUP_FORMAT) {
    throw new BackupValidationError(
      'This file is not a spending-viz backup (missing format sentinel).'
    );
  }
  if (typeof obj.formatVersion !== 'number') {
    throw new BackupValidationError('Backup is missing formatVersion.');
  }
  if (obj.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new BackupValidationError(
      `Backup is from a newer version of the app (format v${obj.formatVersion}). Please update the app first.`
    );
  }
  if (!obj.data || typeof obj.data !== 'object') {
    throw new BackupValidationError('Backup is missing the data block.');
  }
  const requiredTables = [
    'accounts',
    'transactions',
    'categories',
    'rules',
    'merchantOverrides',
    'budgets',
    'imports',
  ] as const;
  for (const t of requiredTables) {
    if (!Array.isArray((obj.data as Record<string, unknown>)[t])) {
      throw new BackupValidationError(
        `Backup is missing the "${t}" table (must be an array).`
      );
    }
  }
  return obj as BackupFile;
}

export async function importFromJson(json: string): Promise<RestoreReport> {
  const file = parseAndValidate(json);

  await db.transaction(
    'rw',
    [
      db.accounts,
      db.transactions,
      db.categories,
      db.rules,
      db.merchantOverrides,
      db.budgets,
      db.imports,
    ],
    async () => {
      // Wipe in dependency-safe order (children before parents).
      await db.transactions.clear();
      await db.imports.clear();
      await db.merchantOverrides.clear();
      await db.budgets.clear();
      await db.rules.clear();
      await db.categories.clear();
      await db.accounts.clear();

      // Restore. bulkAdd preserves explicit primary keys (including
      // auto-incremented `id` fields, since Dexie respects supplied IDs).
      if (file.data.accounts.length > 0) await db.accounts.bulkAdd(file.data.accounts);
      if (file.data.categories.length > 0) await db.categories.bulkAdd(file.data.categories);
      if (file.data.rules.length > 0) await db.rules.bulkAdd(file.data.rules);
      if (file.data.merchantOverrides.length > 0)
        await db.merchantOverrides.bulkAdd(file.data.merchantOverrides);
      if (file.data.budgets.length > 0) await db.budgets.bulkAdd(file.data.budgets);
      if (file.data.imports.length > 0) await db.imports.bulkAdd(file.data.imports);
      if (file.data.transactions.length > 0)
        await db.transactions.bulkAdd(file.data.transactions);
    }
  );

  // Carry forward the seed version so seedAndMigrate doesn't re-run
  // recategorizeAll on the next load.
  if (typeof file.appSeedVersion === 'number') {
    localStorage.setItem('seed_version', String(file.appSeedVersion));
  }

  return {
    restored: file.counts,
    exportedAt: file.exportedAt,
    appSeedVersion: file.appSeedVersion,
  };
}

export function triggerDownload(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so download initiates first
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
