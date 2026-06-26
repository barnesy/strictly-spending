import { invoke } from '@tauri-apps/api/core';
import type { 
  Account, Transaction, CategoryRule, TaxRule, Category, 
  ImportBatch, MerchantOverride, Budget, ChatArtifact, ChatThread, 
  DbChatMessage, CsvMapping, AppDocument, Loan, SortCard 
} from './types';

// For settings which can be arbitrary types
export interface AppSetting {
  key: string;
  value: any;
}

export interface DocumentContent {
  id: string;
  content: string;
}


export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  enabledAccountIds?: number[];
  disabledCategories?: string[];
  spendOnly?: boolean;
  recurrenceFilter?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  demoMode?: boolean;
}

export interface DashboardAggregates {
  totalSpend: number;
  totalIncome: number;
  accountTotals: Record<number, number>;
}

export interface TopMerchant {
  merchantKey: string;
  total: number;
  count: number;
}

export interface SpendChartGroup {
  month: string;
  key: string;
  total: number;
}

export interface ConsolidatedMerchant {
  merchantKey: string;
  category: string;
  monthlyAverage: number;
}

export interface CategoryTrailingAvg {
  category: string;
  average: number;
}

export interface MerchantGroup {
  merchantKey: string;
  totalSpend: number;
  totalTransactions: number;
  categories: Record<string, number>;
  mostCommonCategory: string;
  earliestDate: string;
  latestDate: string;
}

