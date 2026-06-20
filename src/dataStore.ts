import { create } from 'zustand';
import { db } from './db';
import type { Transaction, Account, Category, MerchantOverride, Budget, CategoryRule } from './types';

interface DataState {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  merchantOverrides: MerchantOverride[];
  budgets: Budget[];
  rules: CategoryRule[];
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
      db.transactions.toArray(),
      db.accounts.toArray(),
      db.categories.orderBy('sortOrder').toArray(),
      db.merchantOverrides.toArray(),
      db.budgets.toArray(),
      db.rules.toArray(),
    ]);

    set({
      transactions: txns,
      accounts: accts,
      categories: cats,
      merchantOverrides: overrides,
      budgets: bdgts,
      rules: rls,
    });
  },

  setData: (data) => set(data),
}));

// Register Dexie hooks to trigger automatic state refreshes when writes occur
let refreshTimeout: any = null;
const scheduleRefresh = () => {
  if (refreshTimeout) clearTimeout(refreshTimeout);
  refreshTimeout = setTimeout(() => {
    useDataStore.getState().refresh();
  }, 100);
};

// Register hooks for all cached tables
const tablesToHook = [
  db.transactions,
  db.accounts,
  db.categories,
  db.merchantOverrides,
  db.budgets,
  db.rules
];

tablesToHook.forEach((table) => {
  table.hook('creating', scheduleRefresh);
  table.hook('updating', scheduleRefresh);
  table.hook('deleting', scheduleRefresh);
});
