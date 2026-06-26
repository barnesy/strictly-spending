import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../../../db/schema';
import type { FiltersState } from '../../../store';
import type { AIToolContext } from '../index';

export function setupTestDb() {
  const sqlite = new Database(':memory:');
  const db = drizzle(sqlite, { schema });

  sqlite.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      raw_category TEXT,
      category TEXT NOT NULL,
      source TEXT NOT NULL,
      merchant_key TEXT NOT NULL,
      user_overridden INTEGER NOT NULL DEFAULT 0,
      dedup_key TEXT NOT NULL UNIQUE,
      import_batch_id INTEGER,
      recurrence TEXT NOT NULL,
      recurrence_override TEXT,
      is_business INTEGER,
      tax_category TEXT,
      deduction_status TEXT
    );
    CREATE TABLE accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      institution TEXT NOT NULL,
      last4 TEXT,
      source TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      current_balance REAL
    );
    CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      type TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      default_recurrence TEXT
    );
  `);

  return { db, sqlite };
}

export function createMockContext(filters: Partial<FiltersState> = {}): AIToolContext {
  return {
    filters: {
      preset: 'allTime',
      customRange: { start: undefined, end: undefined },
      earliestTransactionDate: '2026-01-01',
      latestTransactionDate: '2026-12-31',
      disabledCategories: [],
      enabledAccountIds: [],
      searchQuery: '',
      minPrice: undefined,
      maxPrice: undefined,
    } as unknown as FiltersState,
    dataStore: {} as any,
    budgetStore: {
      excludedMerchants: [],
      excludedBudgetCategories: []
    }
  };
}
