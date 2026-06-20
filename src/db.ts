import Dexie, { type Table } from 'dexie';
import { guessTaxFields } from './taxUtils';
import type {
  Account,
  Transaction,
  CategoryRule,
  Category,
  ImportBatch,
  MerchantOverride,
  Budget,
  AppSetting,
  ChatArtifact,
  ChatThread,
  DbChatMessage,
  CsvMapping,
  AppDocument,
} from './types';

class SpendingDB extends Dexie {
  accounts!: Table<Account, number>;
  transactions!: Table<Transaction, number>;
  rules!: Table<CategoryRule, number>;
  categories!: Table<Category, number>;
  imports!: Table<ImportBatch, number>;
  merchantOverrides!: Table<MerchantOverride, string>;
  budgets!: Table<Budget, string>;
  settings!: Table<AppSetting, string>;
  artifacts!: Table<ChatArtifact, string>;
  threads!: Table<ChatThread, string>;
  messages!: Table<DbChatMessage, number>;
  csvMappings!: Table<CsvMapping, number>;
  documents!: Table<AppDocument, string>;
  documentContents!: Table<{ id: string; content: string }, string>;

  constructor() {
    super('spending-viz');
    this.version(1).stores({
      accounts: '++id, &name, source',
      transactions:
        '++id, accountId, date, category, source, merchantKey, &dedupKey, importBatchId',
      rules: '++id, pattern, category, priority',
      categories: '++id, &name, type, sortOrder',
      imports: '++id, importedAt',
    });
    this.version(2).stores({
      merchantOverrides: '&merchantKey',
    });
    this.version(3).stores({
      budgets: '&category',
    });
    this.version(4).stores({
      // Re-declare imports with the new contentHash index. Existing rows have
      // contentHash=undefined (treated as "no fingerprint" — safe).
      imports: '++id, importedAt, contentHash',
      settings: '&key',
    });
    this.version(5).stores({
      artifacts: 'id, type, createdAt',
    });
    this.version(6).stores({
      threads: 'id, title, createdAt, updatedAt',
      messages: '++id, threadId, role, createdAt',
    });
    this.version(7).stores({
      csvMappings: '++id, &headerHash',
    });
    this.version(8).stores({
      transactions:
        '++id, accountId, date, category, source, merchantKey, &dedupKey, importBatchId, recurrence',
    });
    this.version(9).stores({
      documents: 'id, associatedChecklistId, createdAt',
    });
    this.version(10).stores({
      documentContents: 'id'
    });
    this.version(11).stores({
      transactions:
        '++id, accountId, date, category, source, merchantKey, &dedupKey, importBatchId, recurrence, isBusiness, deductionStatus',
    }).upgrade(async (tx) => {
      await tx.table('transactions').toCollection().modify((t) => {
        const guess = guessTaxFields(t.description, t.category);
        t.isBusiness = guess.isBusiness;
        t.taxCategory = guess.taxCategory;
        t.deductionStatus = guess.deductionStatus;
      });
    });
  }
}

export const db = new SpendingDB();

if (typeof window !== 'undefined') {
  (window as any).db = db;
}
