import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '../api';

const BUDGET_EXCLUSIONS_KEY = 'budget_exclusions';

interface PersistedBudgetExclusions {
  excludedMerchants?: string[];
  excludedBudgetCategories?: string[];
}

function persistBudgetExclusionsToDb(
  excludedMerchants: Set<string>,
  excludedBudgetCategories: Set<string>
): void {
  if (typeof api?.putSetting !== 'function') return;
  void api
    .putSetting(BUDGET_EXCLUSIONS_KEY, {
      excludedMerchants: Array.from(excludedMerchants),
      excludedBudgetCategories: Array.from(excludedBudgetCategories),
    })
    .catch(() => {});
}

interface BudgetState {
  excludedMerchants: Set<string>;
  excludedBudgetCategories: Set<string>;
  toggleMerchant: (key: string) => void;
  setMerchantsExcluded: (keys: string[], excluded: boolean) => void;
  toggleBudgetCategory: (category: string) => void;
  reset: () => void;
  syncFromDatabase: () => Promise<void>;
  isExcluded: (key: string) => boolean;
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      excludedMerchants: new Set<string>(),
      excludedBudgetCategories: new Set<string>(),
      toggleMerchant: (key) =>
        set((s) => {
          const next = new Set(s.excludedMerchants);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          persistBudgetExclusionsToDb(next, s.excludedBudgetCategories);
          return { excludedMerchants: next };
        }),
      setMerchantsExcluded: (keys, excluded) =>
        set((s) => {
          const next = new Set(s.excludedMerchants);
          for (const k of keys) {
            if (excluded) next.add(k);
            else next.delete(k);
          }
          persistBudgetExclusionsToDb(next, s.excludedBudgetCategories);
          return { excludedMerchants: next };
        }),
      toggleBudgetCategory: (category) =>
        set((s) => {
          const next = new Set(s.excludedBudgetCategories);
          if (next.has(category)) next.delete(category);
          else next.add(category);
          persistBudgetExclusionsToDb(s.excludedMerchants, next);
          return { excludedBudgetCategories: next };
        }),
      reset: () => {
        const emptyMerchants = new Set<string>();
        const emptyCategories = new Set<string>();
        persistBudgetExclusionsToDb(emptyMerchants, emptyCategories);
        set({
          excludedMerchants: emptyMerchants,
          excludedBudgetCategories: emptyCategories,
        });
      },
      syncFromDatabase: async () => {
        if (typeof api?.getSetting !== 'function') return;
        try {
          const saved = await api.getSetting<PersistedBudgetExclusions>(BUDGET_EXCLUSIONS_KEY);
          if (saved && (Array.isArray(saved.excludedMerchants) || Array.isArray(saved.excludedBudgetCategories))) {
            set({
              excludedMerchants: new Set(saved.excludedMerchants || []),
              excludedBudgetCategories: new Set(saved.excludedBudgetCategories || []),
            });
          } else {
            // One-time migration from localStorage to SQLite if local state has exclusions
            const curr = get();
            if (curr.excludedMerchants.size > 0 || curr.excludedBudgetCategories.size > 0) {
              persistBudgetExclusionsToDb(curr.excludedMerchants, curr.excludedBudgetCategories);
            }
          }
        } catch {
          // Ignore in non-Tauri/unit test environments
        }
      },
      isExcluded: (key) => get().excludedMerchants.has(key),
    }),
    {
      name: 'spending-viz:budget-toggles',
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          try {
            const parsed = JSON.parse(str);
            if (parsed && parsed.state) {
              parsed.state.excludedMerchants = new Set(parsed.state.excludedMerchants || []);
              parsed.state.excludedBudgetCategories = new Set(parsed.state.excludedBudgetCategories || []);
            }
            return parsed;
          } catch {
            return null;
          }
        },
        setItem: (name, newValue) => {
          const toStore = {
            ...newValue,
            state: {
              ...newValue.state,
              excludedMerchants: Array.from(newValue.state.excludedMerchants || []),
              excludedBudgetCategories: Array.from(newValue.state.excludedBudgetCategories || []),
            },
          };
          localStorage.setItem(name, JSON.stringify(toStore));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
);

if (typeof window !== 'undefined') {
  void useBudgetStore.getState().syncFromDatabase();
  window.addEventListener('db-update', () => {
    void useBudgetStore.getState().syncFromDatabase();
  });
}
