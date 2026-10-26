import { api } from '../api';
import { queryClient } from '../queryClient';
import type {
  Account,
  Transaction,
  Category,
  CategoryRule,
  TaxRule,
  Budget,
  Loan,
  MerchantOverride,
} from '../types';

export interface WorkspaceBackupPayload {
  app: 'strictly-spending';
  version: 1;
  exportedAt: string;
  counts: {
    accounts: number;
    transactions: number;
    categories: number;
    rules: number;
    budgets: number;
    loans: number;
  };
  data: {
    accounts: Account[];
    transactions: Transaction[];
    categories: Category[];
    rules: CategoryRule[];
    taxRules?: TaxRule[];
    budgets: Budget[];
    loans: Loan[];
    merchantOverrides?: MerchantOverride[];
    settings?: { key: string; value: unknown }[];
    localStorageKeys?: Record<string, string>;
  };
}

const LOCAL_STORAGE_BACKUP_KEYS = [
  'strictly-forecast-store',
  'strictly-spending-filters',
  'budget:savingsByAccountId',
  'budget:savings',
];

export async function createWorkspaceBackupPayload(): Promise<WorkspaceBackupPayload> {
  const [
    allAccounts,
    allTransactions,
    categories,
    rules,
    taxRules,
    budgets,
    loans,
    merchantOverrides,
    settings,
  ] = await Promise.all([
    api.getAccounts(),
    api.getTransactions('1970-01-01', '2100-01-01'),
    api.getCategories(),
    api.getRules(),
    api.getTaxRules().catch(() => []),
    api.getBudgets(),
    api.getLoans().catch(() => []),
    api.getMerchantOverrides().catch(() => []),
    api.getSettings().catch(() => []),
  ]);

  const accounts = allAccounts.filter((a) => a.source !== 'demo');
  const transactions = allTransactions.filter((t) => t.source !== 'demo');

  const localStorageKeys: Record<string, string> = {};
  if (typeof window !== 'undefined' && window.localStorage) {
    for (const k of LOCAL_STORAGE_BACKUP_KEYS) {
      const val = window.localStorage.getItem(k);
      if (val !== null) {
        localStorageKeys[k] = val;
      }
    }
  }

  return {
    app: 'strictly-spending',
    version: 1,
    exportedAt: new Date().toISOString(),
    counts: {
      accounts: accounts.length,
      transactions: transactions.length,
      categories: categories.length,
      rules: rules.length,
      budgets: budgets.length,
      loans: loans.length,
    },
    data: {
      accounts,
      transactions,
      categories,
      rules,
      taxRules,
      budgets,
      loans,
      merchantOverrides,
      settings,
      localStorageKeys,
    },
  };
}

export async function downloadWorkspaceBackup(): Promise<{
  filename: string;
  counts: WorkspaceBackupPayload['counts'];
}> {
  const payload = await createWorkspaceBackupPayload();
  const dateStr = payload.exportedAt.slice(0, 10);
  const filename = `strictly-spending-backup-${dateStr}.json`;
  const json = JSON.stringify(payload, null, 2);

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { filename, counts: payload.counts };
}

