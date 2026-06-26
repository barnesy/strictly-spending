import { api } from './api';

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
      api.getAccounts(),
      api.getTransactions(undefined, undefined, undefined), // get all transactions
      api.getCategories(),
      api.getRules(),
      api.getMerchantOverrides(),
      api.getBudgets(),
      api.getImports(),
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

  // Wipe in dependency-safe order (children before parents).
  await api.clearTransactions();
  await api.clearImports();
  await api.clearMerchantOverrides();
  await api.clearBudgets();
  await api.clearRules();
  await api.clearCategories();
  await api.clearAccounts();

  // Restore. insert preserves explicit primary keys (including
  // auto-incremented `id` fields) if supported by the backend bulk insertion logic.
  // Note: the backend must support inserting with explicit IDs for this to work correctly!
  // Currently we just insert one by one or bulk.
  for (const a of file.data.accounts) await api.addAccount(a as any);
  for (const c of file.data.categories) await api.addCategory(c as any);
  for (const r of file.data.rules) await api.addRule(r as any);
  for (const m of file.data.merchantOverrides) await api.putMerchantOverride(m as any);
  await api.bulkPutBudgets(file.data.budgets as any);
  for (const i of file.data.imports) await api.addImport(i as any);
  if (file.data.transactions.length > 0) await api.bulkAddTransactions(file.data.transactions as any, true);

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