export const api = {
  // Accounts
  getAccounts: () => invoke<Account[]>('get_accounts'),
  addAccount: (item: Account) => invoke<number>('add_account', { item }),
  updateAccount: async (id: number, updates: Partial<Account>) => {
    const existing = (await invoke<Account[]>('get_accounts')).find(a => a.id === id);
    if (!existing) throw new Error(`Account ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_account', { id, updates: full });
  },
  deleteAccount: (id: number) => invoke<void>('delete_account', { id }),
  clearAccounts: () => invoke<void>('clear_accounts'),

  // Transactions
  getTransactions: (
    startDate: string = '1970-01-01', 
    endDate: string = '2100-01-01',
    filters?: { category?: string, merchantKey?: string, accountId?: number, deductionStatus?: string }
  ) => invoke<Transaction[]>('get_transactions', { 
    startDate, endDate, 
    category: filters?.category, 
    merchantKey: filters?.merchantKey, 
    accountId: filters?.accountId, 
    deductionStatus: filters?.deductionStatus 
  }),
  getTransactionsPaginated: (filters: DashboardFilters, limit: number, offset: number) => 
    invoke<Transaction[]>('get_transactions_paginated', { filters, limit, offset }),
  getTransactionCount: (filters: DashboardFilters) => 
    invoke<number>('get_transaction_count', { filters }),
  getDashboardAggregates: (filters: DashboardFilters) => 
    invoke<DashboardAggregates>('get_dashboard_aggregates', { filters }),
  getTopMerchants: (filters: DashboardFilters) => 
    invoke<TopMerchant[]>('get_top_merchants', { filters }),
  getSpendChartData: (filters: DashboardFilters, groupBy: string) => 
    invoke<SpendChartGroup[]>('get_spend_chart_data', { filters, groupBy }),
  getIncomeChartData: (filters: DashboardFilters) => 
    invoke<SpendChartGroup[]>('get_income_chart_data', { filters }),
  getConsolidatedRecurringMerchants: (isDemo: boolean) => 
    invoke<ConsolidatedMerchant[]>('get_consolidated_recurring_merchants', { isDemo }),
  getCategoryTrailingAverages: (isDemo: boolean) => 
    invoke<CategoryTrailingAvg[]>('get_category_trailing_averages', { isDemo }),
  getUniqueMerchants: (isDemo: boolean) => 
    invoke<string[]>('get_unique_merchants', { isDemo }),
  lastMonthActualSpend: (isDemo: boolean) => 
    invoke<number>('last_month_actual_spend', { isDemo }),
  addTransaction: (item: Transaction) => invoke<number>('add_transaction', { item }),
  updateTransaction: async (id: number, updates: Partial<Transaction>) => {
    const existing = await invoke<Transaction | null>('get_transaction', { id });
    if (!existing) throw new Error(`Transaction ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_transaction', { id, updates: full });
  },
  deleteTransaction: (id: number) => invoke<void>('delete_transaction', { id }),
  bulkAddTransactions: (transactions: Transaction[], ignoreErrors: boolean = false) => 
    invoke<void>('bulk_add_transactions', { transactions, ignoreErrors }),
  bulkUpdateTransactions: (transactions: Transaction[]) => 
    invoke<void>('bulk_update_transactions', { transactions }),
  getSortQueue: (demoMode: boolean) => invoke<SortCard[]>('get_sort_queue', { demoMode }),

  // Rules
  getRules: () => invoke<CategoryRule[]>('get_rules'),
  addRule: (item: CategoryRule) => invoke<number>('add_rule', { item }),
  updateRule: async (id: number, updates: Partial<CategoryRule>) => {
    const existing = (await invoke<CategoryRule[]>('get_rules')).find(r => r.id === id);
    if (!existing) throw new Error(`Rule ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_rule', { id, updates: full });
  },
  deleteRule: (id: number) => invoke<void>('delete_rule', { id }),
  clearRules: () => invoke<void>('clear_rules'),

  // Categories
  getCategories: () => invoke<Category[]>('get_categories'),
  addCategory: (item: Category) => invoke<number>('add_category', { item }),
  updateCategory: async (id: number, updates: Partial<Category>) => {
    const existing = (await invoke<Category[]>('get_categories')).find(c => c.id === id);
    if (!existing) throw new Error(`Category ${id} not found`);
    const full = { ...existing, ...updates };
    return invoke<void>('update_category', { id, updates: full });
  },
  deleteCategory: (id: number) => invoke<void>('delete_category', { id }),
  clearCategories: () => invoke<void>('clear_categories'),

  // Imports
  getImports: () => invoke<ImportBatch[]>('get_imports'),
  addImport: (item: ImportBatch) => invoke<number>('add_import', { item }),
  deleteImport: (id: number) => invoke<void>('delete_import', { id }),
  clearImports: () => invoke<void>('clear_imports'),

  // Merchant Overrides
  getMerchantOverrides: () => invoke<MerchantOverride[]>('get_merchant_overrides'),
  putMerchantOverride: (item: MerchantOverride) => invoke<void>('put_merchant_override', { item }),
  deleteMerchantOverride: (key: string) => invoke<void>('delete_merchant_override', { key }),
  clearMerchantOverrides: () => invoke<void>('clear_merchant_overrides'),

  // Budgets
  getBudgets: () => invoke<Budget[]>('get_budgets'),
  putBudget: (item: Budget) => invoke<void>('put_budget', { item }),
  bulkPutBudgets: (budgets: Budget[]) => invoke<void>('bulk_put_budgets', { budgets }),
  clearBudgets: () => invoke<void>('clear_budgets'),

  // Settings
  getSettings: () => invoke<AppSetting[]>('get_settings'),
  getSetting: async <T>(key: string): Promise<T | undefined> => {
    const settings = await invoke<AppSetting[]>('get_settings');
    const setting = settings.find(s => s.key === key);
    return setting ? setting.value as T : undefined;
  },
  putSetting: (key: string, value: any) => invoke<void>('put_setting', { item: { key, value } }),
  deleteSetting: (key: string) => invoke<void>('delete_setting', { key }),

  // Artifacts
  getArtifacts: () => invoke<ChatArtifact[]>('get_artifacts'),
  putArtifact: (item: ChatArtifact) => invoke<void>('put_artifact', { item }),
  deleteArtifact: (id: string) => invoke<void>('delete_artifact', { id }),

  // Threads
  getThreads: () => invoke<ChatThread[]>('get_threads'),
  putThread: (item: ChatThread) => invoke<void>('put_thread', { item }),
  deleteThread: (id: string) => invoke<void>('delete_thread', { id }),
  deleteThreadMessages: (threadId: string) => invoke<void>('delete_thread_messages', { threadId }),

  // Messages
  getMessages: () => invoke<DbChatMessage[]>('get_messages'),
  putMessage: (item: DbChatMessage) => invoke<void>('put_message', { item }),
  deleteMessage: (id: string) => invoke<void>('delete_message', { id }),

  // CSV Mappings
  getCsvMappings: () => invoke<CsvMapping[]>('get_csv_mappings'),
  putCsvMapping: (item: CsvMapping) => invoke<void>('put_csv_mapping', { item }),
  deleteCsvMapping: (id: number) => invoke<void>('delete_csv_mapping', { id }),

  // Documents
  getDocuments: () => invoke<AppDocument[]>('get_documents'),
  putDocument: (item: AppDocument) => invoke<void>('put_document', { item }),
  deleteDocument: (id: string) => invoke<void>('delete_document', { id }),

  // Document Contents
  getDocumentContents: () => invoke<DocumentContent[]>('get_document_contents'),
  putDocumentContent: (item: DocumentContent) => invoke<void>('put_document_content', { item }),
  deleteDocumentContent: (id: string) => invoke<void>('delete_document_content', { id }),

  // Tax Rules
  getTaxRules: () => invoke<TaxRule[]>('get_tax_rules'),
  putTaxRule: (item: TaxRule) => invoke<void>('put_tax_rule', { item }),
  deleteTaxRule: (id: number) => invoke<void>('delete_tax_rule', { id }),

  // Loans
  getLoans: () => invoke<Loan[]>('get_loans'),
  addLoan: (item: Loan) => invoke<number>('add_loan', { item }),
  putLoan: (item: Loan) => invoke<void>('put_loan', { item }),
  updateLoan: (id: number, updates: Loan) => invoke<void>('update_loan', { id, updates }),
  deleteLoan: (id: number) => invoke<void>('delete_loan', { id }),

  // Data Management
  clearTransactions: () => invoke<void>('clear_transactions'),
  getTransactionBounds: (demoMode: boolean) => 
    invoke<[string | null, string | null]>('get_transaction_bounds', { demoMode }),
  getUncategorizedCount: (demoMode: boolean) => 
    invoke<number>('get_uncategorized_count', { demoMode }),
  getCategoryTransactionCounts: (demoMode: boolean) =>
    invoke<Record<string, number>>('get_category_transaction_counts', { demoMode }),
  getRuleMatchCounts: (demoMode: boolean) =>
    invoke<Record<number, number>>('get_rule_match_counts', { demoMode }),
  getMerchantGroups: (demoMode: boolean) =>
    invoke<MerchantGroup[]>('get_merchant_groups', { demoMode }),
};
