import { db } from './db/drizzle';
import * as schema from './db/schema';
import { eq, ne, inArray, between, desc, asc } from 'drizzle-orm';
import { create } from 'zustand';

import type { Transaction, Account, Category, MerchantOverride, Budget, CategoryRule } from './types';
import { buildRecurrenceMap, type RecurrenceInfo } from './recurrence';

interface DataState {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  merchantOverrides: MerchantOverride[];
  budgets: Budget[];
  rules: CategoryRule[];
  recurrenceMap: Map<string, RecurrenceInfo>;
  demoRecurrenceMap: Map<string, RecurrenceInfo>;
  isInitialized: boolean;
  isLoading: boolean;
  
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setData: (data: Partial<Omit<DataState, 'init' | 'refresh' | 'setData'>>) => void;
}

export const useDataStore = create<DataState>((set, get) => ({
  transactions: [],
  accounts: [],
  categories: [],
  merchantOverrides: [],
  budgets: [],
  rules: [],
  recurrenceMap: new Map(),
  demoRecurrenceMap: new Map(),
  isInitialized: false,
  isLoading: false,

  init: async () => {
    if (get().isInitialized) return;
    set({ isLoading: true });
    await get().refresh();
    set({ isInitialized: true, isLoading: false });
  },

  refresh: async () => {
    const [txns, accts, cats, overrides, bdgts, rls] = await Promise.all([
      db.select().from(schema.transactions),
      db.select().from(schema.accounts),
      db.select().from(schema.categories).orderBy(asc(schema.categories.sortOrder)),
      db.select().from(schema.merchantOverrides),
      db.select().from(schema.budgets),
      db.select().from(schema.rules),
    ]);

    const realTxns = txns.filter(t => t.source !== 'demo');
    const demoTxns = txns.filter(t => t.source === 'demo');

    const recurrenceMap = buildRecurrenceMap(realTxns, overrides as any);
    const demoRecurrenceMap = buildRecurrenceMap(demoTxns, overrides as any);

    set({
      transactions: txns,
      accounts: accts,
      categories: cats,
      merchantOverrides: overrides as any,
      budgets: bdgts,
      rules: rls,
      recurrenceMap,
      demoRecurrenceMap,
    });
  },

  setData: (data) => set(data),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('db-update', () => {
    const state = useDataStore.getState();
    if (state.isInitialized) {
      state.refresh();
    }
  });
}
