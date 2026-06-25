import { invoke } from '@tauri-apps/api/core';
import type { 
  Account, Transaction, CategoryRule, TaxRule, Category, 
  ImportBatch, MerchantOverride, Budget, ChatArtifact, ChatThread, 
  DbChatMessage, CsvMapping, AppDocument, Loan 
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

// Helper to wrap mutation calls so they trigger our reactivity hook
async function mut<T>(promise: Promise<T>): Promise<T> {
  const result = await promise;
  window.dispatchEvent(new CustomEvent('db-update'));
  return result;
}

export const api = {
  // Accounts
  getAccounts: () => invoke<Account[]>('get_accounts'),
  addAccount: (item: Account) => mut(invoke<number>('add_account', { item })),
  updateAccount: async (id: number, updates: Partial<Account>) => {
    const existing = (await invoke<Account[]>('get_accounts')).find(a => a.id === id);
    if (!existing) throw new Error(`Account ${id} not found`);
    const full = { ...existing, ...updates };
    return mut(invoke<void>('update_account', { id, updates: full }));
  },
  deleteAccount: (id: number) => mut(invoke<void>('delete_account', { id })),

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
  addTransaction: (item: Transaction) => mut(invoke<number>('add_transaction', { item })),
  updateTransaction: async (id: number, updates: Partial<Transaction>) => {
    const existing = (await invoke<Transaction[]>('get_transactions')).find(t => t.id === id);
    if (!existing) throw new Error(`Transaction ${id} not found`);
    const full = { ...existing, ...updates };
    return mut(invoke<void>('update_transaction', { id, updates: full }));
  },
  deleteTransaction: (id: number) => mut(invoke<void>('delete_transaction', { id })),
  bulkAddTransactions: (transactions: Transaction[], ignoreErrors: boolean = false) => 
    mut(invoke<void>('bulk_add_transactions', { transactions, ignoreErrors })),

  // Rules
  getRules: () => invoke<CategoryRule[]>('get_rules'),
  addRule: (item: CategoryRule) => mut(invoke<number>('add_rule', { item })),
  updateRule: async (id: number, updates: Partial<CategoryRule>) => {
    const existing = (await invoke<CategoryRule[]>('get_rules')).find(r => r.id === id);
    if (!existing) throw new Error(`Rule ${id} not found`);
    const full = { ...existing, ...updates };
    return mut(invoke<void>('update_rule', { id, updates: full }));
  },
  deleteRule: (id: number) => mut(invoke<void>('delete_rule', { id })),

  // Categories
  getCategories: () => invoke<Category[]>('get_categories'),
  addCategory: (item: Category) => mut(invoke<number>('add_category', { item })),
  updateCategory: async (id: number, updates: Partial<Category>) => {
    const existing = (await invoke<Category[]>('get_categories')).find(c => c.id === id);
    if (!existing) throw new Error(`Category ${id} not found`);
    const full = { ...existing, ...updates };
    return mut(invoke<void>('update_category', { id, updates: full }));
  },
  deleteCategory: (id: number) => mut(invoke<void>('delete_category', { id })),

  // Imports
  getImports: () => invoke<ImportBatch[]>('get_imports'),
  addImport: (item: ImportBatch) => mut(invoke<number>('add_import', { item })),
  deleteImport: (id: number) => mut(invoke<void>('delete_import', { id })),
  clearImports: () => mut(invoke<void>('clear_imports')),

  // Merchant Overrides
  getMerchantOverrides: () => invoke<MerchantOverride[]>('get_merchant_overrides'),
  putMerchantOverride: (item: MerchantOverride) => mut(invoke<void>('put_merchant_override', { item })),
  deleteMerchantOverride: (key: string) => mut(invoke<void>('delete_merchant_override', { key })),

  // Budgets
  getBudgets: () => invoke<Budget[]>('get_budgets'),
  putBudget: (item: Budget) => mut(invoke<void>('put_budget', { item })),
  bulkPutBudgets: (budgets: Budget[]) => mut(invoke<void>('bulk_put_budgets', { budgets })),

  // Settings
  getSettings: () => invoke<AppSetting[]>('get_settings'),
  getSetting: async <T>(key: string): Promise<T | undefined> => {
    const settings = await invoke<AppSetting[]>('get_settings');
    const setting = settings.find(s => s.key === key);
    return setting ? setting.value as T : undefined;
  },
  putSetting: (key: string, value: any) => mut(invoke<void>('put_setting', { item: { key, value } })),
  deleteSetting: (key: string) => mut(invoke<void>('delete_setting', { key })),

  // Artifacts
  getArtifacts: () => invoke<ChatArtifact[]>('get_artifacts'),
  putArtifact: (item: ChatArtifact) => mut(invoke<void>('put_artifact', { item })),
  deleteArtifact: (id: string) => mut(invoke<void>('delete_artifact', { id })),

  // Threads
  getThreads: () => invoke<ChatThread[]>('get_threads'),
  putThread: (item: ChatThread) => mut(invoke<void>('put_thread', { item })),
  deleteThread: (id: string) => mut(invoke<void>('delete_thread', { id })),

  // Messages
  getMessages: () => invoke<DbChatMessage[]>('get_messages'),
  putMessage: (item: DbChatMessage) => mut(invoke<void>('put_message', { item })),
  deleteMessage: (id: string) => mut(invoke<void>('delete_message', { id })),

  // CSV Mappings
  getCsvMappings: () => invoke<CsvMapping[]>('get_csv_mappings'),
  putCsvMapping: (item: CsvMapping) => mut(invoke<void>('put_csv_mapping', { item })),
  deleteCsvMapping: (id: number) => mut(invoke<void>('delete_csv_mapping', { id })),

  // Documents
  getDocuments: () => invoke<AppDocument[]>('get_documents'),
  putDocument: (item: AppDocument) => mut(invoke<void>('put_document', { item })),
  deleteDocument: (id: string) => mut(invoke<void>('delete_document', { id })),

  // Document Contents
  getDocumentContents: () => invoke<DocumentContent[]>('get_document_contents'),
  putDocumentContent: (item: DocumentContent) => mut(invoke<void>('put_document_content', { item })),
  deleteDocumentContent: (id: string) => mut(invoke<void>('delete_document_content', { id })),

  // Tax Rules
  getTaxRules: () => invoke<TaxRule[]>('get_tax_rules'),
  putTaxRule: (item: TaxRule) => mut(invoke<void>('put_tax_rule', { item })),
  deleteTaxRule: (id: number) => mut(invoke<void>('delete_tax_rule', { id })),

  // Loans
  getLoans: () => invoke<Loan[]>('get_loans'),
  putLoan: (item: Loan) => mut(invoke<void>('put_loan', { item })),
  deleteLoan: (id: number) => mut(invoke<void>('delete_loan', { id })),

  // Data Management
  clearTransactions: () => mut(invoke<void>('clear_transactions')),
};