export async function restoreWorkspaceBackup(jsonText: string): Promise<{
  restoredAccounts: number;
  restoredTransactions: number;
  restoredRules: number;
  restoredBudgets: number;
  restoredLoans: number;
}> {
  const parsed = JSON.parse(jsonText) as Partial<WorkspaceBackupPayload>;
  if (!parsed || parsed.app !== 'strictly-spending' || !parsed.data) {
    throw new Error('Invalid Strictly Spending backup file.');
  }

  const { data } = parsed;

  // 1. Categories
  const existingCategories = await api.getCategories();
  const existingCatNames = new Set(existingCategories.map((c) => c.name.toLowerCase()));
  for (const cat of data.categories || []) {
    if (!existingCatNames.has(cat.name.toLowerCase())) {
      await api.addCategory({
        name: cat.name,
        color: cat.color,
        type: cat.type,
        sortOrder: cat.sortOrder ?? existingCategories.length + 1,
        defaultRecurrence: cat.defaultRecurrence,
      }).catch(() => {});
      existingCatNames.add(cat.name.toLowerCase());
    }
  }

  // 2. Accounts (map old account ID -> new/existing account ID)
  const existingAccounts = await api.getAccounts();
  const accountIdMap = new Map<number, number>();
  let restoredAccounts = 0;

  for (const acc of data.accounts || []) {
    if (acc.source === 'demo') continue;
    const match = existingAccounts.find(
      (e) =>
        e.name.toLowerCase() === acc.name.toLowerCase() &&
        e.institution.toLowerCase() === acc.institution.toLowerCase()
    );
    if (match && match.id != null) {
      if (acc.id != null) accountIdMap.set(acc.id, match.id);
      if (acc.currentBalance !== undefined && acc.currentBalance !== null) {
        await api.updateAccount(match.id, { ...match, currentBalance: acc.currentBalance }).catch(() => {});
      }
    } else {
      const newId = await api.addAccount({
        name: acc.name,
        type: acc.type,
        institution: acc.institution,
        last4: acc.last4,
        source: acc.source,
        enabled: acc.enabled ?? true,
        currentBalance: acc.currentBalance,
      });
      if (acc.id != null) accountIdMap.set(acc.id, newId);
      restoredAccounts++;
    }
  }

  // 3. Rules
  const existingRules = await api.getRules();
  const existingRulePatterns = new Set(existingRules.map((r) => r.pattern.toLowerCase()));
  let restoredRules = 0;
  for (const rule of data.rules || []) {
    if (!existingRulePatterns.has(rule.pattern.toLowerCase())) {
      await api.addRule({
        pattern: rule.pattern,
        category: rule.category,
        priority: rule.priority ?? 100,
        createdAt: rule.createdAt || new Date().toISOString(),
      }).catch(() => {});
      existingRulePatterns.add(rule.pattern.toLowerCase());
      restoredRules++;
    }
  }

  // 4. Budgets
  const budgetsToRestore = data.budgets || [];
  if (budgetsToRestore.length > 0) {
    await api.bulkPutBudgets(budgetsToRestore).catch(() => {});
  }

  // 5. Merchant Overrides
  for (const ov of data.merchantOverrides || []) {
    await api.putMerchantOverride(ov).catch(() => {});
  }

  // 6. Loans
  const existingLoans = await api.getLoans().catch(() => []);
  const existingLoanNames = new Set(existingLoans.map((l) => l.name.toLowerCase()));
  let restoredLoans = 0;
  for (const loan of data.loans || []) {
    if (!existingLoanNames.has(loan.name.toLowerCase())) {
      await api.addLoan({
        ...loan,
        id: undefined,
        createdAt: loan.createdAt || new Date().toISOString(),
      }).catch(() => {});
      existingLoanNames.add(loan.name.toLowerCase());
      restoredLoans++;
    }
  }

  // 7. Transactions (remap accountId and bulk insert with dedup_key protection)
  const mappedTxns: Transaction[] = (data.transactions || [])
    .filter((t) => t.source !== 'demo')
    .map((t) => ({
      ...t,
      id: undefined,
      accountId: accountIdMap.get(t.accountId) ?? t.accountId,
    }));

  let restoredTransactions = 0;
  if (mappedTxns.length > 0) {
    const CHUNK = 500;
    for (let i = 0; i < mappedTxns.length; i += CHUNK) {
      const slice = mappedTxns.slice(i, i + CHUNK);
      const added = await api.bulkAddTransactions(slice).catch(() => 0);
      restoredTransactions += typeof added === 'number' ? added : slice.length;
    }
  }

  // 8. Settings & LocalStorage
  for (const s of data.settings || []) {
    if (s.key && s.key !== 'simplefin_config') {
      await api.putSetting(s.key, s.value).catch(() => {});
    }
  }

  if (typeof window !== 'undefined' && window.localStorage && data.localStorageKeys) {
    for (const [k, v] of Object.entries(data.localStorageKeys)) {
      if (typeof v === 'string') {
        window.localStorage.setItem(k, v);
      }
    }
  }

  await queryClient.invalidateQueries();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('db-update'));
  }

  return {
    restoredAccounts,
    restoredTransactions,
    restoredRules,
    restoredBudgets: budgetsToRestore.length,
    restoredLoans,
  };
}
